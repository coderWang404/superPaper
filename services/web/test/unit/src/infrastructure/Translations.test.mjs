import { describe, expect, it, vi } from 'vitest'
import express from 'express'

const MODULE_PATH = '../../../../app/src/infrastructure/Translations.mjs'

describe('Translations', function () {
  let req, res, translations
  async function runMiddlewares() {
    return await new Promise((resolve, reject) =>
      translations.setLangBasedOnDomainMiddleware(req, res, (err, result) => {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    )
  }

  beforeEach(async function () {
    vi.doMock('@superpaper/settings', () => ({
      default: {
        i18n: {
          escapeHTMLInVars: false,
          subdomainLang: {
            www: { lngCode: 'en', url: 'https://www.superpaper.com' },
            fr: { lngCode: 'fr', url: 'https://fr.superpaper.com' },
            da: { lngCode: 'da', url: 'https://da.superpaper.com' },
          },
          selectableLanguages: ['en', 'zh-CN'],
          languageCookieName: 'superpaper_lang',
        },
        translatedLanguages: {
          en: 'English',
          'zh-CN': '简体中文',
        },
      },
    }))

    translations = (await import(MODULE_PATH)).default

    req = {
      url: '/',
      body: {},
      query: {},
      cookies: {},
      headers: {
        'accept-language': '',
      },
      acceptsLanguage: express.request.acceptsLanguages,
    }
    res = {
      locals: {},
      cookie: vi.fn(),
      redirect: vi.fn(),
      json: vi.fn(),
      status: vi.fn(function () {
        return this
      }),
      getHeader: () => {},
      setHeader: () => {},
    }
  })

  describe('translate', function () {
    beforeEach(async function () {
      await runMiddlewares()
    })

    it('works', function () {
      expect(req.i18n.t('give_feedback')).to.equal('Give feedback')
    })

    it('has translate alias', function () {
      expect(req.i18n.translate('give_feedback')).to.equal('Give feedback')
    })

    it('does not persist across different languages', function () {
      expect([
        req.i18n.translate('log_in', { lng: 'fr' }),
        req.i18n.translate('log_in', { lng: 'en' }),
        req.i18n.translate('log_in', { lng: 'da' }),
        req.i18n.translate('log_in'),
      ]).to.deep.equal(['Se connecter', 'Log in', 'Log ind', 'Log in'])
    })
  })

  describe('interpolation', function () {
    beforeEach(async function () {
      await runMiddlewares()
    })

    it('works', function () {
      expect(
        req.i18n.t('please_confirm_email', {
          emailAddress: 'foo@example.com',
        })
      ).to.equal(
        'Please confirm your email foo@example.com by clicking on the link in the confirmation email '
      )
    })

    it('handles interpolation cleanly', function () {
      expect(
        req.i18n.t('expires_in_days', {
          days: '5',
        })
      ).to.equal('Expires in 5 days')
    })

    it('disables escaping', function () {
      expect(
        req.i18n.t('admin_user_created_message', {
          link: 'http://google.com',
        })
      ).to.equal(
        'Created admin user, <a href="http://google.com">Log in here</a> to continue'
      )
    })
  })

  describe('setLangBasedOnDomainMiddleware', function () {
    it('should set the lang to french if the domain is fr', async function () {
      req.headers.host = 'fr.superpaper.com'
      await runMiddlewares()
      expect(req.lng).to.equal('fr')
    })

    it('should prefer an explicit language cookie over the domain', async function () {
      req.cookies.superpaper_lang = 'zh-CN'
      req.headers.host = 'fr.superpaper.com'
      await runMiddlewares()
      expect(req.lng).to.equal('zh-CN')
      expect(req.i18n.languageSource).to.equal('cookie')
      expect(res.locals.currentLngCode).to.equal('zh-CN')
    })

    it('should not suggest a browser language when the user chose an explicit cookie language', async function () {
      req.cookies.superpaper_lang = 'zh-CN'
      req.headers.host = 'fr.superpaper.com'
      req.headers['accept-language'] = 'da, en-gb;q=0.8, en;q=0.7'
      await runMiddlewares()
      expect(res.locals.suggestedLanguageSubdomainConfig).to.not.exist
    })

    it('should expose selectable languages', async function () {
      await runMiddlewares()
      expect(res.locals.selectableLanguages).to.deep.equal([
        { code: 'en', name: 'English' },
        { code: 'zh-CN', name: '简体中文' },
      ])
    })

    describe('suggestedLanguageSubdomainConfig', function () {
      it('should set suggestedLanguageSubdomainConfig if the detected lang is different to subdomain lang', async function () {
        req.headers['accept-language'] = 'da, en-gb;q=0.8, en;q=0.7'
        req.headers.host = 'fr.superpaper.com'
        await runMiddlewares()
        expect(res.locals.suggestedLanguageSubdomainConfig).to.exist
        expect(res.locals.suggestedLanguageSubdomainConfig.lngCode).to.equal(
          'da'
        )
      })

      it('should not set suggestedLanguageSubdomainConfig if the detected lang is the same as subdomain lang', async function () {
        req.headers['accept-language'] = 'da, en-gb;q=0.8, en;q=0.7'
        req.headers.host = 'da.superpaper.com'
        await runMiddlewares()
        expect(res.locals.suggestedLanguageSubdomainConfig).to.not.exist
      })
    })
  })

  describe('setLanguageCookie', function () {
    it('should persist a valid language and redirect back', function () {
      req.body = {
        language: 'zh-CN',
        redirect: '/admin#ai-providers',
      }

      translations.setLanguageCookie(req, res)

      expect(res.cookie).toHaveBeenCalledWith(
        'superpaper_lang',
        'zh-CN',
        {
          domain: undefined,
          httpOnly: true,
          maxAge: 365 * 24 * 60 * 60 * 1000,
          sameSite: undefined,
          secure: undefined,
        }
      )
      expect(res.redirect).toHaveBeenCalledWith(
        303,
        '/admin#ai-providers'
      )
    })

    it('should reject an unsupported language', function () {
      req.body = {
        language: 'xx',
      }

      translations.setLanguageCookie(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        error: 'invalid_language',
        validLanguages: ['en', 'zh-CN'],
      })
    })
  })
})
