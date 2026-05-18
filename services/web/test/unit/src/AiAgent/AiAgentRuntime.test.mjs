import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath = '../../../../app/src/Features/AiAgent/AiAgentRuntime.mjs'

async function expectRejectsWithCode(promise, code) {
  let error
  try {
    await promise
  } catch (err) {
    error = err
  }
  expect(error).to.exist
  expect(error.code).to.equal(code)
}

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
      permissionProfileId: 'project-agent-default',
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
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          limit: sinon.stub().returns({
            exec: sinon.stub().resolves([]),
          }),
        }),
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
    ctx.AuthorizationManager = {
      promises: {
        canUserWriteProjectContent: sinon.stub().resolves(true),
      },
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
        category: 'project',
        riskLevel: 'low',
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
    ctx.selectedSkills = [
      {
        id: 'latex-compile-debug',
        name: 'latex-compile-debug',
        description: 'Analyze compile errors',
        requiredTools: ['project.read_file'],
        content: 'Debug compile errors.',
      },
    ]
    ctx.enabledPlugins = [
      {
        id: 'latex-core',
        name: 'latex-core',
        version: '1.0.0',
        enabled: true,
        skills: ['latex-compile-debug'],
      },
    ]
    ctx.formatSkillsForPrompt = sinon.stub().returns('### Skill: latex-compile-debug')
    ctx.SettingsManager = {
      getAgentConfig: sinon.stub().resolves({
        permissionProfile: {
          id: 'project-agent-default',
          writeToolsRequireApproval: true,
          externalToolsEnabled: false,
          actRequiredForWriteTools: true,
        },
        tools: [
          {
            name: 'project.read_file',
            description: 'Read file',
            access: 'read',
            requiresApproval: false,
            category: 'project',
            riskLevel: 'low',
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
            enabled: true,
            scope: 'builtin',
            pluginId: 'latex-core',
          },
        ],
        plugins: ctx.enabledPlugins,
        enabledSkillIds: ['latex-compile-debug'],
        enabledPluginIds: ['latex-core'],
        instructionProfiles: [],
        toolPolicies: [
          {
            name: 'patch.propose',
            access: 'write',
            requiresApproval: true,
            category: 'patch',
            riskLevel: 'medium',
            allowedModes: ['act'],
          },
        ],
      }),
      getSelectedSkillsForTask: sinon.stub().resolves(ctx.selectedSkills),
      listEnabledPluginDefinitions: sinon.stub().resolves(ctx.enabledPlugins),
    }
    ctx.AiAgentPatchError = class AiAgentPatchError extends Error {}
    ctx.PermissionManager = {
      getDefaultPermissionProfile: sinon.stub().returns({
        id: 'project-agent-default',
        writeToolsRequireApproval: true,
        externalToolsEnabled: false,
        actRequiredForWriteTools: true,
      }),
      isToolAllowed: sinon.stub().returns({ allowed: true }),
      listToolPolicyDefinitions: sinon.stub().returns([
        {
          name: 'patch.propose',
          access: 'write',
          requiresApproval: true,
          category: 'patch',
          riskLevel: 'medium',
          allowedModes: ['act'],
        },
      ]),
    }

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
      '../../../../app/src/Features/Authorization/AuthorizationManager',
      () => ({
        default: ctx.AuthorizationManager,
      })
    )
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
        formatSkillsForPrompt: ctx.formatSkillsForPrompt,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPatchManager',
      () => ({
        AiAgentPatchError: ctx.AiAgentPatchError,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPermissionManager',
      () => ctx.PermissionManager
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentSettingsManager',
      () => ctx.SettingsManager
    )

    ctx.Runtime = await import(modulePath)
  })

  it('returns the project agent config', async function (ctx) {
    expect(
      await ctx.Runtime.getAgentConfig({ projectId: 'project-id' })
    ).to.deep.equal({
      permissionProfile: {
        id: 'project-agent-default',
        writeToolsRequireApproval: true,
        externalToolsEnabled: false,
        actRequiredForWriteTools: true,
      },
      tools: [
        {
            name: 'project.read_file',
            description: 'Read file',
            access: 'read',
            requiresApproval: false,
            category: 'project',
            riskLevel: 'low',
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
          enabled: true,
          scope: 'builtin',
          pluginId: 'latex-core',
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
      enabledSkillIds: ['latex-compile-debug'],
      enabledPluginIds: ['latex-core'],
      instructionProfiles: [],
      toolPolicies: [
        {
          name: 'patch.propose',
          access: 'write',
          requiresApproval: true,
          category: 'patch',
          riskLevel: 'medium',
          allowedModes: ['act'],
        },
      ],
    })
    expect(ctx.SettingsManager.getAgentConfig).to.have.been.calledWith({
      projectId: 'project-id',
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
      permissionProfileId: 'project-agent-default',
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
    expect(ctx.SettingsManager.getSelectedSkillsForTask).to.have.been.calledWith(
      'Explain the project',
      { projectId: 'project-id' }
    )
    expect(ctx.createOpenAICompatibleChatCompletion).to.have.been.calledTwice
    expect(ctx.executeTool).to.have.been.calledWith({
      name: 'project.read_file',
      input: { path: '/main.tex' },
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      selection: undefined,
    })
    expect(ctx.PermissionManager.isToolAllowed).to.have.been.calledWith({
      toolName: 'project.read_file',
      mode: 'plan',
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
    expect(result.session.status).to.equal('waiting_for_act')
    expect(result.session.enabledPluginIds).to.deep.equal(['latex-core'])
  })

  it('continues an agent session with previous user and assistant messages', async function (ctx) {
    ctx.AgentEvent.find.returns({
      sort: sinon.stub().returns({
        limit: sinon.stub().returns({
          exec: sinon.stub().resolves([
            {
              payload: {
                role: 'assistant',
                kind: 'final',
                content: 'Previous answer.',
              },
            },
            {
              payload: {
                role: 'user',
                content: 'Previous question.',
              },
            },
          ]),
        }),
      }),
    })

    await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Continue the same task',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    const firstMessages =
      ctx.createOpenAICompatibleChatCompletion.firstCall.args[0].messages
    expect(
      firstMessages.some(message =>
        String(message.content).includes('Previous question.')
      )
    ).to.equal(true)
    expect(
      firstMessages.some(message =>
        String(message.content).includes('Previous answer.')
      )
    ).to.equal(true)
  })

  it('persists provider and model when a later turn switches channel', async function (ctx) {
    const nextProvider = {
      ...ctx.provider,
      _id: 'provider-two',
      name: 'Provider Two',
      defaultModel: 'model-two',
      models: [{ id: 'model-two', displayName: 'model-two', enabled: true }],
    }
    ctx.AiProvider.findById.returns({
      exec: sinon.stub().resolves(nextProvider),
    })

    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Continue with another provider',
      providerId: 'provider-two',
      model: 'model-two',
    })

    expect(ctx.session.providerId).to.equal('provider-two')
    expect(ctx.session.model).to.equal('model-two')
    expect(result.session.providerId).to.equal('provider-two')
    expect(result.session.model).to.equal('model-two')
  })

  it('starts act mode for a planned session', async function (ctx) {
    ctx.session.status = 'waiting_for_act'

    const session = await ctx.Runtime.startAct({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
    })

    expect(ctx.session.mode).to.equal('act')
    expect(ctx.session.status).to.equal('ready_for_act')
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'mode_changed',
        payload: {
          from: 'plan',
          to: 'act',
        },
      })
    )
    expect(session.mode).to.equal('act')
  })

  it('does not start act mode before a plan turn completes', async function (ctx) {
    ctx.session.status = 'planning'

    await expectRejectsWithCode(
      ctx.Runtime.startAct({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
      }),
      'AGENT_SESSION_NOT_READY_FOR_ACT'
    )
  })

  it('does not run another turn while a patch is awaiting approval', async function (ctx) {
    ctx.session.status = 'waiting_for_approval'

    await expectRejectsWithCode(
      ctx.Runtime.runTurn({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
        prompt: 'Continue editing',
        providerId: 'provider-id',
        model: 'gpt-4.1',
      }),
      'AGENT_SESSION_NOT_RUNNABLE'
    )
    expect(ctx.decryptApiKey).to.not.have.been.called
  })

  it('requires project write access before running act turns', async function (ctx) {
    ctx.session.mode = 'act'
    ctx.session.status = 'ready_for_act'
    ctx.AuthorizationManager.promises.canUserWriteProjectContent.resolves(false)

    await expectRejectsWithCode(
      ctx.Runtime.runTurn({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
        prompt: 'Update wording',
        providerId: 'provider-id',
        model: 'gpt-4.1',
      }),
      'AGENT_ACT_PERMISSION_DENIED'
    )
    expect(ctx.decryptApiKey).to.not.have.been.called
  })

  it('denies write tools in plan mode before execution', async function (ctx) {
    ctx.PermissionManager.isToolAllowed
      .withArgs({
        toolName: 'patch.propose',
        mode: 'plan',
      })
      .returns({
        allowed: false,
        reason: 'AGENT_MODE_NOT_ALLOWED',
        message: 'Agent tool is not allowed in the current mode',
      })
    ctx.createOpenAICompatibleChatCompletion.reset()
    ctx.createOpenAICompatibleChatCompletion.onFirstCall().resolves(
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
    ctx.createOpenAICompatibleChatCompletion.onSecondCall().resolves(
      JSON.stringify({ final: 'Need act mode.' })
    )

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

    expect(ctx.executeTool).to.not.have.been.called
    expect(streamedEvents.map(event => event.type)).to.include(
      'permission_denied'
    )
    expect(result.session.status).to.equal('waiting_for_act')
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
    ctx.session.mode = 'act'
    ctx.session.status = 'ready_for_act'
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
