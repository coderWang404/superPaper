import { ScopeValueStore } from './ide/scope-value-store'
import { MetaAttributesCache } from '@/utils/meta'
import { ReCaptchaInstance } from './recaptcha'

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    metaAttributesCache: MetaAttributesCache
    MathJax: Record<string, any>
    // For react-google-recaptcha
    recaptchaOptions?: {
      enterprise?: boolean
      useRecaptchaNet?: boolean
    }
    expectingLinkedFileRefreshedSocketFor?: string | null
    io?: any
    superPaper: {
      unstable: {
        store: ScopeValueStore
      }
    }
    grecaptcha?: ReCaptchaInstance
  }
}
