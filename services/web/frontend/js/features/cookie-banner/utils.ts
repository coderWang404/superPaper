import getMeta from '@/utils/meta'

export type CookieConsentValue = 'all' | 'essential'

export function setConsent(value: CookieConsentValue | null) {
  const cookieDomain = getMeta('ol-ExposedSettings').cookieDomain
  const oneYearInSeconds = 60 * 60 * 24 * 365
  const cookieAttributes =
    '; path=/' +
    '; domain=' +
    cookieDomain +
    '; max-age=' +
    oneYearInSeconds +
    '; SameSite=Lax; Secure'
  document.cookie = `${value === 'all' ? 'oa=1' : 'oa=0'}${cookieAttributes}`
  window.dispatchEvent(
    new CustomEvent('cookie-consent', { detail: value === 'all' })
  )
}

export function cookieBannerRequired() {
  return false
}

export function hasMadeCookieChoice() {
  return document.cookie.split('; ').some(c => c.startsWith('oa='))
}
