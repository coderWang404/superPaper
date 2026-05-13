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
  baseURL: z.string().trim().url(),
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
  if (url.protocol !== 'https:') {
    throw new Error('baseURL must use https')
  }
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
