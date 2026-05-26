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
    ctx.ProjectGetter = {
      promises: {
        getProject: sinon.stub().resolves({
          _id: 'project-id',
          storageBackend: 'mongo',
        }),
      },
    }
    ctx.ProjectStorageMigrationService = {
      migrateProjectToFilesystem: sinon.stub().resolves({
        projectId: 'project-id',
        workspaceRoot: '/tmp/superpaper/project-id/workspace',
      }),
    }
    ctx.ProjectCheckpointService = {
      restoreCommit: sinon.stub().resolves({
        commitHash: 'a'.repeat(40),
        changedPaths: ['/main.tex'],
      }),
    }
    ctx.ProjectWorkspaceWatcher = {
      start: sinon.stub().resolves(),
      poll: sinon.stub().resolves(),
    }
    ctx.logger = {
      error: sinon.stub(),
    }
    ctx.ClineAgentRuntimeAdapter = {
      runTurn: sinon.stub().callsFake(async function* () {
        yield {
          type: 'message',
          payload: {
            role: 'assistant',
            content: 'Cline changed the project.',
          },
        }
      }),
    }
    ctx.decryptApiKey = sinon.stub().resolves('test-key')
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
    vi.doMock('../../../../app/src/Features/Project/ProjectGetter', () => ({
      default: ctx.ProjectGetter,
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectStorageMigrationService.mjs',
      () => ({
        default: ctx.ProjectStorageMigrationService,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectCheckpointService.mjs',
      () => ({
        default: ctx.ProjectCheckpointService,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectWorkspaceWatcher.mjs',
      () => ({
        default: ctx.ProjectWorkspaceWatcher,
      })
    )
    vi.doMock('@superpaper/logger', () => ({
      default: ctx.logger,
    }))
    vi.doMock(
      '../../../../app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs',
      () => ctx.ClineAgentRuntimeAdapter
    )
    vi.doMock(
      '../../../../app/src/Features/AiAssistant/AiProviderSecrets',
      () => ({
        decryptApiKey: ctx.decryptApiKey,
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

  it('routes filesystem projects through the Cline adapter', async function (ctx) {
    ctx.ProjectGetter.promises.getProject.resolves({
      _id: 'project-id',
      storageBackend: 'filesystem',
    })

    const streamedEvents = []
    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Update the paper',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      onEvent: event => streamedEvents.push(event),
    })

    expect(ctx.ClineAgentRuntimeAdapter.runTurn).to.have.been.calledWith(
      sinon.match({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
        prompt: 'Update the paper',
        provider: {
          providerId: 'provider-id',
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'test-key',
          model: 'gpt-4.1',
        },
      })
    )
    expect(streamedEvents.map(event => event.type)).to.deep.equal([
      'message',
      'message',
    ])
    expect(streamedEvents[0].payload.kind).to.equal('context')
    expect(result.answer).to.equal('Cline changed the project.')
    expect(result.session.status).to.equal('completed')
  })

  it('migrates mongo projects before running Cline', async function (ctx) {
    const streamedEvents = []
    const result = await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Update the paper',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      onEvent: event => streamedEvents.push(event),
    })

    expect(
      ctx.ProjectStorageMigrationService.migrateProjectToFilesystem
    ).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
    })
    expect(ctx.ClineAgentRuntimeAdapter.runTurn).to.have.been.calledWith(
      sinon.match({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
        prompt: 'Update the paper',
        provider: {
          providerId: 'provider-id',
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'test-key',
          model: 'gpt-4.1',
        },
      })
    )
    expect(streamedEvents.map(event => event.type)).to.deep.equal([
      'message',
      'message',
    ])
    expect(streamedEvents[0].payload.kind).to.equal('context')
    expect(result.answer).to.equal('Cline changed the project.')
    expect(result.session.status).to.equal('completed')
  })

  it('starts the workspace watcher after filesystem preparation so direct Cline edits refresh clients', async function (ctx) {
    await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Update the paper',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    expect(ctx.ProjectWorkspaceWatcher.start).to.have.been.calledWith(
      'project-id'
    )
    expect(
      ctx.ProjectWorkspaceWatcher.start.calledAfter(
        ctx.ProjectStorageMigrationService.migrateProjectToFilesystem
      )
    ).to.equal(true)
    expect(
      ctx.ClineAgentRuntimeAdapter.runTurn.calledAfter(
        ctx.ProjectWorkspaceWatcher.start
      )
    ).to.equal(true)
  })

  it('continues an agent session through Cline', async function (ctx) {
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

    expect(ctx.ClineAgentRuntimeAdapter.runTurn).to.have.been.calledWith(
      sinon.match({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
        prompt: 'Continue the same task',
      })
    )
  })

  it('passes project rules, selected skills, plugins, and tool policy context to Cline', async function (ctx) {
    ctx.SettingsManager.getAgentConfig.resolves({
      permissionProfile: {
        id: 'project-agent-default',
        writeToolsRequireApproval: false,
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
          id: 'academic-polish',
          name: 'academic-polish',
          displayName: 'Academic polish',
          description: 'Improve academic prose',
          requiredTools: ['project.read_file'],
          enabled: true,
          content: 'Prefer concise academic English.',
        },
      ],
      plugins: [
        {
          id: 'latex-core',
          name: 'latex-core',
          version: '1.0.0',
          enabled: true,
          skills: ['academic-polish'],
        },
      ],
      enabledSkillIds: ['academic-polish'],
      enabledPluginIds: ['latex-core'],
      instructionProfiles: [
        {
          id: 'rules-one',
          scope: 'project',
          name: 'Project Rules',
          enabled: true,
          content: 'Never edit supplementary data unless asked.',
          sha256: 'f'.repeat(64),
          bytes: 43,
        },
      ],
      toolPolicies: [
        {
          name: 'patch.propose',
          access: 'write',
          requiresApproval: false,
          category: 'patch',
          riskLevel: 'medium',
          allowedModes: ['act'],
        },
      ],
    })
    ctx.SettingsManager.getSelectedSkillsForTask.resolves([
      {
        id: 'academic-polish',
        name: 'academic-polish',
        displayName: 'Academic polish',
        description: 'Improve academic prose',
        requiredTools: ['project.read_file'],
        content: 'Prefer concise academic English.',
      },
    ])

    await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Polish the abstract',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    expect(ctx.SettingsManager.getAgentConfig).to.have.been.calledWith({
      projectId: 'project-id',
      includeContent: true,
    })
    expect(ctx.SettingsManager.getSelectedSkillsForTask).to.have.been.calledWith(
      'Polish the abstract',
      { projectId: 'project-id' }
    )
    expect(ctx.session.enabledSkillIds).to.deep.equal(['academic-polish'])
    expect(ctx.session.enabledPluginIds).to.deep.equal(['latex-core'])
    expect(ctx.session.instructionSources).to.deep.equal([
      {
        type: 'instruction-profile',
        scope: 'project',
        path: 'Project Rules',
        sha256: 'f'.repeat(64),
        bytes: 43,
      },
    ])
    expect(ctx.ClineAgentRuntimeAdapter.runTurn).to.have.been.calledWith(
      sinon.match({
        agentContext: {
          permissionProfile: sinon.match({
            id: 'project-agent-default',
            externalToolsEnabled: false,
          }),
          instructionProfiles: [
            sinon.match({
              name: 'Project Rules',
              content: 'Never edit supplementary data unless asked.',
            }),
          ],
          skills: [
            sinon.match({
              id: 'academic-polish',
              content: 'Prefer concise academic English.',
            }),
          ],
          enabledPluginIds: ['latex-core'],
          toolPolicies: [
            sinon.match({
              name: 'patch.propose',
              requiresApproval: false,
            }),
          ],
        },
      })
    )
  })

  it('records a readable Cline runtime context event before Cline starts', async function (ctx) {
    await ctx.Runtime.runTurn({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Diagnose compile errors',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })

    const contextCall = ctx.AgentEvent.create
      .getCalls()
      .find(call => call.args[0].payload?.kind === 'context')

    expect(contextCall).to.exist
    expect(contextCall.args[0]).to.deep.include({
      type: 'message',
    })
    expect(contextCall.args[0].payload).to.deep.include({
      role: 'system',
      kind: 'context',
      enabledSkillIds: ['latex-compile-debug'],
      enabledPluginIds: ['latex-core'],
      permissionProfileId: 'project-agent-default',
    })
    expect(contextCall.args[0].payload.content).to.contain('Cline runtime')
    expect(contextCall.args[0].payload.toolPolicySummary).to.deep.equal({
      directWorkspaceWrites: true,
      shellEnabled: true,
      externalToolsEnabled: false,
      mcpEnabled: false,
      spawnAgentEnabled: false,
      agentTeamsEnabled: false,
    })
    expect(
      contextCall.calledBefore(ctx.ClineAgentRuntimeAdapter.runTurn.firstCall)
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

  it('requires project write access before preparing and running Cline', async function (ctx) {
    ctx.session.mode = 'plan'
    ctx.session.status = 'planning'
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
    expect(
      ctx.ProjectStorageMigrationService.migrateProjectToFilesystem
    ).not.to.have.been.called
    expect(ctx.ClineAgentRuntimeAdapter.runTurn).not.to.have.been.called
  })

  it('logs sanitized Cline runtime diagnostics while keeping user events generic', async function (ctx) {
    const leakedError = Object.assign(
      new Error(
        'Cline failed with apiKey test-key and Authorization Bearer abc123'
      ),
      {
        code: 'CLINE_GATEWAY_REJECTED',
      }
    )
    ctx.ClineAgentRuntimeAdapter.runTurn.callsFake(async function* () {
      yield* []
      throw leakedError
    })

    await expectRejectsWithCode(
      ctx.Runtime.runTurn({
        projectId: 'project-id',
        userId: 'user-id',
        sessionId: 'session-id',
        prompt: 'Update wording',
        providerId: 'provider-id',
        model: 'gpt-4.1',
      }),
      'CLINE_GATEWAY_REJECTED'
    )

    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'error',
        payload: {
          code: 'CLINE_GATEWAY_REJECTED',
          message: 'Agent request failed',
        },
      })
    )
    expect(ctx.logger.error).to.have.been.calledOnce
    const [logPayload, logMessage] = ctx.logger.error.firstCall.args
    expect(logMessage).to.equal('cline agent runtime failed')
    expect(logPayload).to.include({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      errorName: 'Error',
      errorCode: 'CLINE_GATEWAY_REJECTED',
    })
    expect(logPayload.errorMessage).to.include('Cline failed with')
    expect(logPayload.errorMessage).not.to.include('test-key')
    expect(logPayload.errorMessage).not.to.include('abc123')
  })

  it('rolls a direct Cline session back to a checkpoint and records the restore event', async function (ctx) {
    const watcherState = { projectId: 'project-id' }
    ctx.ProjectWorkspaceWatcher.start.resolves(watcherState)

    const result = await ctx.Runtime.rollbackSessionToCheckpoint({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      commitHash: 'a'.repeat(40),
    })

    expect(ctx.AuthorizationManager.promises.canUserWriteProjectContent).to.have
      .been.calledWith('user-id', 'project-id', null)
    expect(ctx.ProjectWorkspaceWatcher.start).to.have.been.calledWith(
      'project-id'
    )
    expect(ctx.ProjectCheckpointService.restoreCommit).to.have.been.calledWith({
      projectId: 'project-id',
      commitHash: 'a'.repeat(40),
    })
    expect(ctx.ProjectWorkspaceWatcher.poll).to.have.been.calledWith(
      watcherState
    )
    expect(ctx.AgentEvent.create).to.have.been.calledWith(
      sinon.match({
        type: 'checkpoint_restored',
        payload: {
          commitHash: 'a'.repeat(40),
          changedPaths: ['/main.tex'],
        },
      })
    )
    expect(result).to.deep.include({
      restoredCommitHash: 'a'.repeat(40),
    })
    expect(result.changedPaths).to.deep.equal(['/main.tex'])
    expect(result.event).to.deep.include({
      sessionId: 'session-id',
      sequence: 1,
      type: 'checkpoint_restored',
    })
    expect(result.event.payload).to.deep.equal({
      commitHash: 'a'.repeat(40),
      changedPaths: ['/main.tex'],
    })
    expect(result.session).to.deep.equal({
      id: 'session-id',
      projectId: 'project-id',
      userId: 'user-id',
      status: 'planning',
      mode: 'plan',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      task: 'Explain the project',
      instructionSources: [],
      enabledSkillIds: [],
      enabledPluginIds: [],
      permissionProfileId: 'project-agent-default',
    })
    expect(result).to.not.have.property('encryptedApiKey')
    expect(result).to.deep.include({
      session: {
        id: 'session-id',
        projectId: 'project-id',
        userId: 'user-id',
        status: 'planning',
        mode: 'plan',
        providerId: 'provider-id',
        model: 'gpt-4.1',
        task: 'Explain the project',
        instructionSources: [],
        enabledSkillIds: [],
        enabledPluginIds: [],
        permissionProfileId: 'project-agent-default',
      },
      restoredCommitHash: 'a'.repeat(40),
      changedPaths: ['/main.tex'],
    })
  })

})
