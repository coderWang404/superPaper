import { expect, vi } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProviderAdminController.mjs'

function jsonBody(res) {
  return JSON.parse(res.body)
}

function unsafeProvider(provider) {
  return {
    ...provider,
    apiKey: 'test-key',
    encryptedApiKey: 'encrypted-test-key',
  }
}

function expectBodyToBeSecretFree(res) {
  expect(res.body).not.to.include('test-key')
  expect(res.body).not.to.include('encrypted-test-key')
  expect(res.body).not.to.include('apiKey')
  expect(res.body).not.to.include('encryptedApiKey')
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
      updateProvider: sinon.stub().resolves(ctx.provider),
      deleteProvider: sinon.stub().resolves(true),
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

  it('removes provider secrets from all provider response shapes', async function (ctx) {
    ctx.Manager.listProviders.resolves([unsafeProvider(ctx.provider)])
    ctx.Manager.createProvider.resolves(unsafeProvider(ctx.provider))
    ctx.Manager.updateProvider.resolves(unsafeProvider(ctx.provider))
    ctx.Manager.syncModels.resolves(unsafeProvider(ctx.provider))
    ctx.Manager.testProvider.resolves({
      ok: true,
      provider: unsafeProvider(ctx.provider),
    })

    await ctx.Controller.list(ctx.req, ctx.res, ctx.next)
    expectBodyToBeSecretFree(ctx.res)

    ctx.res = new MockResponse(vi)
    await ctx.Controller.create(ctx.req, ctx.res, ctx.next)
    expectBodyToBeSecretFree(ctx.res)

    ctx.res = new MockResponse(vi)
    ctx.req.params.providerId = 'provider-id'
    await ctx.Controller.update(ctx.req, ctx.res, ctx.next)
    expectBodyToBeSecretFree(ctx.res)

    ctx.res = new MockResponse(vi)
    await ctx.Controller.syncModels(ctx.req, ctx.res, ctx.next)
    expectBodyToBeSecretFree(ctx.res)

    ctx.res = new MockResponse(vi)
    await ctx.Controller.testProvider(ctx.req, ctx.res, ctx.next)
    expectBodyToBeSecretFree(ctx.res)
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
    err.issues = [
      {
        path: ['baseURL'],
        message: 'baseURL must use https',
      },
      {
        path: ['apiKey'],
        message: 'Required',
      },
    ]
    ctx.Manager.createProvider.rejects(err)
    ctx.req.body = {
      baseURL: 'http://unsafe.example.test/sensitive-path',
      apiKey: 'test-key',
    }

    await ctx.Controller.create(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI provider input',
        fields: [
          {
            field: 'baseURL',
            message: 'baseURL must use https',
          },
          {
            field: 'apiKey',
            message: 'Required',
          },
        ],
      },
    })
    expect(ctx.res.body).not.to.include('test-key')
    expect(ctx.res.body).not.to.include('unsafe.example.test')
  })

  it('maps AI provider validation errors to 422 without leaking secrets', async function (ctx) {
    const err = new Error('baseURL must use https')
    err.name = 'AiProviderValidationError'
    err.fields = [
      {
        field: 'baseURL',
        message: 'baseURL must use https',
      },
    ]
    ctx.Manager.syncModels.rejects(err)
    ctx.req.params.providerId = 'provider-id'
    ctx.req.body = {
      baseURL: 'http://unsafe.example.test/private',
      apiKey: 'test-key',
      encryptedApiKey: 'encrypted-test-key',
    }

    await ctx.Controller.syncModels(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI provider input',
        fields: [
          {
            field: 'baseURL',
            message: 'baseURL must use https',
          },
        ],
      },
    })
    expect(ctx.res.body).not.to.include('test-key')
    expect(ctx.res.body).not.to.include('encrypted-test-key')
    expect(ctx.res.body).not.to.include('unsafe.example.test')
  })

  it('sanitizes AI provider validation error fields before responding', async function (ctx) {
    const err = new Error('baseURL must use https')
    err.name = 'AiProviderValidationError'
    err.fields = [
      {
        field: 'baseURL',
        message: 'baseURL must use https',
        value: 'http://unsafe.example.test/private',
        apiKey: 'test-key',
        encryptedApiKey: 'encrypted-test-key',
      },
      {
        field: 42,
        message: { text: 'not a string' },
        value: 'ignored',
      },
    ]
    ctx.Manager.syncModels.rejects(err)
    ctx.req.params.providerId = 'provider-id'

    await ctx.Controller.syncModels(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid AI provider input',
        fields: [
          {
            field: 'baseURL',
            message: 'baseURL must use https',
          },
          {
            field: '42',
            message: 'Invalid AI provider input',
          },
        ],
      },
    })
    expect(ctx.res.body).not.to.include('test-key')
    expect(ctx.res.body).not.to.include('encrypted-test-key')
    expect(ctx.res.body).not.to.include('unsafe.example.test')
  })

  it('maps provider client errors to 502 without leaking secrets', async function (ctx) {
    const err = new Error('upstream saw provider credential value')
    err.name = 'AiProviderError'
    ctx.Manager.syncModels.rejects(err)
    ctx.req.params.providerId = 'provider-id'

    await ctx.Controller.syncModels(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(502)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'PROVIDER_ERROR',
        message: 'AI provider request failed',
      },
    })
    expect(ctx.res.body).not.to.include('provider credential value')
  })

  it('syncs provider models', async function (ctx) {
    ctx.req.params.providerId = 'provider-id'

    await ctx.Controller.syncModels(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.syncModels).to.have.been.calledWith('provider-id')
    expect(jsonBody(ctx.res)).to.deep.equal({
      provider: ctx.provider,
    })
  })

  it('updates providers from request body', async function (ctx) {
    ctx.req.params.providerId = 'provider-id'
    ctx.req.body = {
      enabled: false,
      apiKey: 'test-key',
    }

    await ctx.Controller.update(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.updateProvider).to.have.been.calledWith(
      'provider-id',
      ctx.req.body
    )
    expect(jsonBody(ctx.res)).to.deep.equal({
      provider: ctx.provider,
    })
  })

  it('returns 404 when updating a missing provider', async function (ctx) {
    ctx.Manager.updateProvider.resolves(null)
    ctx.req.params.providerId = 'missing-provider'

    await ctx.Controller.update(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.updateProvider).to.have.been.calledWith(
      'missing-provider',
      ctx.req.body
    )
    expect(ctx.res.statusCode).to.equal(404)
    expect(ctx.res.body).to.equal(undefined)
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

  it('returns 404 when testing a missing provider', async function (ctx) {
    ctx.Manager.testProvider.resolves(null)
    ctx.req.params.providerId = 'missing-provider'

    await ctx.Controller.testProvider(ctx.req, ctx.res, ctx.next)

    expect(ctx.Manager.testProvider).to.have.been.calledWith('missing-provider')
    expect(ctx.res.statusCode).to.equal(404)
    expect(ctx.res.body).to.equal(undefined)
  })
})
