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
    ctx.Manager = {
      getProjectAiConfig: sinon.stub().resolves(ctx.config),
      chat: sinon.stub().resolves(ctx.chatResult),
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
})
