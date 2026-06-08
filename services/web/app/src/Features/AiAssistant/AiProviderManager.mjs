import { AiProvider } from '../../models/AiProvider.mjs'
import {
  decryptApiKey,
  encryptApiKey,
  redactProvider,
} from './AiProviderSecrets.mjs'
import { syncOpenAICompatibleModels } from './AiProviderClient.mjs'
import {
  assertHttpsBaseURL,
  parseCreateProviderInput,
  parseUpdateProviderInput,
} from './AiProviderValidation.mjs'

export async function listProviders() {
  const providers = await AiProvider.find({}).sort({ name: 1 }).exec()
  return providers.map(redactProvider)
}

export async function createProvider(input) {
  const parsed = parseCreateProviderInput(input)
  const encryptedApiKey = await encryptApiKey(parsed.apiKey)
  const provider = new AiProvider({
    name: parsed.name,
    providerType: parsed.providerType,
    baseURL: parsed.baseURL,
    encryptedApiKey,
    enabled: parsed.enabled,
    models: parsed.models,
    defaultModel: parsed.defaultModel,
    healthStatus: 'unknown',
  })
  return redactProvider(await provider.save())
}

export async function updateProvider(providerId, input) {
  const validated = parseUpdateProviderInput(input)
  const update = {}
  if (validated.name !== undefined) update.name = validated.name
  if (validated.baseURL !== undefined) update.baseURL = validated.baseURL
  if (validated.enabled !== undefined) update.enabled = validated.enabled
  if (validated.apiKey) {
    update.encryptedApiKey = await encryptApiKey(validated.apiKey)
  }
  if (validated.models !== undefined) update.models = validated.models
  if (validated.defaultModel !== undefined) {
    update.defaultModel = validated.defaultModel
  }
  const provider = await AiProvider.findByIdAndUpdate(providerId, update, {
    new: true,
  }).exec()
  return provider ? redactProvider(provider) : null
}

export async function deleteProvider(providerId) {
  const result = await AiProvider.deleteOne({ _id: providerId }).exec()
  return result.deletedCount > 0
}

export async function syncModels(providerId) {
  const provider = await AiProvider.findById(providerId).exec()
  if (!provider) {
    return null
  }
  assertHttpsBaseURL(provider.baseURL)
  const apiKey = await decryptApiKey(provider.encryptedApiKey)
  const models = await syncOpenAICompatibleModels({
    baseURL: provider.baseURL,
    apiKey,
  })
  provider.models = models
  provider.lastModelSyncAt = new Date()
  provider.healthStatus = 'ok'
  provider.lastHealthCheckAt = new Date()
  provider.lastHealthError = null
  return redactProvider(await provider.save())
}

export async function testProvider(providerId) {
  const provider = await syncModels(providerId)
  return {
    ok: Boolean(provider),
    provider,
  }
}
