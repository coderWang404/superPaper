import _ from 'lodash'
import settings from '@superpaper/settings'
import moment from 'moment'
import EmailMessageHelper from './EmailMessageHelper.mjs'
import StringHelper from '../Helpers/StringHelper.mjs'
import BaseEmailLayout from './Layouts/BaseEmailLayout.mjs'
import SpamSafe from './SpamSafe.mjs'
import ctaEmailBody from './Bodies/cta-email.mjs'
import NoCTAEmailBody from './Bodies/NoCTAEmailBody.mjs'

function _emailBodyPlainText(content, opts, ctaEmail) {
  let emailBody = `${content.greeting(opts, true)}`
  emailBody += `\r\n\r\n`
  emailBody += `${content.message(opts, true).join('\r\n\r\n')}`

  if (ctaEmail) {
    emailBody += `\r\n\r\n`
    emailBody += `${content.ctaText(opts, true)}: ${content.ctaURL(opts, true)}`
  }

  if (
    content.secondaryMessage(opts, true) &&
    content.secondaryMessage(opts, true).length > 0
  ) {
    emailBody += `\r\n\r\n`
    emailBody += `${content.secondaryMessage(opts, true).join('\r\n\r\n')}`
  }

  emailBody += `\r\n\r\n`
  emailBody += `Regards,\r\nThe ${settings.appName} Team - ${settings.siteUrl}`

  if (
    settings.email &&
    settings.email.template &&
    settings.email.template.customFooter
  ) {
    emailBody += `\r\n\r\n`
    emailBody += settings.email.template.customFooter
  }

  const footerMessage = content.footerMessage(opts, true)
  if (footerMessage) {
    emailBody += `\r\n\r\n`
    emailBody += footerMessage
  }

  return emailBody
}

function ctaTemplate(content) {
  if (
    !content.ctaURL ||
    !content.ctaText ||
    !content.message ||
    !content.subject
  ) {
    throw new Error('missing required CTA email content')
  }
  if (!content.title) {
    content.title = () => {}
  }
  if (!content.greeting) {
    content.greeting = () => 'Hi,'
  }
  if (!content.secondaryMessage) {
    content.secondaryMessage = () => []
  }
  if (!content.gmailGoToAction) {
    content.gmailGoToAction = () => {}
  }
  if (!content.footerMessage) {
    content.footerMessage = () => {}
  }
  return {
    subject(opts) {
      return content.subject(opts)
    },
    layout: BaseEmailLayout,
    footerMessage(opts) {
      return content.footerMessage(opts)
    },
    plainTextTemplate(opts) {
      return _emailBodyPlainText(content, opts, true)
    },
    compiledTemplate(opts) {
      return ctaEmailBody({
        title: content.title(opts),
        greeting: content.greeting(opts),
        message: content.message(opts),
        secondaryMessage: content.secondaryMessage(opts),
        ctaText: content.ctaText(opts),
        ctaURL: content.ctaURL(opts),
        gmailGoToAction: content.gmailGoToAction(opts),
        StringHelper,
      })
    },
  }
}

function NoCTAEmailTemplate(content) {
  if (content.greeting == null) {
    content.greeting = () => 'Hi,'
  }
  if (!content.message) {
    throw new Error('missing message')
  }
  return {
    subject(opts) {
      return content.subject(opts)
    },
    layout: BaseEmailLayout,
    plainTextTemplate(opts) {
      return `\
${content.greeting(opts)}

${content.message(opts, true).join('\r\n\r\n')}

Regards,
The ${settings.appName} Team - ${settings.siteUrl}\
      `
    },
    compiledTemplate(opts) {
      return NoCTAEmailBody({
        title:
          typeof content.title === 'function' ? content.title(opts) : undefined,
        greeting: content.greeting(opts),
        highlightedText:
          typeof content.highlightedText === 'function'
            ? content.highlightedText(opts)
            : undefined,
        message: content.message(opts),
        StringHelper,
      })
    },
  }
}

