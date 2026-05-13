import { expect } from 'vitest'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderValidation.mjs'

describe('AiProviderValidation', function () {
  beforeEach(async function (ctx) {
    ctx.Validation = await import(modulePath)
  })

  it('normalizes create input for an OpenAI-compatible provider', function (ctx) {
    const input = ctx.Validation.parseCreateProviderInput({
      name: '  Claude Hub  ',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test/',
      apiKey: 'test-key',
      enabled: true,
    })

    expect(input).to.deep.equal({
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      apiKey: 'test-key',
      enabled: true,
      defaultModel: null,
      models: [],
    })
  })

  it('rejects non-https provider URLs', function (ctx) {
    expect(() =>
      ctx.Validation.parseCreateProviderInput({
        name: 'Unsafe',
        providerType: 'openai-compatible',
        baseURL: 'http://localhost:11434',
        apiKey: 'test-key',
      })
    ).to.throw('baseURL must use https')
  })

  it('extracts model IDs from OpenAI-compatible model list responses', function (ctx) {
    const models = ctx.Validation.parseOpenAIModelsResponse({
      object: 'list',
      data: [
        { id: 'gpt-4.1', object: 'model' },
        { id: 'deepseek-chat', object: 'model' },
      ],
    })

    expect(models).to.deep.equal([
      { id: 'gpt-4.1', displayName: 'gpt-4.1', source: 'synced', enabled: true },
      {
        id: 'deepseek-chat',
        displayName: 'deepseek-chat',
        source: 'synced',
        enabled: true,
      },
    ])
  })
})
