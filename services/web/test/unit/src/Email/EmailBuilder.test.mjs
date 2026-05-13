import { vi, expect } from 'vitest'
import cheerio from 'cheerio'
import path from 'node:path'

import EmailMessageHelper from '../../../../app/src/Features/Email/EmailMessageHelper.mjs'
import ctaEmailBody from '../../../../app/src/Features/Email/Bodies/cta-email.mjs'
import NoCTAEmailBody from '../../../../app/src/Features/Email/Bodies/NoCTAEmailBody.mjs'
import BaseEmailLayout from '../../../../app/src/Features/Email/Layouts/BaseEmailLayout.mjs'

const MODULE_PATH = path.join(
  import.meta.dirname,
  '../../../../app/src/Features/Email/EmailBuilder'
)

describe('EmailBuilder', function () {
  beforeEach(async function (ctx) {
    ctx.settings = {
      appName: 'testApp',
      siteUrl: 'https://www.superpaper.com',
    }

    vi.doMock('../../../../app/src/Features/Email/EmailMessageHelper', () => ({
      default: EmailMessageHelper,
    }))

    vi.doMock('../../../../app/src/Features/Email/Bodies/cta-email', () => ({
      default: ctaEmailBody,
    }))

    vi.doMock(
      '../../../../app/src/Features/Email/Bodies/NoCTAEmailBody',
      () => ({
        default: NoCTAEmailBody,
      })
    )

    vi.doMock(
      '../../../../app/src/Features/Email/Layouts/BaseEmailLayout',
      () => ({
        default: BaseEmailLayout,
      })
    )

    vi.doMock('@superpaper/settings', () => ({
      default: ctx.settings,
    }))

    ctx.EmailBuilder = (await import(MODULE_PATH)).default
  })

  describe('projectInvite', function () {
    beforeEach(function (ctx) {
      ctx.opts = {
        to: 'bob@bob.com',
        first_name: 'bob',
        owner: {
          email: 'sally@hally.com',
        },
        inviteUrl: 'http://example.com/invite',
        project: {
          url: 'http://www.project.com',
          name: 'standard project',
        },
      }
    })

    describe('when sending a normal email', function () {
      beforeEach(function (ctx) {
        ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)
      })

      it('should have html and text properties', function (ctx) {
        expect(ctx.email.html != null).to.equal(true)
        expect(ctx.email.text != null).to.equal(true)
      })

      it('should not have undefined in it', function (ctx) {
        ctx.email.html.indexOf('undefined').should.equal(-1)
        ctx.email.subject.indexOf('undefined').should.equal(-1)
      })
    })

    describe('when dealing with escaping', function () {
      it("should not show possessive 's as &#39;", function (ctx) {
        ctx.opts.project.name = "Aktöbe's project"
        ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)
        expect(ctx.email.subject).to.not.contain('&#39;')
        expect(ctx.email.subject).to.contain(ctx.opts.project.name)
      })

      it('should not show an ampersand as &amp;', function (ctx) {
        ctx.opts.project.name = 'Aktöbe & Almaty project'
        ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)
        expect(ctx.email.subject).to.not.contain('&amp;')
        expect(ctx.email.subject).to.contain(ctx.opts.project.name)
      })

      it('should prevent dangerous characters as project names', function (ctx) {
        const characters = ['""', '<>', '//']
        for (const pair of characters) {
          ctx.opts.project.name = `${pair} project`
          ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)
          expect(ctx.email.subject).to.not.contain(pair)
        }
      })
    })

    describe('when someone is up to no good', function () {
      it('should not contain the project name at all if unsafe', function (ctx) {
        ctx.opts.project.name = "<img src='http://evilsite.com/evil.php'>"
        ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)
        expect(ctx.email.html).to.not.contain('evilsite.com')
        expect(ctx.email.subject).to.not.contain('evilsite.com')

        // but email should appear
        expect(ctx.email.html).to.contain(ctx.opts.owner.email)
        expect(ctx.email.subject).to.contain(ctx.opts.owner.email)
      })

      it('should not contain the inviter email at all if unsafe', function (ctx) {
        ctx.opts.owner.email =
          'verylongemailaddressthatwillfailthecheck@longdomain.domain'
        ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)

        expect(ctx.email.html).to.not.contain(ctx.opts.owner.email)
        expect(ctx.email.subject).to.not.contain(ctx.opts.owner.email)

        // but title should appear
        expect(ctx.email.html).to.contain(ctx.opts.project.name)
        expect(ctx.email.subject).to.contain(ctx.opts.project.name)
      })

      it('should handle both email and title being unsafe', function (ctx) {
        ctx.opts.project.name = "<img src='http://evilsite.com/evil.php'>"
        ctx.opts.owner.email =
          'verylongemailaddressthatwillfailthecheck@longdomain.domain'
        ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)

        expect(ctx.email.html).to.not.contain('evilsite.com')
        expect(ctx.email.subject).to.not.contain('evilsite.com')
        expect(ctx.email.html).to.not.contain(ctx.opts.owner.email)
        expect(ctx.email.subject).to.not.contain(ctx.opts.owner.email)

        expect(ctx.email.html).to.contain(
          'Please view the project to find out more'
        )
      })
    })
  })

  describe('SpamSafe', function () {
    beforeEach(function (ctx) {
      ctx.opts = {
        to: 'bob@joe.com',
        first_name: 'bob',
        newOwner: {
          email: 'sally@hally.com',
        },
        inviteUrl: 'http://example.com/invite',
        project: {
          url: 'http://www.project.com',
          name: 'come buy my product at http://notascam.com',
        },
      }
      ctx.email = ctx.EmailBuilder.buildEmail(
        'ownershipTransferConfirmationPreviousOwner',
        ctx.opts
      )
    })

    it('should replace spammy project name', function (ctx) {
      ctx.email.html.indexOf('your project').should.not.equal(-1)
    })
  })

  describe('ctaTemplate', function () {
    describe('missing required content', function () {
      const content = {
        title: () => {},
        greeting: () => {},
        message: () => {},
        secondaryMessage: () => {},
        ctaText: () => {},
        ctaURL: () => {},
        gmailGoToAction: () => {},
      }
      it('should throw an error when missing title', function (ctx) {
        const { title, ...missing } = content
        expect(() => {
          ctx.EmailBuilder.ctaTemplate(missing)
        }).to.throw(Error)
      })
      it('should throw an error when missing message', function (ctx) {
        const { message, ...missing } = content
        expect(() => {
          ctx.EmailBuilder.ctaTemplate(missing)
        }).to.throw(Error)
      })
      it('should throw an error when missing ctaText', function (ctx) {
        const { ctaText, ...missing } = content
        expect(() => {
          ctx.EmailBuilder.ctaTemplate(missing)
        }).to.throw(Error)
      })
      it('should throw an error when missing ctaURL', function (ctx) {
        const { ctaURL, ...missing } = content
        expect(() => {
          ctx.EmailBuilder.ctaTemplate(missing)
        }).to.throw(Error)
      })
    })

    describe('footerMessage', function () {
      it('should default footerMessage to undefined when not provided', function (ctx) {
        const template = ctx.EmailBuilder.ctaTemplate({
          subject: () => 'Subject',
          message: () => ['Message'],
          ctaText: () => 'Click',
          ctaURL: () => 'https://example.com',
        })
        expect(template.footerMessage({})).to.be.undefined
      })

      it('should use the provided footerMessage callback', function (ctx) {
        const template = ctx.EmailBuilder.ctaTemplate({
          subject: () => 'Subject',
          message: () => ['Message'],
          ctaText: () => 'Click',
          ctaURL: () => 'https://example.com',
          footerMessage: () => 'Custom footer text',
        })
        expect(template.footerMessage({})).to.equal('Custom footer text')
      })

      it('should include footerMessage in plain text output when provided', function (ctx) {
        ctx.EmailBuilder.templates.testFooterTemplate =
          ctx.EmailBuilder.ctaTemplate({
            subject: () => 'Test Subject',
            message: () => ['Body message'],
            ctaText: () => 'Go',
            ctaURL: () => 'https://example.com',
            footerMessage: (opts, isPlainText) =>
              isPlainText ? 'Plain footer' : '<b>HTML footer</b>',
          })
        const email = ctx.EmailBuilder.buildEmail('testFooterTemplate', {
          to: 'test@example.com',
        })
        expect(email.text).to.contain('Plain footer')
        delete ctx.EmailBuilder.templates.testFooterTemplate
      })
    })
  })

  describe('templates', function () {
    describe('CTA', function () {
      describe('confirmEmail', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.userId = 'abc123'
          ctx.opts = {
            to: ctx.emailAddress,
            confirmEmailUrl: `${ctx.settings.siteUrl}/user/emails/confirm?token=aToken123`,
            sendingUser_id: ctx.userId,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('confirmEmail', ctx.opts)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom('a:contains("Confirm email")')
            expect(buttonLink.length).to.equal(1)
            expect(buttonLink.attr('href')).to.equal(ctx.opts.confirmEmailUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback.length).to.equal(1)
            const fallbackLink = fallback.html()
            expect(fallbackLink).to.contain(ctx.opts.confirmEmailUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.opts.confirmEmailUrl)
          })
        })
      })

      describe('ownershipTransferConfirmationNewOwner', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.opts = {
            to: ctx.emailAddress,
            previousOwner: {},
            project: {
              _id: 'abc123',
              name: 'example project',
            },
          }
          ctx.email = ctx.EmailBuilder.buildEmail(
            'ownershipTransferConfirmationNewOwner',
            ctx.opts
          )
          ctx.expectedUrl = `${
            ctx.settings.siteUrl
          }/project/${ctx.opts.project._id.toString()}`
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom('td a')
            expect(buttonLink).to.exist
            expect(buttonLink.attr('href')).to.equal(ctx.expectedUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback).to.exist
            const fallbackLink = fallback.html().replace(/&amp;/g, '&')
            expect(fallbackLink).to.contain(ctx.expectedUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.expectedUrl)
          })
        })
      })

      describe('passwordResetRequested', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.opts = {
            to: ctx.emailAddress,
            setNewPasswordUrl: `${
              ctx.settings.siteUrl
            }/user/password/set?passwordResetToken=aToken&email=${encodeURIComponent(
              ctx.emailAddress
            )}`,
          }
          ctx.email = ctx.EmailBuilder.buildEmail(
            'passwordResetRequested',
            ctx.opts
          )
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom('td a')
            expect(buttonLink).to.exist
            expect(buttonLink.attr('href')).to.equal(ctx.opts.setNewPasswordUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback).to.exist
            const fallbackLink = fallback.html().replace(/&amp;/g, '&')
            expect(fallbackLink).to.contain(ctx.opts.setNewPasswordUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.opts.setNewPasswordUrl)
          })
        })
      })

      describe('reconfirmEmail', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.userId = 'abc123'
          ctx.opts = {
            to: ctx.emailAddress,
            confirmEmailUrl: `${ctx.settings.siteUrl}/user/emails/confirm?token=aToken123`,
            sendingUser_id: ctx.userId,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('reconfirmEmail', ctx.opts)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom('a:contains("Reconfirm Email")')
            expect(buttonLink.length).to.equal(1)
            expect(buttonLink.attr('href')).to.equal(ctx.opts.confirmEmailUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback.length).to.equal(1)
            const fallbackLink = fallback.html()
            expect(fallbackLink).to.contain(ctx.opts.confirmEmailUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.opts.confirmEmailUrl)
          })
        })
      })

      describe('testEmail', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.opts = {
            to: ctx.emailAddress,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('testEmail', ctx.opts)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom(`a:contains("Open ${ctx.settings.appName}")`)
            expect(buttonLink.length).to.equal(1)
            expect(buttonLink.attr('href')).to.equal(ctx.settings.siteUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback.length).to.equal(1)
            const fallbackLink = fallback.html()
            expect(fallbackLink).to.contain(ctx.settings.siteUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(
              `Open ${ctx.settings.appName}: ${ctx.settings.siteUrl}`
            )
          })
        })
      })

      describe('registered', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.opts = {
            to: ctx.emailAddress,
            setNewPasswordUrl: `${ctx.settings.siteUrl}/user/activate?token=aToken123&user_id=aUserId123`,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('registered', ctx.opts)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom('a:contains("Set password")')
            expect(buttonLink.length).to.equal(1)
            expect(buttonLink.attr('href')).to.equal(ctx.opts.setNewPasswordUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback.length).to.equal(1)
            const fallbackLink = fallback.html().replace(/&amp;/, '&')
            expect(fallbackLink).to.contain(ctx.opts.setNewPasswordUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.opts.setNewPasswordUrl)
          })
        })
      })

      describe('projectInvite', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.owner = {
            email: 'owner@example.com',
            name: 'Bailey',
          }
          ctx.projectName = 'Top Secret'
          ctx.opts = {
            inviteUrl: `${ctx.settings.siteUrl}/project/projectId123/invite/token/aToken123`,
            owner: {
              email: ctx.owner.email,
            },
            project: {
              name: ctx.projectName,
            },
            to: ctx.emailAddress,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('projectInvite', ctx.opts)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const dom = cheerio.load(ctx.email.html)
            const buttonLink = dom('a:contains("View project")')
            expect(buttonLink.length).to.equal(1)
            expect(buttonLink.attr('href')).to.equal(ctx.opts.inviteUrl)
            const fallback = dom('.force-superpaper-style').last()
            expect(fallback.length).to.equal(1)
            const fallbackLink = fallback.html().replace(/&amp;/g, '&')
            expect(fallbackLink).to.contain(ctx.opts.inviteUrl)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA link', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.opts.inviteUrl)
          })
        })
      })

      describe('welcome', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.opts = {
            to: ctx.emailAddress,
            confirmEmailUrl: `${ctx.settings.siteUrl}/user/emails/confirm?token=token123`,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('welcome', ctx.opts)
          ctx.dom = cheerio.load(ctx.email.html)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include a CTA button and a fallback CTA link', function (ctx) {
            const buttonLink = ctx.dom('a:contains("Confirm email")')
            expect(buttonLink.length).to.equal(1)
            expect(buttonLink.attr('href')).to.equal(ctx.opts.confirmEmailUrl)
            const fallback = ctx.dom('.force-superpaper-style').last()
            expect(fallback.length).to.equal(1)
            expect(fallback.html()).to.contain(ctx.opts.confirmEmailUrl)
          })
          it('should include help links', function (ctx) {
            const helpGuidesLink = ctx.dom('a:contains("Help Guides")')
            const templatesLink = ctx.dom('a:contains("Templates")')
            const logInLink = ctx.dom('a:contains("log in")')
            expect(helpGuidesLink.length).to.equal(1)
            expect(templatesLink.length).to.equal(1)
            expect(logInLink.length).to.equal(1)
          })
        })

        describe('plain text email', function () {
          it('should contain the CTA URL', function (ctx) {
            expect(ctx.email.text).to.contain(ctx.opts.confirmEmailUrl)
          })
          it('should include help URL', function (ctx) {
            expect(ctx.email.text).to.contain('/learn')
            expect(ctx.email.text).to.contain('/login')
            expect(ctx.email.text).to.contain('/templates')
          })
          it('should contain HTML links', function (ctx) {
            expect(ctx.email.text).to.not.contain('<a')
          })
        })
      })

    })

    describe('no CTA', function () {
      describe('securityAlert', function () {
        beforeEach(function (ctx) {
          ctx.message = 'more details about the action'
          ctx.messageHTML = `<br /><span style="text-align:center" class="a-class"><b><i>${ctx.message}</i></b></span>`
          ctx.messageNotAllowedHTML = `<div></div>${ctx.messageHTML}`

          ctx.actionDescribed = 'an action described'
          ctx.actionDescribedHTML = `<br /><span style="text-align:center" class="a-class"><b><i>${ctx.actionDescribed}</i></b>`
          ctx.actionDescribedNotAllowedHTML = `<div></div>${ctx.actionDescribedHTML}`

          ctx.opts = {
            to: ctx.email,
            actionDescribed: ctx.actionDescribedNotAllowedHTML,
            action: 'an action',
            message: [ctx.messageNotAllowedHTML],
          }
          ctx.email = ctx.EmailBuilder.buildEmail('securityAlert', ctx.opts)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html != null).to.equal(true)
          expect(ctx.email.text != null).to.equal(true)
        })

        describe('HTML email', function () {
          it('should clean HTML in opts.actionDescribed', function (ctx) {
            expect(ctx.email.html).to.not.contain(
              ctx.actionDescribedNotAllowedHTML
            )
            expect(ctx.email.html).to.contain(ctx.actionDescribedHTML)
          })
          it('should clean HTML in opts.message', function (ctx) {
            expect(ctx.email.html).to.not.contain(ctx.messageNotAllowedHTML)
            expect(ctx.email.html).to.contain(ctx.messageHTML)
          })
        })

        describe('plain text email', function () {
          it('should remove all HTML in opts.actionDescribed', function (ctx) {
            expect(ctx.email.text).to.not.contain(ctx.actionDescribedHTML)
            expect(ctx.email.text).to.contain(ctx.actionDescribed)
          })
          it('should remove all HTML in opts.message', function (ctx) {
            expect(ctx.email.text).to.not.contain(ctx.messageHTML)
            expect(ctx.email.text).to.contain(ctx.message)
          })
        })
      })

      describe('welcomeWithoutCTA', function () {
        beforeEach(function (ctx) {
          ctx.emailAddress = 'example@superpaper.com'
          ctx.opts = {
            to: ctx.emailAddress,
          }
          ctx.email = ctx.EmailBuilder.buildEmail('welcomeWithoutCTA', ctx.opts)
          ctx.dom = cheerio.load(ctx.email.html)
        })

        it('should build the email', function (ctx) {
          expect(ctx.email.html).to.exist
          expect(ctx.email.text).to.exist
        })

        describe('HTML email', function () {
          it('should include help links', function (ctx) {
            const helpGuidesLink = ctx.dom('a:contains("Help Guides")')
            const templatesLink = ctx.dom('a:contains("Templates")')
            const logInLink = ctx.dom('a:contains("log in")')
            expect(helpGuidesLink.length).to.equal(1)
            expect(templatesLink.length).to.equal(1)
            expect(logInLink.length).to.equal(1)
          })
        })

        describe('plain text email', function () {
          it('should include help URL', function (ctx) {
            expect(ctx.email.text).to.contain('/learn')
            expect(ctx.email.text).to.contain('/login')
            expect(ctx.email.text).to.contain('/templates')
          })
          it('should contain HTML links', function (ctx) {
            expect(ctx.email.text).to.not.contain('<a')
          })
        })
      })

    })
  })
})
