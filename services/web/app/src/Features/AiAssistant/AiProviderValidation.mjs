import { z } from 'zod'

const PROVIDER_TYPES = ['openai-compatible']

const ModelInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
  source: z.enum(['manual', 'synced']).default('manual'),
  enabled: z.boolean().default(true),
})

const CreateProviderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerType: z.enum(PROVIDER_TYPES).default('openai-compatible'),
  baseURL: z.string().trim().refine(val => {
    try { const u = new URL(val); return u.protocol === 'https:' } catch { return false }
  }, { message: 'baseURL must use https' }),
  apiKey: z.string().min(1),
  enabled: z.boolean().default(true),
  defaultModel: z.string().trim().min(1).max(200).nullable().optional(),
  models: z.array(ModelInputSchema).default([]),
})

const OpenAIModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().trim().min(1).max(200),
    })
  ),
})

function normalizeBaseURL(baseURL) {
  const url = new URL(baseURL)
url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

function normalizeModel(model) {
  return {
    id: model.id,
    displayName: model.displayName || model.id,
    source: model.source,
    enabled: model.enabled,
  }
}

const UpdateProviderInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    baseUrl: z.string().trim().refine(val => {
      try { const u = new URL(val); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false }
    }, { message: 'baseUrl must be a valid http or https URL' }).optional(),
    baseURL: z.string().trim().refine(val => {
      try { const u = new URL(val); return u.protocol === 'https:' || u.protocol === 'http:' } catch { return false }
    }, { message: 'baseURL must be a valid http or https URL' }).optional(),
    apiKey: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    defaultModel: z.string().trim().min(1).max(200).nullable().optional(),
    models: z.array(ModelInputSchema).optional(),
  })
  .strict()

export function parseUpdateProviderInput(body) {
  const parsed = UpdateProviderInputSchema.parse(body)
  const result = {}
  if (parsed.name !== undefined) result.name = parsed.name
  if (parsed.baseURL !== undefined) {
    result.baseURL = normalizeBaseURL(parsed.baseURL)
  } else if (parsed.baseUrl !== undefined) {
    result.baseURL = normalizeBaseURL(parsed.baseUrl)
  }
  if (parsed.apiKey !== undefined) result.apiKey = parsed.apiKey
  if (parsed.enabled !== undefined) result.enabled = parsed.enabled
  if (parsed.defaultModel !== undefined) result.defaultModel = parsed.defaultModel || null
  if (parsed.models !== undefined) result.models = parsed.models.map(normalizeModel)
  return result
}

export function parseCreateProviderInput(body) {
  const parsed = CreateProviderInputSchema.parse(body)
  return {
    ...parsed,
    baseURL: normalizeBaseURL(parsed.baseURL),
    defaultModel: parsed.defaultModel || null,
    models: parsed.models.map(normalizeModel),
  }
}

export function parseOpenAIModelsResponse(body) {
  const parsed = OpenAIModelsResponseSchema.parse(body)
  return parsed.data.map(model =>
    normalizeModel({
      id: model.id,
      displayName: model.id,
      source: 'synced',
      enabled: true,
    })
  )
}
