import UserHandler from './UserHandler.mjs'
import UserDeleter from './UserDeleter.mjs'
import UserGetter from './UserGetter.mjs'
import { User } from '../../models/User.mjs'
import logger from '@superpaper/logger'
import metrics from '@superpaper/metrics'
import AuthenticationManager from '../Authentication/AuthenticationManager.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import { z, parseReq } from '../../infrastructure/Validation.mjs'
import UserAuditLogHandler from './UserAuditLogHandler.mjs'
import UserSessionsManager from './UserSessionsManager.mjs'
import UserUpdater from './UserUpdater.mjs'
import Errors from '../Errors/Errors.js'
import HttpErrorHandler from '../Errors/HttpErrorHandler.mjs'
import OError from '@superpaper/o-error'
import EmailHandler from '../Email/EmailHandler.mjs'
import UrlHelper from '../Helpers/UrlHelper.mjs'
import { promisify } from 'node:util'
import { expressify } from '@superpaper/promise-utils'
import { sanitizeControlCharacters } from '../../infrastructure/Sanitize.mjs'
import { acceptsJson } from '../../infrastructure/RequestContentTypeDetection.mjs'
import Modules from '../../infrastructure/Modules.mjs'
import OneTimeTokenHandler from '../Security/OneTimeTokenHandler.mjs'

async function _sendSecurityAlertClearedSessions(user) {
  const emailOptions = {
    to: user.email,
    actionDescribed: `active sessions were cleared on your account ${user.email}`,
    action: 'active sessions cleared',
  }
  try {
    await EmailHandler.promises.sendEmail('securityAlert', emailOptions)
  } catch (error) {
    // log error when sending security alert email but do not pass back
    logger.error(
      { error, userId: user._id },
      'could not send security alert email when sessions cleared'
    )
  }
}

function _sendSecurityAlertPasswordChanged(user) {
  const emailOptions = {
    to: user.email,
    actionDescribed: `your password has been changed on your account ${user.email}`,
    action: 'password changed',
  }
  EmailHandler.promises
    .sendEmail('securityAlert', emailOptions)
    .catch(error => {
      // log error when sending security alert email but do not pass back
      logger.error(
        { error, userId: user._id },
        'could not send security alert email when password changed'
      )
    })
}

async function changePassword(req, res, next) {
  metrics.inc('user.password-change')
  const userId = SessionManager.getLoggedInUserId(req.session)

  const { user } = await AuthenticationManager.promises.authenticate(
    { _id: userId },
    req.body.currentPassword,
    null,
    { enforceHIBPCheck: false }
  )
  if (!user) {
    return HttpErrorHandler.badRequest(
      req,
      res,
      req.i18n.translate('password_change_old_password_wrong')
    )
  }

  if (req.body.newPassword1 !== req.body.newPassword2) {
    return HttpErrorHandler.badRequest(
      req,
      res,
      req.i18n.translate('password_change_passwords_do_not_match')
    )
  }

  try {
    await AuthenticationManager.promises.setUserPassword(
      user,
      req.body.newPassword1
    )
  } catch (error) {
    if (error.name === 'InvalidPasswordError') {
      const message = AuthenticationManager.getMessageForInvalidPasswordError(
        error,
        req
      )
      return res.status(400).json({ message })
    } else if (error.name === 'PasswordMustBeDifferentError') {
      return HttpErrorHandler.badRequest(
        req,
        res,
        req.i18n.translate('password_change_password_must_be_different')
      )
    } else if (error.name === 'PasswordReusedError') {
      return res.status(400).json({
        message: {
          key: 'password-must-be-strong',
        },
      })
    } else {
      throw error
    }
  }
  await UserAuditLogHandler.promises.addEntry(
    user._id,
    'update-password',
    user._id,
    req.ip
  )

  // no need to wait, errors are logged and not passed back
  _sendSecurityAlertPasswordChanged(user)

  await UserSessionsManager.promises.removeSessionsFromRedis(
    user,
    req.sessionID // remove all sessions except the current session
  )

  await OneTimeTokenHandler.promises.expireAllTokensForUser(
    userId.toString(),
    'password'
  )

  return res.json({
    message: {
      type: 'success',
      email: user.email,
      text: req.i18n.translate('password_change_successful'),
    },
  })
}

