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
})
