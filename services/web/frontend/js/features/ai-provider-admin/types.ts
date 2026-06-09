export type AiProviderModel = {
  id: string
  displayName: string
  source: 'manual' | 'synced'
  enabled: boolean
}

export type AiProvider = {
  id: string
  name: string
  providerType: 'openai-compatible'
  baseURL: string
  enabled: boolean
  hasApiKey: boolean
  models: AiProviderModel[]
  defaultModel: string | null
  healthStatus: 'unknown' | 'ok' | 'error'
}

export type ProviderInput = {
  name: string
  providerType: 'openai-compatible'
  baseURL: string
  apiKey: string
  enabled: boolean
  defaultModel: string | null
  models: AiProviderModel[]
}

export type ProviderPatchInput = Partial<
  Pick<ProviderInput, 'apiKey' | 'enabled' | 'defaultModel' | 'models'>
>

export type ProviderListResponse = {
  providers: AiProvider[]
}

export type ProviderResponse = {
  provider?: AiProvider | null
}

export type ProviderTestResponse = ProviderResponse & {
  ok: boolean
}

export type SafeApiError = {
  code?: string
  message: string
  fields?: Array<{ field: string; message: string }>
}