async function clearSessions(req, res, next) {
  metrics.inc('user.clear-sessions')
  const userId = SessionManager.getLoggedInUserId(req.session)
  const user = await UserGetter.promises.getUser(userId, { email: 1 })
  const sessions = await UserSessionsManager.promises.getAllUserSessions(user, [
    req.sessionID,
  ])
  await UserAuditLogHandler.promises.addEntry(
    user._id,
    'clear-sessions',
    user._id,
    req.ip,
    { sessions }
  )
  await UserSessionsManager.promises.removeSessionsFromRedis(
    user,
    req.sessionID // remove all sessions except the current session
  )

  await _sendSecurityAlertClearedSessions(user)

  res.sendStatus(201)
}

async function tryDeleteUser(req, res, next) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const { password } = req.body
  req.logger.addFields({ userId })

  logger.debug({ userId }, 'trying to delete user account')
  if (password == null || password === '') {
    logger.err({ userId }, 'no password supplied for attempt to delete account')
    return res.sendStatus(403)
  }

  let user
  try {
    user = (
      await AuthenticationManager.promises.authenticate(
        { _id: userId },
        password,
        null,
        { enforceHIBPCheck: false }
      )
    ).user
  } catch (err) {
    throw OError.tag(
      err,
      'error authenticating during attempt to delete account',
      { userId }
    )
  }

  if (!user) {
    logger.err({ userId }, 'auth failed during attempt to delete account')
    return res.sendStatus(403)
  }

  try {
    await UserDeleter.promises.deleteUser(userId, {
      deleterUser: user,
      ipAddress: req.ip,
    })
  } catch (err) {
    const errorData = {
      message: 'error while deleting user account',
      info: { userId },
    }
    throw OError.tag(err, errorData.message, errorData.info)
  }

  await Modules.promises.hooks.fire('tryDeleteV1Account', user)

  const sessionId = req.sessionID

  if (typeof req.logout === 'function') {
    const logout = promisify(req.logout)
    await logout()
  }

  const destroySession = promisify(req.session.destroy.bind(req.session))
  await destroySession()

  UserSessionsManager.promises.untrackSession(user, sessionId).catch(err => {
    logger.warn({ err, userId: user._id }, 'failed to untrack session')
  })
  res.sendStatus(200)
}

const updateUserSettingsSchema = z.object({
  body: z
    .object({
      first_name: z.string().max(255).nullish(),
      last_name: z.string().max(255).nullish(),
    })
    .passthrough(),
  // TODO: complete the schema and remove the passthrough
})

