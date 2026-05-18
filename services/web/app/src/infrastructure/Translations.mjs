import i18n from 'i18next'
import Settings from '@superpaper/settings'
import { URL } from 'node:url'
import pug from 'pug-runtime'
import logger from '@superpaper/logger'
import SafeHTMLSubstitution from '../Features/Helpers/SafeHTMLSubstitution.mjs'
import cs from '../../../locales/cs.json' with { type: 'json' }
import da from '../../../locales/da.json' with { type: 'json' }
import de from '../../../locales/de.json' with { type: 'json' }
import en from '../../../locales/en.json' with { type: 'json' }
import es from '../../../locales/es.json' with { type: 'json' }
import fi from '../../../locales/fi.json' with { type: 'json' }
import fr from '../../../locales/fr.json' with { type: 'json' }
import it from '../../../locales/it.json' with { type: 'json' }
import ja from '../../../locales/ja.json' with { type: 'json' }
import ko from '../../../locales/ko.json' with { type: 'json' }
import nl from '../../../locales/nl.json' with { type: 'json' }
import no from '../../../locales/no.json' with { type: 'json' }
import pl from '../../../locales/pl.json' with { type: 'json' }
import pt from '../../../locales/pt.json' with { type: 'json' }
import ru from '../../../locales/ru.json' with { type: 'json' }
import sv from '../../../locales/sv.json' with { type: 'json' }
import tr from '../../../locales/tr.json' with { type: 'json' }
import zhCN from '../../../locales/zh-CN.json' with { type: 'json' }

const locales = {
  cs,
  da,
  de,
  en,
  es,
  fi,
  fr,
  it,
  ja,
  ko,
  nl,
  no,
  pl,
  pt,
  ru,
  sv,
  tr,
  'zh-CN': zhCN,
}

const fallbackLanguageCode = Settings.i18n.defaultLng || 'en'
const languageCookieName = Settings.i18n.languageCookieName || 'superpaper_lang'
const configuredSelectableLanguageCodes = Array.isArray(
  Settings.i18n.selectableLanguages
)
  ? Settings.i18n.selectableLanguages.filter(languageCode =>
      Object.hasOwn(locales, languageCode)
    )
  : []
const availableLanguageCodes = []
const availableHosts = new Map()
const subdomainConfigs = new Map()
const I18N_HTML_INJECTIONS = new Set()

Object.values(Settings.i18n.subdomainLang || {}).forEach(function (spec) {
  availableLanguageCodes.push(spec.lngCode)
  // prebuild a host->lngCode mapping for the usage at runtime in the
  //  middleware
  availableHosts.set(new URL(spec.url).host, spec.lngCode)

  // prebuild a lngCode -> language config mapping; some subdomains should
  //  not appear in the language picker
  if (!spec.hide) {
    subdomainConfigs.set(spec.lngCode, spec)
  }
})
if (!availableLanguageCodes.includes(fallbackLanguageCode)) {
  // always load the fallback locale
  availableLanguageCodes.push(fallbackLanguageCode)
}
for (const languageCode of configuredSelectableLanguageCodes) {
  if (!availableLanguageCodes.includes(languageCode)) {
    availableLanguageCodes.push(languageCode)
  }
}

const resources = Object.fromEntries(
  Object.entries(locales)
    .filter(([lngCode]) => availableLanguageCodes.includes(lngCode))
    .map(([lngCode, translations]) => [lngCode, { translation: translations }])
)

i18n
  .init({
    resources,

    // still using the v3 plural suffixes
    compatibilityJSON: 'v3',

    // We use the legacy v1 JSON format, so configure interpolator to use
    // underscores instead of curly braces
    interpolation: {
      prefix: '__',
      suffix: '__',
      unescapeSuffix: 'HTML',
      // Disable escaping of interpolated values for backwards compatibility.
      // We escape the value after it's translated in web, so there's no
      // security risk
      escapeValue: Settings.i18n.escapeHTMLInVars,
      // Disable nesting in interpolated values, preventing user input
      // injection via another nested value
      skipOnVariables: true,

      defaultVariables: {
        appName: Settings.appName,
      },
    },

    supportedLngs: availableLanguageCodes,
    fallbackLng: fallbackLanguageCode,
  })
  .catch(err => {
    logger.error({ err }, 'failed to initialize i18next library')
  })

