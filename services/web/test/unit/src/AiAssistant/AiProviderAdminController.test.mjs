import { expect, vi } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderAdminController.mjs'

function jsonBody(res) {
  return JSON.parse(res.body)
}

describe('AiProviderAdminController', function () {
  beforeEach(async function (ctx) {
    ctx.provider = {
      id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      enabled: true,
      hasApiKey: true,
      models: [],
      defaultModel: null,
      healthStatus: 'unknown',
    }
    ctx.Manager = {
      listProviders: sinon.stub().resolves([ctx.provider]),
      createProvider: sinon.stub().resolves(ctx.provider),
      syncModels: sinon.stub().resolves(ctx.provider),
      testProvider: sinon.stub().resolves({ ok: true, provider: ctx.provider }),
    }

    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProviderManager',
      () => ctx.Manager
    )

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  it('lists redacted providers', async function (ctx) {
    await ctx.Controller.list(ctx.req, ctx.res, ctx.next)

    expect(jsonBody(ctx.res)).to.deep.equal({
      providers: [ctx.provider],
    })
    expect(jsonBody(ctx.res).providers[0]).not.to.have.property('apiKey')
    expect(jsonBody(ctx.res).providers[0]).not.to.have.property(
      'encryptedApiKey'
    )
  })

  it('creates providers from request body', async function (ctx) {
    ctx.req.body = {
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      apiKey: 'test-key',
    }

    await ctx.Controller.create(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.createProvider).to.have.been.calledWith(ctx.req.body)
    expect(ctx.res.statusCode).to.equal(201)
    expect(jsonBody(ctx.res)).to.deep.equal({
      provider: ctx.provider,
    })
  })

  it('returns validation errors without leaking input secrets', async function (ctx) {
    const err = new Error('invalid input')
    err.name = 'ZodError'
    ctx.Manager.createProvider.rejects(err)
    ctx.req.body = {
      apiKey: 'test-key',
    }

    await ctx.Controller.create(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI provider input',
      },
    })
    expect(ctx.res.body).not.to.include('test-key')
  })

  it('syncs provider models', async function (ctx) {
    ctx.req.params.providerId = 'provider-id'

    await ctx.Controller.syncModels(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.syncModels).to.have.been.calledWith('provider-id')
    expect(jsonBody(ctx.res)).to.deep.equal({
      provider: ctx.provider,
    })
  })

  it('tests provider connectivity', async function (ctx) {
    ctx.req.params.providerId = 'provider-id'

    await ctx.Controller.testProvider(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.testProvider).to.have.been.calledWith('provider-id')
    expect(jsonBody(ctx.res)).to.deep.equal({
      ok: true,
      provider: ctx.provider,
    })
  })
})
