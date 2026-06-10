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
    expect(providers[0]).not.to.have.property('apiKey')
    expect(providers[0]).not.to.have.property('encryptedApiKey')
  })

  it('updates providers with encrypted API keys and returns a redacted provider', async function (ctx) {
    ctx.AiProvider.findByIdAndUpdate = sinon.stub().returns({
      exec: sinon.stub().resolves({
        ...ctx.savedProvider,
        name: 'Updated Hub',
        encryptedApiKey: 'encrypted-new-key',
      }),
    })
    ctx.encryptApiKey.resolves('encrypted-new-key')

    const provider = await ctx.Manager.updateProvider('provider-id', {
      name: ' Updated Hub ',
      baseURL: 'https://updated.example.test/',
      apiKey: 'new-test-key',
      enabled: false,
      defaultModel: 'gpt-4.1',
      models: [{ id: 'gpt-4.1' }],
    })

    expect(ctx.encryptApiKey).to.have.been.calledWith('new-test-key')
    expect(ctx.AiProvider.findByIdAndUpdate).to.have.been.calledOnce
    const [providerId, update, options] =
      ctx.AiProvider.findByIdAndUpdate.firstCall.args
    expect(providerId).to.equal('provider-id')
    expect(update).to.deep.equal({
      name: 'Updated Hub',
      baseURL: 'https://updated.example.test',
      encryptedApiKey: 'encrypted-new-key',
      enabled: false,
      models: [
        {
          id: 'gpt-4.1',
          displayName: 'gpt-4.1',
          source: 'manual',
          enabled: true,
        },
      ],
      defaultModel: 'gpt-4.1',
    })
    expect(update).not.to.have.property('apiKey')
    expect(options).to.deep.equal({ new: true })
    expect(provider).to.include({
      id: 'provider-id',
      name: 'Updated Hub',
      hasApiKey: true,
    })
    expect(provider).not.to.have.property('apiKey')
    expect(provider).not.to.have.property('encryptedApiKey')
  })

  it('returns null when updating a missing provider', async function (ctx) {
    ctx.AiProvider.findByIdAndUpdate = sinon.stub().returns({
      exec: sinon.stub().resolves(null),
    })

    const provider = await ctx.Manager.updateProvider('missing-provider', {
      enabled: false,
    })

    expect(provider).to.equal(null)
    expect(ctx.AiProvider.findByIdAndUpdate).to.have.been.calledOnce
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

  it('syncs models and returns a redacted provider', async function (ctx) {
    ctx.savedProvider.save = sinon.stub().resolves({
      ...ctx.savedProvider,
      models: [
        {
          id: 'gpt-4.1',
          displayName: 'gpt-4.1',
          source: 'synced',
          enabled: true,
        },
      ],
      encryptedApiKey: 'encrypted-key',
    })
    ctx.AiProvider.findById = sinon.stub().returns({
      exec: sinon.stub().resolves(ctx.savedProvider),
    })

    const provider = await ctx.Manager.syncModels('provider-id')

    expect(ctx.decryptApiKey).to.have.been.calledWith('encrypted-key')
    expect(ctx.syncOpenAICompatibleModels).to.have.been.calledWith({
      baseURL: 'https://ai.example.test',
      apiKey: 'test-key',
    })
    expect(ctx.savedProvider.models).to.deep.equal([
      {
        id: 'gpt-4.1',
        displayName: 'gpt-4.1',
        source: 'synced',
        enabled: true,
      },
    ])
    expect(ctx.savedProvider.healthStatus).to.equal('ok')
    expect(provider).to.include({
      id: 'provider-id',
      hasApiKey: true,
    })
    expect(provider).not.to.have.property('apiKey')
    expect(provider).not.to.have.property('encryptedApiKey')
  })

  it('returns null when testing a missing provider', async function (ctx) {
    ctx.AiProvider.findById = sinon.stub().returns({
      exec: sinon.stub().resolves(null),
    })

    const result = await ctx.Manager.testProvider('missing-provider')

    expect(result).to.equal(null)
    expect(ctx.decryptApiKey).not.to.have.been.called
    expect(ctx.syncOpenAICompatibleModels).not.to.have.been.called
  })

  it('tests providers with a redacted provider payload', async function (ctx) {
    ctx.savedProvider.save = sinon.stub().resolves(ctx.savedProvider)
    ctx.AiProvider.findById = sinon.stub().returns({
      exec: sinon.stub().resolves(ctx.savedProvider),
    })

    const result = await ctx.Manager.testProvider('provider-id')

    expect(result).to.deep.equal({
      ok: true,
      provider: {
        id: 'provider-id',
        name: 'Claude Hub',
        providerType: 'openai-compatible',
        baseURL: 'https://ai.example.test',
        enabled: true,
        hasApiKey: true,
        models: [
          {
            id: 'gpt-4.1',
            displayName: 'gpt-4.1',
            source: 'synced',
            enabled: true,
          },
        ],
        defaultModel: null,
        healthStatus: 'ok',
      },
    })
    expect(JSON.stringify(result)).not.to.include('test-key')
    expect(JSON.stringify(result)).not.to.include('encrypted-key')
  })
})
