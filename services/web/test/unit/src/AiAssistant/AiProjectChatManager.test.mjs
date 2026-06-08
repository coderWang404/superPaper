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
    ctx.logger = {
      warn: sinon.stub(),
    }

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
    vi.doMock('@superpaper/logger', () => ({
      default: ctx.logger,
    }))

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
      maxChars: sinon.match.number,
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

  it('reserves context budget for the current prompt and chat history', async function (ctx) {
    await ctx.Manager.chat({
      projectId: 'project-id',
      prompt: 'P'.repeat(1_000),
      providerId: 'provider-id',
      model: 'gpt-4.1',
      history: [
        { role: 'user', content: 'H'.repeat(5_000) },
        { role: 'assistant', content: 'A'.repeat(5_000) },
      ],
    })

    const [, options] = ctx.buildProjectContext.firstCall.args
    expect(options.maxChars).to.be.lessThan(64_000)
    expect(options.maxChars).to.be.greaterThan(40_000)
  })

  it('limits history so project context still has room in large conversations', async function (ctx) {
    await ctx.Manager.chat({
      projectId: 'project-id',
      prompt: 'P'.repeat(8_000),
      providerId: 'provider-id',
      model: 'gpt-4.1',
      history: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: 'H'.repeat(12_000),
      })),
    })

    const [, options] = ctx.buildProjectContext.firstCall.args
    expect(options.maxChars).to.be.greaterThan(30_000)
    expect(options.maxChars).to.be.lessThan(40_000)
  })

  it('includes previous chat messages before the current prompt', async function (ctx) {
    await ctx.Manager.chat({
      projectId: 'project-id',
      prompt: 'Continue',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      history: [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ],
    })

    const chatArgs = ctx.createOpenAICompatibleChatCompletion.firstCall.args[0]
    expect(chatArgs.messages.slice(-3)).to.deep.equal([
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: 'Previous answer' },
      { role: 'user', content: 'Continue' },
    ])
  })

  it('streams answers with project context metadata', async function (ctx) {
    const abortController = new AbortController()
    const result = await ctx.Manager.chatStream({
      projectId: 'project-id',
      prompt: 'Explain this project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
      signal: abortController.signal,
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
      signal: abortController.signal,
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

  it('does not use legacy providers with non-https base URLs', async function (ctx) {
    ctx.provider.baseURL = 'http://ai.example.test'

    await expect(
      ctx.Manager.chat({
        projectId: 'project-id',
        prompt: 'Explain this project',
        providerId: 'provider-id',
        model: 'gpt-4.1',
      })
    ).to.be.rejectedWith('No enabled AI provider is configured')

    expect(ctx.decryptApiKey).not.to.have.been.called
    expect(ctx.buildProjectContext).not.to.have.been.called
    expect(ctx.createOpenAICompatibleChatCompletion).not.to.have.been.called
  })

  it('logs sanitized provider failures for chat requests', async function (ctx) {
    const providerError = new Error('fetch failed for https://ai.example.test')
    providerError.name = 'TypeError'
    providerError.cause = new Error('socket hang up')
    ctx.createOpenAICompatibleChatCompletion.rejects(providerError)

    await expect(
      ctx.Manager.chat({
        projectId: 'project-id',
        prompt: 'Secret project prompt',
        providerId: 'provider-id',
        model: 'gpt-4.1',
      })
    ).to.be.rejectedWith('fetch failed for https://ai.example.test')

    expect(ctx.logger.warn).to.have.been.calledOnce
    const logPayload = ctx.logger.warn.firstCall.args[0]
    expect(logPayload).to.deep.equal({
      err: {
        name: 'TypeError',
        message: 'fetch failed for https://ai.example.test',
        status: undefined,
        causeName: 'Error',
        causeMessage: 'socket hang up',
      },
      aiProvider: {
        id: 'provider-id',
        name: 'Claude Hub',
        model: 'gpt-4.1',
      },
      operation: 'chat_completion',
    })
    expect(JSON.stringify(logPayload)).to.not.include('test-key')
    expect(JSON.stringify(logPayload)).to.not.include('Secret project prompt')
  })

  it('logs sanitized provider failures for streaming requests', async function (ctx) {
    const providerError = new Error('aborted after idle timeout')
    ctx.streamOpenAICompatibleChatCompletion.returns(
      (async function* () {
        yield 'partial answer'
        throw providerError
      })()
    )

    const result = await ctx.Manager.chatStream({
      projectId: 'project-id',
      prompt: 'Secret stream prompt',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    const chunks = []
    await expect(
      (async () => {
        for await (const chunk of result.stream) {
          chunks.push(chunk)
        }
      })()
    ).to.be.rejectedWith('aborted after idle timeout')

    expect(ctx.logger.warn).to.have.been.calledOnce
    expect(chunks).to.deep.equal(['partial answer'])
    const logPayload = ctx.logger.warn.firstCall.args[0]
    expect(logPayload.operation).to.equal('chat_stream')
    expect(logPayload.aiProvider).to.deep.equal({
      id: 'provider-id',
      name: 'Claude Hub',
      model: 'gpt-4.1',
    })
    expect(JSON.stringify(logPayload)).to.not.include('test-key')
    expect(JSON.stringify(logPayload)).to.not.include('Secret stream prompt')
  })
})