function buildEmail(templateName, opts) {
  const template = templates[templateName]
  opts.siteUrl = settings.siteUrl
  opts.body = template.compiledTemplate(opts)
  opts.footerMessage = template.footerMessage
    ? template.footerMessage(opts)
    : ''
  return {
    subject: template.subject(opts),
    html: template.layout(opts),
    text: template.plainTextTemplate && template.plainTextTemplate(opts),
  }
}

const templates = {}

templates.registered = ctaTemplate({
  subject() {
    return `Activate your ${settings.appName} Account`
  },
  message(opts) {
    return [
      `Congratulations, you've just had an account created for you on ${
        settings.appName
      } with the email address '${_.escape(opts.to)}'.`,
      'Click here to set your password and log in:',
    ]
  },
  secondaryMessage() {
    return [
      `If you have any questions or problems, please contact ${settings.adminEmail}`,
    ]
  },
  ctaText() {
    return 'Set password'
  },
  ctaURL(opts) {
    return opts.setNewPasswordUrl
  },
})

templates.passwordResetRequested = ctaTemplate({
  subject() {
    return `Password Reset - ${settings.appName}`
  },
  title() {
    return 'Password Reset'
  },
  message() {
    return [`We got a request to reset your ${settings.appName} password.`]
  },
  secondaryMessage() {
    return [
      "If you ignore this message, your password won't be changed.",
      "If you didn't request a password reset, let us know.",
    ]
  },
  ctaText() {
    return 'Reset password'
  },
  ctaURL(opts) {
    return opts.setNewPasswordUrl
  },
})

templates.confirmEmail = ctaTemplate({
  subject() {
    return `Confirm email - ${settings.appName}`
  },
  title() {
    return 'Confirm email'
  },
  message(opts) {
    return [
      `Please confirm that you have added a new email, ${opts.to}, to your ${settings.appName} account.`,
    ]
  },
  secondaryMessage() {
    return [
      `If you did not request this, please let us know at <a href="mailto:${settings.adminEmail}">${settings.adminEmail}</a>.`,
      `If you have any questions or trouble confirming your email address, please get in touch with our support team at ${settings.adminEmail}.`,
    ]
  },
  ctaText() {
    return 'Confirm email'
  },
  ctaURL(opts) {
    return opts.confirmEmailUrl
  },
})

templates.confirmCode = NoCTAEmailTemplate({
  greeting(opts) {
    return ''
  },
  subject(opts) {
    return `Confirm your email address on superPaper (${opts.confirmCode})`
  },
  title(opts) {
    return 'Confirm your email address'
  },
  message(opts, isPlainText) {
    const msg = opts.welcomeUser
      ? [
          `Welcome to superPaper! We're so glad you joined us.`,
          'Use this 6-digit confirmation code to finish your setup.',
        ]
      : ['Use this 6-digit code to confirm your email address.']

    if (isPlainText && opts.confirmCode) {
      msg.push(opts.confirmCode)
    }
    return msg
  },
  highlightedText(opts) {
    return opts.confirmCode
  },
})

templates.projectInvite = ctaTemplate({
  subject(opts) {
    const safeName = SpamSafe.isSafeProjectName(opts.project.name)
    const safeEmail = SpamSafe.isSafeEmail(opts.owner.email)

    if (safeName && safeEmail) {
      return `"${opts.project.name}" — shared by ${_.escape(opts.owner.email)}`
    }
    if (safeName) {
      return `${settings.appName} project shared with you — "${_.escape(
        opts.project.name
      )}"`
    }
    if (safeEmail) {
      return `${_.escape(opts.owner.email)} shared an ${
        settings.appName
      } project with you`
    }

    return `An ${settings.appName} project has been shared with you`
  },
  title(opts) {
    return 'Project Invite'
  },
  greeting(opts) {
    return ''
  },
  message(opts, isPlainText) {
    // build message depending on spam-safe variables
    const message = [`You have been invited to an ${settings.appName} project.`]

    if (SpamSafe.isSafeProjectName(opts.project.name)) {
      message.push('<br/> Project:')
      message.push(`<b>${_.escape(opts.project.name)}</b>`)
    }

    if (SpamSafe.isSafeEmail(opts.owner.email)) {
      message.push(`<br/> Shared by:`)
      message.push(`<b>${_.escape(opts.owner.email)}</b>`)
    }

    if (message.length === 1) {
      message.push('<br/> Please view the project to find out more.')
    }

    return message.map(m => {
      return EmailMessageHelper.cleanHTML(m, isPlainText)
    })
  },
  ctaText() {
    return 'View project'
  },
  ctaURL(opts) {
    return opts.inviteUrl
  },
  gmailGoToAction(opts) {
    return {
      target: opts.inviteUrl,
      name: 'View project',
      description: `Join ${_.escape(
        SpamSafe.safeProjectName(opts.project.name, 'project')
      )} at ${settings.appName}`,
    }
  },
})