function isAvailableLanguageCode(languageCode) {
  return availableLanguageCodes.includes(languageCode)
}

function getSelectableLanguages() {
  const selectableLanguageCodes =
    configuredSelectableLanguageCodes.length > 0
      ? configuredSelectableLanguageCodes
      : availableLanguageCodes

  return selectableLanguageCodes.map(languageCode => ({
    code: languageCode,
    name: Settings.translatedLanguages?.[languageCode] || languageCode,
  }))
}

function getLanguageFromRequest(req) {
  const cookieLanguage = req.cookies?.[languageCookieName]
  if (isAvailableLanguageCode(cookieLanguage)) {
    return {
      lang: cookieLanguage,
      source: 'cookie',
    }
  }

  return {
    lang: availableHosts.get(req.headers.host) ?? fallbackLanguageCode,
    source: 'domain',
  }
}

function setLanguageCookie(req, res) {
  const requestedLanguage = req.body?.language || req.query?.language

  if (!isAvailableLanguageCode(requestedLanguage)) {
    return res.status(400).json({
      error: 'invalid_language',
      validLanguages: getSelectableLanguages().map(language => language.code),
    })
  }

  res.cookie(languageCookieName, requestedLanguage, {
    domain: Settings.cookieDomain,
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000,
    sameSite: Settings.sameSiteCookie,
    secure: Settings.secureCookie,
  })

  const redirectTo =
    typeof req.body?.redirect === 'string' && req.body.redirect.startsWith('/')
      ? req.body.redirect
      : '/'
  res.redirect(303, redirectTo)
}

function setLangBasedOnDomainMiddleware(req, res, next) {
  // Determine language from explicit self-hosted preference first, then fall
  // back to the legacy subdomain mapping.
  const { lang, source } = getLanguageFromRequest(req)

  req.i18n = {
    language: lang,
    languageSource: source,
    selectableLanguages: getSelectableLanguages(),
  }

  req.language =
    req.locale =
    req.lng =
    res.locals.currentLngCode =
    res.locals.language =
      lang

  res.locals.languageCookieName = languageCookieName
  res.locals.selectableLanguages = req.i18n.selectableLanguages

  // If the set language is different from the language detection (based on
  // the Accept-Language header), then set flag which will show a banner
  // offering to switch to the appropriate library
  const detectedLanguageCode =
    req.acceptsLanguage(availableLanguageCodes) || fallbackLanguageCode
  if (source !== 'cookie' && req.language !== detectedLanguageCode) {
    res.locals.suggestedLanguageSubdomainConfig =
      subdomainConfigs.get(detectedLanguageCode)
  }

  // Decorate req.i18n with translate function alias for backwards
  // compatibility usage in requests
  req.i18n.translate =
    res.locals.t =
    req.i18n.t =
      (key, vars, components) => {
        vars = { lng: lang, ...(vars ?? {}) }

        if (Settings.i18n.checkForHTMLInVars) {
          Object.entries(vars).forEach(([field, value]) => {
            if (pug.escape(value) !== value) {
              const violationsKey = key + field
              // do not flood the logs, log one sample per pod + key + field
              if (!I18N_HTML_INJECTIONS.has(violationsKey)) {
                logger.warn(
                  { key, field, value },
                  'html content in translations context vars'
                )
                I18N_HTML_INJECTIONS.add(violationsKey)
              }
            }
          })
        }

        const locale = i18n.t(key, vars)
        if (components) {
          return SafeHTMLSubstitution.render(locale, components)
        } else {
          return locale
        }
      }

  next()
}

// Decorate i18n with translate function alias for backwards compatibility
// in direct usage
i18n.translate = i18n.t

export default {
  setLangBasedOnDomainMiddleware,
  setLanguageCookie,
  getSelectableLanguages,
  isAvailableLanguageCode,
  i18n,
}
