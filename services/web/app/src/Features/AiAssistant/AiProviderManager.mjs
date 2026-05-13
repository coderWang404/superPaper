import { AiProvider } from '../../models/AiProvider.mjs'
import {
  decryptApiKey,
  encryptApiKey,
  redactProvider,
} from './AiProviderSecrets.mjs'
import { syncOpenAICompatibleModels } from './AiProviderClient.mjs'
import { parseCreateProviderInput } from './AiProviderValidation.mjs'

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

export async function syncModels(providerId) {
  const provider = await AiProvider.findById(providerId).exec()
  if (!provider) {
    return null
  }
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