templates.reconfirmEmail = ctaTemplate({
  subject() {
    return `Reconfirm Email - ${settings.appName}`
  },
  title() {
    return 'Reconfirm Email'
  },
  message(opts) {
    return [
      `Please reconfirm your email address, ${opts.to}, on your ${settings.appName} account.`,
    ]
  },
  secondaryMessage() {
    return [
      'If you did not request this, you can simply ignore this message.',
      `If you have any questions or trouble confirming your email address, please get in touch with our support team at ${settings.adminEmail}.`,
    ]
  },
  ctaText() {
    return 'Reconfirm Email'
  },
  ctaURL(opts) {
    return opts.confirmEmailUrl
  },
})

templates.testEmail = ctaTemplate({
  subject() {
    return `A Test Email from ${settings.appName}`
  },
  title() {
    return `A Test Email from ${settings.appName}`
  },
  greeting() {
    return 'Hi,'
  },
  message() {
    return [`This is a test Email from ${settings.appName}`]
  },
  ctaText() {
    return `Open ${settings.appName}`
  },
  ctaURL() {
    return settings.siteUrl
  },
})

templates.ownershipTransferConfirmationPreviousOwner = NoCTAEmailTemplate({
  subject(opts) {
    return `Project ownership transfer - ${settings.appName}`
  },
  title(opts) {
    const projectName = _.escape(
      SpamSafe.safeProjectName(opts.project.name, 'Your project')
    )
    return `${projectName} - Owner change`
  },
  message(opts, isPlainText) {
    const nameAndEmail = _.escape(
      _formatUserNameAndEmail(opts.newOwner, 'a collaborator')
    )
    const projectName = _.escape(
      SpamSafe.safeProjectName(opts.project.name, 'your project')
    )
    const projectNameDisplay = isPlainText
      ? projectName
      : `<b>${projectName}</b>`
    return [
      `As per your request, we have made ${nameAndEmail} the owner of ${projectNameDisplay}.`,
      `If you haven't asked to change the owner of ${projectNameDisplay}, please get in touch with us via ${settings.adminEmail}.`,
    ]
  },
})

templates.ownershipTransferConfirmationNewOwner = ctaTemplate({
  subject(opts) {
    return `Project ownership transfer - ${settings.appName}`
  },
  title(opts) {
    const projectName = _.escape(
      SpamSafe.safeProjectName(opts.project.name, 'Your project')
    )
    return `${projectName} - Owner change`
  },
  message(opts, isPlainText) {
    const nameAndEmail = _.escape(
      _formatUserNameAndEmail(opts.previousOwner, 'A collaborator')
    )
    const projectName = _.escape(
      SpamSafe.safeProjectName(opts.project.name, 'a project')
    )
    const projectNameEmphasized = isPlainText
      ? projectName
      : `<b>${projectName}</b>`
    return [
      `${nameAndEmail} has made you the owner of ${projectNameEmphasized}. You can now manage ${projectName} sharing settings.`,
    ]
  },
  ctaText(opts) {
    return 'View project'
  },
  ctaURL(opts) {
    const projectUrl = `${
      settings.siteUrl
    }/project/${opts.project._id.toString()}`
    return projectUrl
  },
})

