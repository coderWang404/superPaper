import { z } from 'zod'

const PROVIDER_TYPES = ['openai-compatible']

const ModelInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
  source: z.enum(['manual', 'synced']).default('manual'),
  enabled: z.boolean().default(true),
})

export class AiProviderValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AiProviderValidationError'
  }
}

export function isHttpsURL(val) {
  try {
    const url = new URL(val)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function httpsURLSchema(fieldName) {
  return z.string().trim().refine(isHttpsURL, {
    message: `${fieldName} must use https`,
  })
}

export function assertHttpsBaseURL(baseURL, fieldName = 'baseURL') {
  if (!isHttpsURL(baseURL)) {
    throw new AiProviderValidationError(`${fieldName} must use https`)
  }
}

const CreateProviderInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerType: z.enum(PROVIDER_TYPES).default('openai-compatible'),
  baseURL: httpsURLSchema('baseURL'),
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
    baseUrl: httpsURLSchema('baseUrl').optional(),
    baseURL: httpsURLSchema('baseURL').optional(),
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