async function updateUserSettings(req, res, next) {
  const { body } = parseReq(req, updateUserSettingsSchema)
  const userId = SessionManager.getLoggedInUserId(req.session)
  req.logger.addFields({ userId })

  const user = await User.findById(userId).exec()
  if (user == null) {
    throw new OError('problem updating user settings', { userId })
  }

  if (typeof body.first_name === 'string') {
    user.first_name = sanitizeControlCharacters(body.first_name).trim()
  }
  if (typeof body.last_name === 'string') {
    user.last_name = sanitizeControlCharacters(body.last_name).trim()
  }
  if (typeof body.role === 'string') {
    user.role = sanitizeControlCharacters(body.role).trim()
  }
  if (body.mode != null) {
    user.ace.mode = body.mode
  }
  if (body.editorTheme != null) {
    user.ace.theme = body.editorTheme
  }
  if (body.editorLightTheme != null) {
    user.ace.lightTheme = body.editorLightTheme
  }
  if (body.editorDarkTheme != null) {
    user.ace.darkTheme = body.editorDarkTheme
  }
  if (body.overallTheme != null) {
    user.ace.overallTheme = body.overallTheme
  }
  if (body.fontSize != null) {
    user.ace.fontSize = body.fontSize
  }
  if (body.autoComplete != null) {
    user.ace.autoComplete = body.autoComplete
  }
  if (body.autoPairDelimiters != null) {
    user.ace.autoPairDelimiters = body.autoPairDelimiters
  }
  if (body.spellCheckLanguage != null) {
    user.ace.spellCheckLanguage = body.spellCheckLanguage
  }
  if (body.pdfViewer != null) {
    user.ace.pdfViewer = body.pdfViewer
  }
  if (body.syntaxValidation != null) {
    user.ace.syntaxValidation = body.syntaxValidation
  }
  if (body.previewTabs != null) {
    user.ace.previewTabs = Boolean(body.previewTabs)
  }
  if (body.fontFamily != null) {
    user.ace.fontFamily = body.fontFamily
  }
  if (body.lineHeight != null) {
    user.ace.lineHeight = body.lineHeight
  }
  if (body.mathPreview != null) {
    user.ace.mathPreview = body.mathPreview
  }
  if (body.breadcrumbs != null) {
    user.ace.breadcrumbs = Boolean(body.breadcrumbs)
  }
  if (body.nonBlinkingCursor != null) {
    user.ace.nonBlinkingCursor = Boolean(body.nonBlinkingCursor)
  }
  if (body.referencesSearchMode != null) {
    const mode = body.referencesSearchMode === 'simple' ? 'simple' : 'advanced'
    user.ace.referencesSearchMode = mode
  }
  if (body.darkModePdf != null) {
    user.ace.darkModePdf = Boolean(body.darkModePdf)
  }
  await user.save()

  const newEmail = body.email?.trim().toLowerCase()
  if (newEmail == null || newEmail === user.email) {
    // end here, don't update email
    SessionManager.setInSessionUser(req.session, {
      first_name: user.first_name,
      last_name: user.last_name,
    })
    res.sendStatus(200)
  } else if (newEmail.indexOf('@') === -1) {
    // email invalid
    res.sendStatus(400)
  } else {
    // update the user email
    const auditLog = {
      initiatorId: userId,
      ipAddress: req.ip,
    }

    try {
      await UserUpdater.promises.changeEmailAddress(userId, newEmail, auditLog)
    } catch (err) {
      if (err instanceof Errors.EmailExistsError) {
        const translation = req.i18n.translate('email_already_registered')
        return HttpErrorHandler.conflict(req, res, translation)
      } else {
        return HttpErrorHandler.legacyInternal(
          req,
          res,
          req.i18n.translate('problem_changing_email_address'),
          OError.tag(err, 'problem_changing_email_address', {
            userId,
            newEmail,
          })
        )
      }
    }

    const user = await User.findById(userId).exec()
    SessionManager.setInSessionUser(req.session, {
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    })

    try {
      await UserHandler.promises.populateTeamInvites(user)
    } catch (err) {
      logger.error({ err }, 'error populateTeamInvites')
    }

    res.sendStatus(200)
  }
}

async function doLogout(req) {
  metrics.inc('user.logout')
  const user = SessionManager.getSessionUser(req.session)
  logger.debug({ user }, 'logging out')
  const sessionId = req.sessionID

  if (user != null) {
    UserAuditLogHandler.addEntryInBackground(
      user._id,
      'logout',
      user._id,
      req.ip,
      {}
    )
  }

  if (typeof req.logout === 'function') {
    // passport logout
    const logout = promisify(req.logout.bind(req))
    await logout()
  }

  const destroySession = promisify(req.session.destroy.bind(req.session))
  await destroySession()

  if (user != null) {
    UserSessionsManager.promises.untrackSession(user, sessionId).catch(err => {
      logger.warn({ err, userId: user._id }, 'failed to untrack session')
    })
  }
}

async function logout(req, res, next) {
  const requestedRedirect = req.body.redirect
    ? UrlHelper.getSafeRedirectPath(req.body.redirect)
    : undefined
  const redirectUrl = requestedRedirect || '/login'

  await doLogout(req)

  if (acceptsJson(req)) {
    res.status(200).json({ redir: redirectUrl })
  } else {
    res.redirect(redirectUrl)
  }
}

async function expireDeletedUser(req, res, next) {
  const userId = req.params.userId
  await UserDeleter.promises.expireDeletedUser(userId)
  res.sendStatus(204)
}

async function expireDeletedUsersAfterDuration(req, res, next) {
  await UserDeleter.promises.expireDeletedUsersAfterDuration()
  res.sendStatus(204)
}

export default {
  clearSessions: expressify(clearSessions),
  changePassword: expressify(changePassword),
  tryDeleteUser: expressify(tryDeleteUser),
  updateUserSettings: expressify(updateUserSettings),
  logout: expressify(logout),
  expireDeletedUser: expressify(expireDeletedUser),
  expireDeletedUsersAfterDuration: expressify(expireDeletedUsersAfterDuration),
}
