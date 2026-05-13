import UserGetter from './UserGetter.mjs'
import OError from '@superpaper/o-error'
import UserSessionsManager from './UserSessionsManager.mjs'
import logger from '@superpaper/logger'
import Settings from '@superpaper/settings'
import AuthenticationController from '../Authentication/AuthenticationController.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import _ from 'lodash'
import { expressify } from '@superpaper/promise-utils'
import Modules from '../../infrastructure/Modules.mjs'

async function settingsPage(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  let shouldAllowEditingDetails = true

  const user = await UserGetter.promises.getUser(userId)
  if (!user) {
    // The user has just deleted their account.
    return UserSessionsManager.removeSessionsFromRedis(
      { _id: userId },
      null,
      () => res.redirect('/')
    )
  }

  let personalAccessTokens
  try {
    const results = await Modules.promises.hooks.fire(
      'listPersonalAccessTokens',
      user._id
    )
    personalAccessTokens = results?.[0] ?? []
  } catch (error) {
    const err = OError.tag(error, 'listPersonalAccessTokens hook failed')
    logger.error({ err, userId }, err.message)
  }

  res.render('user/settings', {
    title: 'account_settings',
    user: {
      id: user._id,
      isAdmin: user.isAdmin,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      alphaProgram: user.alphaProgram,
      labsProgram: user.labsProgram,
      features: {
        dropbox: user.features.dropbox,
        github: user.features.github,
        references: user.features.references,
      },
    },
    showAiFeatures: Boolean(user.aiFeatures?.enabled),
    labsExperiments: user.labsExperiments ?? [],
    hasPassword: !!user.hashedPassword,
    shouldAllowEditingDetails,
    personalAccessTokens,
    emailAddressLimit: Settings.emailAddressLimit,
    userRestrictions: Array.from(req.userRestrictions || []),
    gitBridgeEnabled: Settings.enableGitBridge,
    capabilities: [...req.capabilitySet],
  })
}

async function accountSuspended(req, res) {
  if (SessionManager.isUserLoggedIn(req.session)) {
    return res.redirect('/project')
  }
  res.render('user/accountSuspended', {
    title: 'your_account_is_suspended',
  })
}

async function logout(req, res) {
  const isLoggedIn = SessionManager.isUserLoggedIn(req.session)
  if (!isLoggedIn) {
    return res.redirect('/')
  }
  res.render('user/logout')
}

async function reconfirmAccountPage(req, res) {
  const pageData = {
    reconfirm_email: req.session.reconfirm_email,
  }

  res.render('user/reconfirm', pageData)
}

const UserPagesController = {
  accountSuspended: expressify(accountSuspended),
  logout: expressify(logout),

  registerPage(req, res) {
    const sharedProjectData = req.session.sharedProjectData || {}

    const newTemplateData = {}
    if (req.session.templateData != null) {
      newTemplateData.templateName = req.session.templateData.templateName
    }

    res.render('user/register', {
      title: 'register',
      sharedProjectData,
      newTemplateData,
    })
  },

  loginPage(req, res) {
    // if user is being sent to /login with explicit redirect (redir=/foo),
    // such as being sent from the editor to /login, then set the redirect explicitly
    if (
      req.query.redir != null &&
      AuthenticationController.getRedirectFromSession(req) == null
    ) {
      AuthenticationController.setRedirectInSession(req, req.query.redir)
    }
    const metadata = { robotsNoindexNofollow: false }
    if (Object.keys(req.query).length !== 0) {
      metadata.robotsNoindexNofollow = true
    }
    res.render('user/login', {
      title: Settings.nav?.login_support_title || 'login',
      login_support_title: Settings.nav?.login_support_title,
      login_support_text: Settings.nav?.login_support_text,
      metadata,
    })
  },

  /**
   * Landing page for users who may have received one-time login
   * tokens from the read-only maintenance site.
   *
   * We tell them that superPaper is back up and that they can login normally.
   */
  oneTimeLoginPage(req, res, next) {
    res.render('user/one_time_login')
  },

  renderReconfirmAccountPage: expressify(reconfirmAccountPage),

  settingsPage: expressify(settingsPage),

  sessionsPage(req, res, next) {
    const user = SessionManager.getSessionUser(req.session)
    logger.debug({ userId: user._id }, 'loading sessions page')
    const currentSession = {
      ip_address: user.ip_address,
      session_created: user.session_created,
    }
    UserSessionsManager.getAllUserSessions(
      user,
      [req.sessionID],
      (err, sessions) => {
        if (err != null) {
          OError.tag(err, 'error getting all user sessions', {
            userId: user._id,
          })
          return next(err)
        }
        res.render('user/sessions', {
          title: 'sessions',
          currentSession,
          sessions,
        })
      }
    )
  },

  async compromisedPasswordPage(req, res) {
    res.render('user/compromised_password')
  },

}

export default UserPagesController
