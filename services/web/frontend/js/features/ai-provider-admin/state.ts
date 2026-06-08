import type { AiProvider, SafeApiError } from './types'
import type { TranslationKey } from './translations'

export type ProviderAdminState = {
  providers: AiProvider[]
  loading: boolean
  activeAction: string | null
  expandedKeyProviderId: string | null
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
  | { type: 'feedback:status'; statusMessage: TranslationKey | null }
  | { type: 'feedback:error'; error: SafeApiError }

export const initialProviderAdminState: ProviderAdminState = {
  providers: [],
  loading: true,
  activeAction: null,
  expandedKeyProviderId: null,
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
        providers: action.providers,
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
      return {
        ...state,
        providers: [action.provider, ...state.providers],
      }
    case 'provider:replace':
      if (!action.provider?.id) {
        return state
      }
      return {
        ...state,
        providers: state.providers.map(provider =>
          provider.id === action.provider?.id ? action.provider : provider
        ),
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
        statusMessage: null,
        error: null,
      }
    case 'replace-key:collapse':
      return {
        ...state,
        expandedKeyProviderId: null,
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
