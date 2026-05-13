import { expect, vi } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProjectChatController.mjs'

function jsonBody(res) {
  return JSON.parse(res.body)
}

describe('AiProjectChatController', function () {
  beforeEach(async function (ctx) {
    ctx.config = {
      providers: [
        {
          id: 'provider-id',
          name: 'Claude Hub',
          models: [{ id: 'gpt-4.1', displayName: 'gpt-4.1', enabled: true }],
          defaultModel: 'gpt-4.1',
        },
      ],
    }
    ctx.chatResult = {
      answer: 'AI answer',
      model: 'gpt-4.1',
      providerId: 'provider-id',
      context: {
        includedFiles: ['/main.tex'],
        selectionIncluded: true,
        truncated: false,
      },
    }
    ctx.chatStreamResult = {
      stream: (async function* () {
        yield 'AI '
        yield 'answer'
      })(),
      model: 'gpt-4.1',
      providerId: 'provider-id',
      context: {
        includedFiles: ['/main.tex'],
        selectionIncluded: true,
        truncated: false,
      },
    }
    ctx.Manager = {
      getProjectAiConfig: sinon.stub().resolves(ctx.config),
      chat: sinon.stub().resolves(ctx.chatResult),
      chatStream: sinon.stub().resolves(ctx.chatStreamResult),
      AiProjectChatError: class AiProjectChatError extends Error {
        constructor(code, message) {
          super(message)
          this.name = 'AiProjectChatError'
          this.code = code
        }
      },
    }

    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProjectChatManager',
      () => ctx.Manager
    )

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.params.Project_id = 'project-id'
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  it('returns project AI config', async function (ctx) {
    await ctx.Controller.config(ctx.req, ctx.res, ctx.next)

    expect(jsonBody(ctx.res)).to.deep.equal(ctx.config)
  })

  it('passes project chat request to the manager', async function (ctx) {
    ctx.req.body = {
      prompt: 'Explain this',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    }

    await ctx.Controller.chat(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.chat).to.have.been.calledWith({
      projectId: 'project-id',
      prompt: 'Explain this',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    })
    expect(jsonBody(ctx.res)).to.deep.equal(ctx.chatResult)
  })

  it('returns validation errors without leaking prompt content', async function (ctx) {
    ctx.req.body = {
      prompt: '',
    }

    await ctx.Controller.chat(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI chat input',
      },
    })
  })

  it('returns service unavailable when no provider is configured', async function (ctx) {
    ctx.Manager.chat.rejects(
      new ctx.Manager.AiProjectChatError(
        'AI_PROVIDER_NOT_CONFIGURED',
        'No provider'
      )
    )
    ctx.req.body = {
      prompt: 'Explain this',
    }

    await ctx.Controller.chat(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(503)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        message: 'AI provider is not configured',
      },
    })
  })

  it('returns a safe JSON error when the upstream provider request fails', async function (ctx) {
    const err = new Error('upstream leaked detail')
    err.name = 'AiProviderError'
    ctx.Manager.chat.rejects(err)
    ctx.req.body = {
      prompt: 'Explain this',
    }

    await ctx.Controller.chat(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(502)
    expect(ctx.next).not.to.have.been.called
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'AI_PROVIDER_REQUEST_FAILED',
        message: 'AI provider request failed',
      },
    })
  })

  it('streams project chat deltas as ndjson', async function (ctx) {
    ctx.res.write = sinon.stub()
    ctx.res.end = sinon.stub()
    ctx.req.body = {
      prompt: 'Explain this',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    }

    await ctx.Controller.chatStream(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.chatStream).to.have.been.calledWith({
      projectId: 'project-id',
      prompt: 'Explain this',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    })
    expect(ctx.res.headers['Content-Type']).to.equal(
      'application/x-ndjson; charset=utf-8'
    )
    expect(ctx.res.write.firstCall.args[0]).to.equal(
      JSON.stringify({ type: 'delta', delta: 'AI ' }) + '\n'
    )
    expect(ctx.res.write.secondCall.args[0]).to.equal(
      JSON.stringify({ type: 'delta', delta: 'answer' }) + '\n'
    )
    expect(ctx.res.write.thirdCall.args[0]).to.equal(
      JSON.stringify({
        type: 'done',
        model: 'gpt-4.1',
        providerId: 'provider-id',
        context: {
          includedFiles: ['/main.tex'],
          selectionIncluded: true,
          truncated: false,
        },
      }) + '\n'
    )
    expect(ctx.res.end).to.have.been.calledOnce
  })
})
