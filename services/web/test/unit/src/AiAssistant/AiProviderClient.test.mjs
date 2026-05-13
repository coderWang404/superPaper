import { expect } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderClient.mjs'

describe('AiProviderClient', function () {
  beforeEach(async function (ctx) {
    ctx.Client = await import(modulePath)
  })

  it('syncs OpenAI-compatible models through the provider base URL', async function (ctx) {
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      status: 200,
      json: sinon.stub().resolves({
        data: [{ id: 'gpt-4.1' }, { id: 'deepseek-chat' }],
      }),
    })

    const models = await ctx.Client.syncOpenAICompatibleModels({
      baseURL: 'https://example.invalid/v1',
      apiKey: 'test-key',
      fetchImpl,
    })

    expect(fetchImpl).to.have.been.calledOnce
    expect(fetchImpl.firstCall.args[0]).to.equal(
      'https://example.invalid/v1/models'
    )
    expect(fetchImpl.firstCall.args[1].headers.Authorization).to.equal(
      'Bearer test-key'
    )
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

  it('raises a provider error when model sync fails', async function (ctx) {
    const fetchImpl = sinon.stub().resolves({
      ok: false,
      status: 401,
      text: sinon.stub().resolves('unauthorized'),
    })

    await expect(
      ctx.Client.syncOpenAICompatibleModels({
        baseURL: 'https://example.invalid',
        apiKey: 'test-key',
        fetchImpl,
      })
    ).to.be.rejectedWith('AI provider model sync failed with status 401')
  })

  it('wraps model sync network failures in a provider error', async function (ctx) {
    const fetchImpl = sinon.stub().rejects(new TypeError('fetch failed'))

    await expect(
      ctx.Client.syncOpenAICompatibleModels({
        baseURL: 'https://example.invalid',
        apiKey: 'test-key',
        fetchImpl,
      })
    ).to.be.rejectedWith(ctx.Client.AiProviderError)
  })

  it('creates OpenAI-compatible chat completions', async function (ctx) {
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      status: 200,
      json: sinon.stub().resolves({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'AI answer',
            },
          },
        ],
      }),
    })

    const answer = await ctx.Client.createOpenAICompatibleChatCompletion({
      baseURL: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }],
      fetchImpl,
    })

    expect(fetchImpl.firstCall.args[0]).to.equal(
      'https://example.invalid/v1/chat/completions'
    )
    expect(fetchImpl.firstCall.args[1].headers.Authorization).to.equal(
      'Bearer test-key'
    )
    expect(fetchImpl.firstCall.args[1].body).to.equal(
      JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.2,
      })
    )
    expect(answer).to.equal('AI answer')
  })

  it('wraps chat completion network failures in a provider error', async function (ctx) {
    const fetchImpl = sinon.stub().rejects(new TypeError('fetch failed'))

    await expect(
      ctx.Client.createOpenAICompatibleChatCompletion({
        baseURL: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }],
        fetchImpl,
      })
    ).to.be.rejectedWith(ctx.Client.AiProviderError)
  })
})
