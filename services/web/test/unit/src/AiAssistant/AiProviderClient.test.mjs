import { expect, vi } from 'vitest'
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
    const networkError = new TypeError('fetch failed')
    const fetchImpl = sinon.stub().rejects(networkError)

    let thrownError
    try {
      await ctx.Client.createOpenAICompatibleChatCompletion({
        baseURL: 'https://example.invalid/v1',
        apiKey: 'test-key',
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: 'Hello' }],
        fetchImpl,
      })
    } catch (err) {
      thrownError = err
    }

    expect(thrownError).to.be.instanceOf(ctx.Client.AiProviderError)
    expect(thrownError.cause).to.equal(networkError)
  })

  it('adds DeepSeek V4 thinking options for the official API', async function (ctx) {
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

    await ctx.Client.createOpenAICompatibleChatCompletion({
      baseURL: 'https://api.deepseek.com',
      apiKey: 'test-key',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      fetchImpl,
    })

    expect(JSON.parse(fetchImpl.firstCall.args[1].body)).to.deep.equal({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    })
  })

  it('streams OpenAI-compatible chat completion deltas', async function (ctx) {
    const encoder = new TextEncoder()
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'
            )
          )
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"world"}}]}\n\n'
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
    })

    const chunks = []
    for await (const chunk of ctx.Client.streamOpenAICompatibleChatCompletion({
      baseURL: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }],
      fetchImpl,
    })) {
      chunks.push(chunk)
    }

    expect(fetchImpl.firstCall.args[0]).to.equal(
      'https://example.invalid/v1/chat/completions'
    )
    expect(JSON.parse(fetchImpl.firstCall.args[1].body)).to.deep.equal({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.2,
      stream: true,
    })
    expect(chunks).to.deep.equal(['Hello ', 'world'])
  })

  it('adds DeepSeek V4 thinking options for streaming requests', async function (ctx) {
    const encoder = new TextEncoder()
    const fetchImpl = sinon.stub().resolves({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"reasoning_content":"internal reasoning"}}]}\n\n'
            )
          )
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"Visible answer"}}]}\n\n'
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
    })

    const chunks = []
    for await (const chunk of ctx.Client.streamOpenAICompatibleChatCompletion({
      baseURL: 'https://api.deepseek.com',
      apiKey: 'test-key',
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      fetchImpl,
    })) {
      chunks.push(chunk)
    }

    expect(JSON.parse(fetchImpl.firstCall.args[1].body)).to.deep.equal({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: 'Hello' }],
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
      stream: true,
    })
    expect(chunks).to.deep.equal(['Visible answer'])
  })

  it('refreshes stream timeout after each received chunk', async function (ctx) {
    vi.useFakeTimers()
    try {
      const encoder = new TextEncoder()
      let controller
      const fetchImpl = sinon.stub().resolves({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(nextController) {
            controller = nextController
          },
        }),
      })

      const chunks = []
      const collectPromise = (async () => {
        for await (const chunk of ctx.Client.streamOpenAICompatibleChatCompletion({
          baseURL: 'https://example.invalid/v1',
          apiKey: 'test-key',
          model: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello' }],
          fetchImpl,
          timeoutMs: 100,
        })) {
          chunks.push(chunk)
        }
      })()

      await Promise.resolve()
      controller.enqueue(
        encoder.encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n')
      )
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(90)
      controller.enqueue(
        encoder.encode('data: {"choices":[{"delta":{"content":"B"}}]}\n\n')
      )
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(90)
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()

      await collectPromise

      expect(chunks).to.deep.equal(['A', 'B'])
    } finally {
      vi.useRealTimers()
    }
  })
})
