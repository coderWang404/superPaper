import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProjectChatManager.mjs'

describe('AiProjectChatManager', function () {
  beforeEach(async function (ctx) {
    ctx.provider = {
      _id: 'provider-id',
      name: 'Claude Hub',
      providerType: 'openai-compatible',
      baseURL: 'https://ai.example.test',
      encryptedApiKey: 'encrypted-key',
      enabled: true,
      defaultModel: 'gpt-4.1',
      models: [
        { id: 'gpt-4.1', displayName: 'gpt-4.1', enabled: true },
        { id: 'disabled-model', displayName: 'disabled-model', enabled: false },
      ],
    }
    ctx.AiProvider = {
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves([ctx.provider]),
        }),
      }),
      findById: sinon.stub().returns({
        exec: sinon.stub().resolves(ctx.provider),
      }),
    }
    ctx.decryptApiKey = sinon.stub().resolves('test-key')
    ctx.buildProjectContext = sinon.stub().resolves({
      messages: [{ role: 'user', content: '### Project file /main.tex\nHello' }],
      includedFiles: ['/main.tex'],
      selectionIncluded: true,
      truncated: false,
    })
    ctx.createOpenAICompatibleChatCompletion = sinon
      .stub()
      .resolves('AI answer')
    ctx.streamOpenAICompatibleChatCompletion = sinon.stub().returns(
      (async function* () {
        yield 'AI '
        yield 'answer'
      })()
    )

    vi.doMock('../../../../app/src/models/AiProvider', () => ({
      AiProvider: ctx.AiProvider,
    }))
    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProviderSecrets',
      () => ({
        decryptApiKey: ctx.decryptApiKey,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProjectContextBuilder',
      () => ({
        buildProjectContext: ctx.buildProjectContext,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProviderClient',
      () => ({
        createOpenAICompatibleChatCompletion:
          ctx.createOpenAICompatibleChatCompletion,
        streamOpenAICompatibleChatCompletion:
          ctx.streamOpenAICompatibleChatCompletion,
      })
    )

    ctx.Manager = await import(modulePath)
  })

  it('returns enabled provider config without secrets', async function (ctx) {
    const config = await ctx.Manager.getProjectAiConfig()

    expect(config).to.deep.equal({
      providers: [
        {
          id: 'provider-id',
          name: 'Claude Hub',
          models: [{ id: 'gpt-4.1', displayName: 'gpt-4.1', enabled: true }],
          defaultModel: 'gpt-4.1',
        },
      ],
    })
  })

  it('answers with project context and selected text metadata', async function (ctx) {
    const result = await ctx.Manager.chat({
      projectId: 'project-id',
      prompt: 'Explain this project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    })

    expect(ctx.decryptApiKey).to.have.been.calledWith('encrypted-key')
    expect(ctx.buildProjectContext).to.have.been.calledWith('project-id', {
      selection: { path: '/main.tex', text: 'Hello' },
    })
    const chatArgs = ctx.createOpenAICompatibleChatCompletion.firstCall.args[0]
    expect(chatArgs).to.include({
      baseURL: 'https://ai.example.test',
      apiKey: 'test-key',
      model: 'gpt-4.1',
    })
    expect(chatArgs.messages[0]).to.include({ role: 'system' })
    expect(chatArgs.messages.at(-1)).to.deep.equal({
      role: 'user',
      content: 'Explain this project',
    })
    expect(result).to.deep.equal({
      answer: 'AI answer',
      model: 'gpt-4.1',
      providerId: 'provider-id',
      context: {
        includedFiles: ['/main.tex'],
        selectionIncluded: true,
        truncated: false,
      },
    })
  })

  it('streams answers with project context metadata', async function (ctx) {
    const result = await ctx.Manager.chatStream({
      projectId: 'project-id',
      prompt: 'Explain this project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    })

    const chunks = []
    for await (const chunk of result.stream) {
      chunks.push(chunk)
    }

    expect(ctx.streamOpenAICompatibleChatCompletion).to.have.been.calledOnce
    const streamArgs = ctx.streamOpenAICompatibleChatCompletion.firstCall.args[0]
    expect(streamArgs).to.include({
      baseURL: 'https://ai.example.test',
      apiKey: 'test-key',
      model: 'gpt-4.1',
    })
    expect(streamArgs.messages[0]).to.include({ role: 'system' })
    expect(chunks).to.deep.equal(['AI ', 'answer'])
    expect(result.model).to.equal('gpt-4.1')
    expect(result.providerId).to.equal('provider-id')
    expect(result.context).to.deep.equal({
      includedFiles: ['/main.tex'],
      selectionIncluded: true,
      truncated: false,
    })
  })
})
