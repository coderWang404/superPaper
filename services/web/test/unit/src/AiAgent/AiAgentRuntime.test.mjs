import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath = '../../../../app/src/Features/AiAgent/AiAgentRuntime.mjs'

describe('AiAgentRuntime', function () {
  beforeEach(async function (ctx) {
    ctx.session = {
      _id: 'session-id',
      projectId: 'project-id',
      userId: 'user-id',
      status: 'planning',
      mode: 'plan',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      task: 'Explain the project',
      permissionProfileId: 'readonly-default',
      save: sinon.stub().resolvesThis(),
    }
    ctx.provider = {
      _id: 'provider-id',
      name: 'Claude Hub',
      baseURL: 'https://ai.example.test/v1',
      encryptedApiKey: 'encrypted-key',
      enabled: true,
      defaultModel: 'gpt-4.1',
      models: [{ id: 'gpt-4.1', displayName: 'gpt-4.1', enabled: true }],
    }
    ctx.AgentSession = {
      create: sinon.stub().resolves(ctx.session),
      findOne: sinon.stub().returns({
        exec: sinon.stub().resolves(ctx.session),
      }),
    }
    ctx.AgentEvent = {
      countDocuments: sinon.stub().returns({
        exec: sinon.stub().resolves(0),
      }),
      create: sinon.stub().callsFake(async event => ({
        _id: `event-${event.sequence}`,
        createdAt: new Date('2026-05-16T00:00:00Z'),
        ...event,
      })),
    }
    ctx.AiProvider = {
      findById: sinon.stub().returns({
        exec: sinon.stub().resolves(ctx.provider),
      }),
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves([ctx.provider]),
        }),
      }),
    }
    ctx.decryptApiKey = sinon.stub().resolves('test-key')
    ctx.createOpenAICompatibleChatCompletion = sinon.stub()
    ctx.createOpenAICompatibleChatCompletion.onFirstCall().resolves(
      JSON.stringify({
        plan: ['Read the main file'],
        toolCalls: [
          {
            name: 'project.read_file',
            input: { path: '/main.tex' },
          },
        ],
      })
    )
    ctx.createOpenAICompatibleChatCompletion.onSecondCall().resolves(
      JSON.stringify({
        final: 'The project contains a main LaTeX document.',
      })
    )
    ctx.executeTool = sinon.stub().resolves({
      path: '/main.tex',
      content: '\\documentclass{article}',
      truncated: false,
    })
    ctx.listToolDefinitions = sinon.stub().returns([
      {
        name: 'project.read_file',
        description: 'Read file',
        access: 'read',
        requiresApproval: false,
      },
    ])
    ctx.loadAgentInstructions = sinon.stub().resolves({
      sources: [
        {
          type: 'project-file',
          path: '/AGENTS.md',
          sha256: 'abc123',
          bytes: 10,
          content: 'Use concise answers.',
        },
      ],
      truncated: false,
    })
    ctx.listBuiltinSkills = sinon.stub().returns([
      {
        id: 'latex-compile-debug',
        name: 'latex-compile-debug',
        displayName: 'LaTeX 编译错误诊断',
        description: 'Analyze compile errors',
        modelInvocable: true,
        requiredTools: ['project.read_file'],
      },
    ])
    ctx.selectSkillsForTask = sinon.stub().returns([
      {
        id: 'latex-compile-debug',
        name: 'latex-compile-debug',
        description: 'Analyze compile errors',
        requiredTools: ['project.read_file'],
        content: 'Debug compile errors.',
      },
    ])
    ctx.formatSkillsForPrompt = sinon.stub().returns('### Skill: latex-compile-debug')
    ctx.listBuiltinPlugins = sinon.stub().returns([
      {
        id: 'latex-core',
        name: 'latex-core',
        version: '1.0.0',
        enabled: true,
        skills: ['latex-compile-debug'],
      },
    ])
    ctx.AiAgentPatchError = class AiAgentPatchError extends Error {}

    vi.doMock('../../../../app/src/models/AgentSession', () => ({
      AgentSession: ctx.AgentSession,
    }))
    vi.doMock('../../../../app/src/models/AgentEvent', () => ({
      AgentEvent: ctx.AgentEvent,
    }))
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
      '../../../../app/src/Features/AiAssistant/AiProviderClient',
      () => ({
        createOpenAICompatibleChatCompletion:
          ctx.createOpenAICompatibleChatCompletion,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentToolRegistry',
      () => ({
        executeTool: ctx.executeTool,
        listToolDefinitions: ctx.listToolDefinitions,
        AiAgentToolError: class AiAgentToolError extends Error {},
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentInstructionLoader',
      () => ({
        loadAgentInstructions: ctx.loadAgentInstructions,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentSkillManager',
      () => ({
        listBuiltinSkills: ctx.listBuiltinSkills,
        selectSkillsForTask: ctx.selectSkillsForTask,
        formatSkillsForPrompt: ctx.formatSkillsForPrompt,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPluginManager',
      () => ({
        listBuiltinPlugins: ctx.listBuiltinPlugins,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPatchManager',
      () => ({
        AiAgentPatchError: ctx.AiAgentPatchError,
      })
    )

    ctx.Runtime = await import(modulePath)
  })

  it('returns the read-only agent config', function (ctx) {
    expect(ctx.Runtime.getAgentConfig()).to.deep.equal({
      permissionProfile: {
        id: 'readonly-default',
        writeToolsRequireApproval: true,
        externalToolsEnabled: false,
      },
      tools: [
        {
          name: 'project.read_file',
          description: 'Read file',
          access: 'read',
          requiresApproval: false,
        },
      ],
      skills: [
        {
          id: 'latex-compile-debug',
          name: 'latex-compile-debug',
          displayName: 'LaTeX 编译错误诊断',
          description: 'Analyze compile errors',
          modelInvocable: true,
          requiredTools: ['project.read_file'],
        },
      ],
      plugins: [
        {
          id: 'latex-core',
          name: 'latex-core',
          version: '1.0.0',
          enabled: true,
          skills: ['latex-compile-debug'],
        },
      ],
    })
  })

  it('creates an agent session without provider secrets', async function (ctx) {
    const session = await ctx.Runtime.createSession({
      projectId: 'project-id',
      userId: 'user-id',
      task: 'Explain the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    expect(ctx.AgentSession.create).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      task: 'Explain the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      status: 'planning',
      mode: 'plan',
      permissionProfileId: 'readonly-default',
    })
    expect(session).to.not.have.property('encryptedApiKey')
  })

  it('runs a read-only tool loop and records events', async function (ctx) {
    const streamedEvents = []
    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Explain the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      onEvent: event => streamedEvents.push(event),
    })

    expect(ctx.decryptApiKey).to.have.been.calledWith('encrypted-key')
    expect(ctx.loadAgentInstructions).to.have.been.calledWith({
      projectId: 'project-id',
      currentPath: undefined,
    })
    expect(ctx.selectSkillsForTask).to.have.been.calledWith('Explain the project')
    expect(ctx.createOpenAICompatibleChatCompletion).to.have.been.calledTwice
    expect(ctx.executeTool).to.have.been.calledWith({
      name: 'project.read_file',
      input: { path: '/main.tex' },
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      selection: undefined,
    })
    expect(result.answer).to.equal('The project contains a main LaTeX document.')
    expect(streamedEvents.map(event => event.type)).to.deep.equal([
      'message',
      'message',
      'message',
      'tool_call',
      'tool_result',
      'message',
    ])
    expect(result.session.status).to.equal('completed')
  })

  it('records compile events around compile.run tool calls', async function (ctx) {
    ctx.createOpenAICompatibleChatCompletion.reset()
    ctx.createOpenAICompatibleChatCompletion.onFirstCall().resolves(
      JSON.stringify({
        toolCalls: [
          {
            name: 'compile.run',
            input: { stopOnFirstError: true },
          },
        ],
      })
    )
    ctx.createOpenAICompatibleChatCompletion.onSecondCall().resolves(
      JSON.stringify({
        final: 'Compile succeeded.',
      })
    )
    ctx.executeTool.resolves({
      ok: true,
      status: 'success',
      buildId: 'build-one',
    })

    const streamedEvents = []
    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Compile the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      onEvent: event => streamedEvents.push(event),
    })

    expect(ctx.executeTool).to.have.been.calledWith({
      name: 'compile.run',
      input: { stopOnFirstError: true },
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      selection: undefined,
    })
    expect(streamedEvents.map(event => event.type)).to.deep.equal([
      'message',
      'message',
      'tool_call',
      'compile_started',
      'compile_result',
      'tool_result',
      'message',
    ])
    expect(streamedEvents[4].payload.result).to.deep.equal({
      ok: true,
      status: 'success',
      buildId: 'build-one',
    })
    expect(result.answer).to.equal('Compile succeeded.')
  })

  it('keeps sessions waiting for approval when a patch is proposed', async function (ctx) {
    ctx.createOpenAICompatibleChatCompletion.reset()
    ctx.createOpenAICompatibleChatCompletion.resolves(
      JSON.stringify({
        toolCalls: [
          {
            name: 'patch.propose',
            input: {
              summary: 'Update wording',
              operations: [
                {
                  type: 'replace_text',
                  path: '/main.tex',
                  oldText: 'Old',
                  newText: 'New',
                },
              ],
            },
          },
        ],
      })
    )
    ctx.executeTool.resolves({
      patchId: 'patch-one',
      requiresApproval: true,
      patch: {
        id: 'patch-one',
        status: 'pending',
        summary: 'Update wording',
        operations: [{ type: 'replace_text', path: '/main.tex' }],
      },
    })

    const streamedEvents = []
    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Update wording',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      onEvent: event => streamedEvents.push(event),
    })

    expect(ctx.executeTool).to.have.been.calledWith({
      name: 'patch.propose',
      input: {
        summary: 'Update wording',
        operations: [
          {
            type: 'replace_text',
            path: '/main.tex',
            oldText: 'Old',
            newText: 'New',
          },
        ],
      },
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      selection: undefined,
    })
    expect(streamedEvents.map(event => event.type)).to.include('patch_created')
    expect(result.session.status).to.equal('waiting_for_approval')
  })
})
