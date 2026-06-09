import type { AiProvider, SafeApiError } from './types'
import type { TranslationKey } from './translations'

export type ProviderAdminState = {
  providers: AiProvider[]
  loading: boolean
  activeAction: string | null
  expandedKeyProviderId: string | null
  expandedEditProviderId: string | null
  statusMessage: TranslationKey | null
  error: SafeApiError | null
}

export type ProviderAdminAction =
  | { type: 'load:start' }
  | { type: 'load:success'; providers: AiProvider[] }
  | { type: 'load:error'; error: SafeApiError }
  | { type: 'provider:add'; provider?: AiProvider | null }
  | { type: 'provider:replace'; provider?: AiProvider | null }
  | { type: 'provider:remove'; providerId: string }
  | { type: 'action:start'; activeAction: string }
  | { type: 'action:finish' }
  | { type: 'replace-key:expand'; providerId: string }
  | { type: 'replace-key:collapse' }
  | { type: 'edit-provider:expand'; providerId: string }
  | { type: 'edit-provider:collapse' }
  | { type: 'feedback:status'; statusMessage: TranslationKey | null }
  | { type: 'feedback:error'; error: SafeApiError }

export const initialProviderAdminState: ProviderAdminState = {
  providers: [],
  loading: true,
  activeAction: null,
  expandedKeyProviderId: null,
  expandedEditProviderId: null,
  statusMessage: null,
  error: null,
}

export function providerAdminReducer(
  state: ProviderAdminState,
  action: ProviderAdminAction
): ProviderAdminState {
  switch (action.type) {
    case 'load:start':
      return {
        ...state,
        loading: true,
        error: null,
      }
    case 'load:success':
      return {
        ...state,
        providers: action.providers
          .map(sanitizeProvider)
          .filter((provider): provider is AiProvider => Boolean(provider)),
        loading: false,
        error: null,
      }
    case 'load:error':
      return {
        ...state,
        loading: false,
        activeAction: null,
        statusMessage: null,
        error: action.error,
      }
    case 'provider:add':
      if (!action.provider?.id) {
        return state
      }
      {
        const provider = sanitizeProvider(action.provider)
        if (!provider) {
          return state
        }
        return {
          ...state,
          providers: [provider, ...state.providers],
        }
      }
    case 'provider:replace':
      if (!action.provider?.id) {
        return state
      }
      {
        const provider = sanitizeProvider(action.provider)
        if (!provider) {
          return state
        }
        return {
          ...state,
          providers: state.providers.map(existingProvider =>
            existingProvider.id === provider.id ? provider : existingProvider
          ),
        }
      }
    case 'provider:remove':
      return {
        ...state,
        providers: state.providers.filter(
          provider => provider.id !== action.providerId
        ),
      }
    case 'action:start':
      return {
        ...state,
        activeAction: action.activeAction,
        statusMessage: null,
        error: null,
      }
    case 'action:finish':
      return {
        ...state,
        activeAction: null,
      }
    case 'replace-key:expand':
      return {
        ...state,
        expandedKeyProviderId: action.providerId,
        expandedEditProviderId: null,
        statusMessage: null,
        error: null,
      }
    case 'replace-key:collapse':
      return {
        ...state,
        expandedKeyProviderId: null,
      }
    case 'edit-provider:expand':
      return {
        ...state,
        expandedEditProviderId: action.providerId,
        expandedKeyProviderId: null,
        statusMessage: null,
        error: null,
      }
    case 'edit-provider:collapse':
      return {
        ...state,
        expandedEditProviderId: null,
      }
    case 'feedback:status':
      return {
        ...state,
        statusMessage: action.statusMessage,
        error: null,
      }
    case 'feedback:error':
      return {
        ...state,
        activeAction: null,
        statusMessage: null,
        error: action.error,
      }
    default:
      return state
  }
}

function sanitizeProvider(provider?: AiProvider | null) {
  if (!provider?.id) {
    return null
  }
  const {
    apiKey: _apiKey,
    encryptedApiKey: _encryptedApiKey,
    ...safeProvider
  } = provider as AiProvider & {
    apiKey?: unknown
    encryptedApiKey?: unknown
  }
  return safeProvider
}