templates.securityAlert = NoCTAEmailTemplate({
  subject(opts) {
    return `superPaper security note: ${opts.action}`
  },
  title(opts) {
    return opts.action.charAt(0).toUpperCase() + opts.action.slice(1)
  },
  message(opts, isPlainText) {
    const dateFormatted = moment().format('dddd D MMMM YYYY')
    const timeFormatted = moment().format('HH:mm')
    const helpLink = EmailMessageHelper.displayLink(
      'quick guide',
      `${settings.siteUrl}/learn/how-to/Keeping_your_account_secure`,
      isPlainText
    )

    const actionDescribed = EmailMessageHelper.cleanHTML(
      opts.actionDescribed,
      isPlainText
    )

    if (!opts.message) {
      opts.message = []
    }
    const message = opts.message.map(m => {
      return EmailMessageHelper.cleanHTML(m, isPlainText)
    })

    return [
      `We are writing to let you know that ${actionDescribed} on ${dateFormatted} at ${timeFormatted} GMT.`,
      ...message,
      `If this was you, you can ignore this email.`,
      `If this was not you, we recommend getting in touch with our support team at ${settings.adminEmail} to report this as potentially suspicious activity on your account.`,
      `We also encourage you to read our ${helpLink} to keeping your ${settings.appName} account safe.`,
    ]
  },
})

templates.welcome = ctaTemplate({
  subject() {
    return `Welcome to ${settings.appName}`
  },
  title() {
    return `Welcome to ${settings.appName}`
  },
  greeting() {
    return 'Hi,'
  },
  message(opts, isPlainText) {
    const logInAgainDisplay = EmailMessageHelper.displayLink(
      'log in again',
      `${settings.siteUrl}/login`,
      isPlainText
    )
    const helpGuidesDisplay = EmailMessageHelper.displayLink(
      'Help Guides',
      `${settings.siteUrl}/learn`,
      isPlainText
    )
    const templatesDisplay = EmailMessageHelper.displayLink(
      'Templates',
      `${settings.siteUrl}/templates`,
      isPlainText
    )

    return [
      `Thanks for signing up to ${settings.appName}! If you ever get lost, you can ${logInAgainDisplay} with the email address '${opts.to}'.`,
      `If you're new to LaTeX, take a look at our ${helpGuidesDisplay} and ${templatesDisplay}.`,
      `Please also take a moment to confirm your email address for ${settings.appName}:`,
    ]
  },
  secondaryMessage() {
    return [
      `PS. We love talking to our users about ${settings.appName}. Reply to this email to get in touch with us directly, whatever the reason. Questions, comments, problems, suggestions, all welcome!`,
    ]
  },
  ctaText() {
    return 'Confirm email'
  },
  ctaURL(opts) {
    return opts.confirmEmailUrl
  },
})

templates.welcomeWithoutCTA = NoCTAEmailTemplate({
  subject() {
    return `Welcome to ${settings.appName}`
  },
  title() {
    return `Welcome to ${settings.appName}`
  },
  greeting() {
    return 'Hi,'
  },
  message(opts, isPlainText) {
    const logInAgainDisplay = EmailMessageHelper.displayLink(
      'log in again',
      `${settings.siteUrl}/login`,
      isPlainText
    )
    const helpGuidesDisplay = EmailMessageHelper.displayLink(
      'Help Guides',
      `${settings.siteUrl}/learn`,
      isPlainText
    )
    const templatesDisplay = EmailMessageHelper.displayLink(
      'Templates',
      `${settings.siteUrl}/templates`,
      isPlainText
    )

    return [
      `Thanks for signing up to ${settings.appName}! If you ever get lost, you can ${logInAgainDisplay} with the email address '${opts.to}'.`,
      `If you're new to LaTeX, take a look at our ${helpGuidesDisplay} and ${templatesDisplay}.`,
      `PS. We love talking to our users about ${settings.appName}. Reply to this email to get in touch with us directly, whatever the reason. Questions, comments, problems, suggestions, all welcome!`,
    ]
  },
})

function _formatUserNameAndEmail(user, placeholder) {
  if (user.first_name && user.last_name) {
    const fullName = `${user.first_name} ${user.last_name}`
    if (SpamSafe.isSafeUserName(fullName)) {
      if (SpamSafe.isSafeEmail(user.email)) {
        return `${fullName} (${user.email})`
      } else {
        return fullName
      }
    }
  }
  return SpamSafe.safeEmail(user.email, placeholder)
}

export default {
  templates,
  ctaTemplate,
  NoCTAEmailTemplate,
  buildEmail,
}
