import { expect } from 'vitest'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderSecrets.mjs'

describe('AiProviderSecrets', function () {
  beforeEach(async function (ctx) {
    ctx.Secrets = await import(modulePath)
  })

  it('encrypts and decrypts API keys without storing plaintext', async function (ctx) {
    const encrypted = await ctx.Secrets.encryptApiKey('test-api-key', {
      secret: '0123456789abcdef0123456789abcdef',
    })

    expect(encrypted).to.be.a('string')
    expect(encrypted).not.to.include('test-api-key')
    expect(
      await ctx.Secrets.decryptApiKey(encrypted, {
        secret: '0123456789abcdef0123456789abcdef',
      })
    ).to.equal('test-api-key')
  })

  it('redacts provider records for browser responses', function (ctx) {
    const publicProvider = ctx.Secrets.redactProvider({
      _id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      encryptedApiKey: 'encrypted',
      models: [],
      enabled: true,
    })

    expect(publicProvider).to.include({
      id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      hasApiKey: true,
      enabled: true,
    })
    expect(publicProvider).not.to.have.property('encryptedApiKey')
    expect(publicProvider).not.to.have.property('apiKey')
  })
})
