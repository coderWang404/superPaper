import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderManager.mjs'

describe('AiProviderManager', function () {
  beforeEach(async function (ctx) {
    ctx.savedProvider = {
      _id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      encryptedApiKey: 'encrypted-key',
      enabled: true,
      models: [],
      defaultModel: null,
      healthStatus: 'unknown',
    }

    ctx.AiProvider = class {
      constructor(data) {
        ctx.providerData = data
      }

      async save() {
        return ctx.savedProvider
      }

      static find() {
        return {
          sort: sinon.stub().returns({
            exec: sinon.stub().resolves([ctx.savedProvider]),
          }),
        }
      }
    }

    ctx.encryptApiKey = sinon.stub().resolves('encrypted-key')
    ctx.decryptApiKey = sinon.stub().resolves('test-key')
    ctx.redactProvider = sinon.stub().callsFake(provider => ({
      id: provider._id,
      name: provider.name,
      providerType: provider.providerType,
      baseURL: provider.baseURL,
      enabled: provider.enabled,
      hasApiKey: Boolean(provider.encryptedApiKey),
      models: provider.models,
      defaultModel: provider.defaultModel,
      healthStatus: provider.healthStatus,
    }))
    ctx.syncOpenAICompatibleModels = sinon
      .stub()
      .resolves([
        { id: 'gpt-4.1', displayName: 'gpt-4.1', source: 'synced', enabled: true },
      ])

    vi.doMock('../../../../app/src/models/AiProvider', () => ({
      AiProvider: ctx.AiProvider,
    }))
    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProviderSecrets',
      () => ({
        encryptApiKey: ctx.encryptApiKey,
        decryptApiKey: ctx.decryptApiKey,
        redactProvider: ctx.redactProvider,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProviderClient',
      () => ({
        syncOpenAICompatibleModels: ctx.syncOpenAICompatibleModels,
      })
    )

    ctx.Manager = await import(modulePath)
  })

  it('creates a provider with an encrypted API key and returns a redacted provider', async function (ctx) {
    const provider = await ctx.Manager.createProvider({
      name: '  Claude Hub  ',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test/',
      apiKey: 'test-key',
      enabled: true,
    })

    expect(ctx.encryptApiKey).to.have.been.calledWith('test-key')
    expect(ctx.providerData).to.include({
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      encryptedApiKey: 'encrypted-key',
      enabled: true,
    })
    expect(ctx.providerData).not.to.have.property('apiKey')
    expect(provider).to.include({
      id: 'provider-id',
      hasApiKey: true,
    })
    expect(provider).not.to.have.property('encryptedApiKey')
    expect(provider).not.to.have.property('apiKey')
  })

  it('lists redacted providers', async function (ctx) {
    const providers = await ctx.Manager.listProviders()

    expect(providers).to.have.length(1)
    expect(providers[0]).to.include({
      id: 'provider-id',
      hasApiKey: true,
    })
  })

  it('rejects syncing legacy providers with non-https base URLs', async function (ctx) {
    ctx.savedProvider.baseURL = 'http://ai.example.test'
    ctx.AiProvider.findById = sinon.stub().returns({
      exec: sinon.stub().resolves(ctx.savedProvider),
    })

    await expect(ctx.Manager.syncModels('provider-id')).to.be.rejectedWith(
      'baseURL must use https'
    )

    expect(ctx.decryptApiKey).not.to.have.been.called
    expect(ctx.syncOpenAICompatibleModels).not.to.have.been.called
  })
})
