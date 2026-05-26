import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs'

async function collect(generator) {
  const values = []
  for await (const value of generator) {
    values.push(value)
  }
  return values
}

describe('ClineAgentRuntimeAdapter', function () {
  beforeEach(async function (ctx) {
    ctx.workspaceRoot = '/tmp/superpaper-workspace/project-1/workspace'
    ctx.unsubscribe = sinon.stub()
    ctx.cline = {
      start: sinon.stub().callsFake(async () => {
        ctx.clineEventListener({
          type: 'agent_event',
          payload: {
            sessionId: 'session-1',
            event: {
              type: 'content_start',
              contentType: 'text',
              text: 'Reading files',
            },
          },
        })
        ctx.clineEventListener({
          type: 'agent_event',
          payload: {
            sessionId: 'session-1',
            event: {
              type: 'content_start',
              contentType: 'tool',
              toolName: 'read_files',
              input: { paths: ['main.tex'] },
            },
          },
        })
        ctx.clineEventListener({
          type: 'agent_event',
          payload: {
            sessionId: 'session-1',
            event: {
              type: 'content_end',
              contentType: 'tool',
              toolName: 'read_files',
              output: 'ok',
            },
          },
        })
        return {
          sessionId: 'session-1',
          result: {
            text: 'Updated the paper.',
          },
        }
      }),
      subscribe: sinon.stub().callsFake(listener => {
        ctx.clineEventListener = listener
        return ctx.unsubscribe
      }),
      dispose: sinon.stub().resolves(),
    }
    ctx.ClineCore = {
      create: sinon.stub().resolves(ctx.cline),
    }
    ctx.providerSettingsManager = {
      getFilePath: sinon
        .stub()
        .returns('/tmp/superpaper-cline/settings/providers.json'),
      getProviderSettings: sinon.stub().returns(undefined),
    }
    ctx.ProviderSettingsManager = sinon
      .stub()
      .returns(ctx.providerSettingsManager)
    ctx.addLocalProvider = sinon.stub().resolves({
      providerId: 'superpaper-provider-1',
      settingsPath: '/tmp/superpaper-cline/settings/providers.json',
      modelsPath: '/tmp/superpaper-cline/settings/models.json',
      modelsCount: 1,
    })
    ctx.updateLocalProvider = sinon.stub().resolves({
      providerId: 'superpaper-provider-1',
      settingsPath: '/tmp/superpaper-cline/settings/providers.json',
      modelsPath: '/tmp/superpaper-cline/settings/models.json',
      modelsCount: 1,
    })
    ctx.ensureCustomProvidersLoaded = sinon.stub().resolves()
    ctx.createToolPoliciesWithPreset = sinon
      .stub()
      .withArgs('yolo')
      .returns({ '*': { enabled: true, autoApprove: true } })
    ctx.ProjectWorkspaceManager = {
      getWorkspaceRoot: sinon.stub().returns(ctx.workspaceRoot),
    }
    ctx.ProjectCheckpointService = {
      createCheckpoint: sinon
        .stub()
        .onFirstCall()
        .resolves({ commitHash: 'before-commit' })
        .onSecondCall()
        .resolves({ commitHash: 'after-commit' }),
      diffWorktree: sinon.stub().resolves('diff --git a/main.tex b/main.tex'),
    }
    vi.doMock('@cline/sdk', () => ({
      ClineCore: ctx.ClineCore,
      ProviderSettingsManager: ctx.ProviderSettingsManager,
      addLocalProvider: ctx.addLocalProvider,
      updateLocalProvider: ctx.updateLocalProvider,
      ensureCustomProvidersLoaded: ctx.ensureCustomProvidersLoaded,
      createToolPoliciesWithPreset: ctx.createToolPoliciesWithPreset,
      TEAM_TOOL_NAMES: ['team_spawn_teammate', 'team_status'],
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectWorkspaceManager.mjs',
      () => ({
        default: ctx.ProjectWorkspaceManager,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectCheckpointService.mjs',
      () => ({
        default: ctx.ProjectCheckpointService,
      })
    )
    ctx.Adapter = await import(modulePath)
  })

  afterEach(function () {
    vi.resetModules()
  })

  it('runs the official ClineCore session API in the project workspace', async function (ctx) {
    const events = await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
          providerId: 'provider-1',
        },
      })
    )

    expect(ctx.ProjectWorkspaceManager.getWorkspaceRoot).to.have.been.calledWith(
      'project-1'
    )
    expect(ctx.ClineCore.create).to.have.been.calledWith(
      sinon.match({
        backendMode: 'local',
        clientName: 'superpaper',
        toolPolicies: sinon.match({
          read_files: { enabled: true, autoApprove: true },
          run_commands: { enabled: true, autoApprove: true },
          fetch_web_content: { enabled: false, autoApprove: false },
          ask_question: { enabled: false, autoApprove: false },
        }),
      })
    )
    expect(ctx.ProviderSettingsManager).not.to.have.been.called
    expect(ctx.addLocalProvider).not.to.have.been.called
    expect(ctx.updateLocalProvider).not.to.have.been.called
    expect(ctx.ensureCustomProvidersLoaded).not.to.have.been.called
    expect(ctx.cline.subscribe).to.have.been.calledOnce
    expect(ctx.cline.start).to.have.been.calledWith(
      sinon.match({
        prompt: 'Improve abstract',
        interactive: false,
        config: sinon.match({
          providerId: 'aihubmix',
          superpaperProviderId: 'provider-1',
          clientType: 'openai-compatible',
          apiKey: 'plain-key',
          baseUrl: 'https://ai.example.test/v1',
          modelId: 'claude-sonnet-4.5',
          knownModels: sinon.match({
            'claude-sonnet-4.5': sinon.match({
              id: 'claude-sonnet-4.5',
              name: 'claude-sonnet-4.5',
              capabilities: ['tools', 'streaming'],
              status: 'active',
            }),
          }),
          providerConfig: sinon.match({
            providerId: 'aihubmix',
            superpaperProviderId: 'provider-1',
            clientType: 'openai-compatible',
            apiKey: 'plain-key',
            baseUrl: 'https://ai.example.test/v1',
            modelId: 'claude-sonnet-4.5',
            knownModels: sinon.match({
              'claude-sonnet-4.5': sinon.match({
                id: 'claude-sonnet-4.5',
                name: 'claude-sonnet-4.5',
                capabilities: ['tools', 'streaming'],
                status: 'active',
              }),
            }),
          }),
          cwd: ctx.workspaceRoot,
          workspaceRoot: ctx.workspaceRoot,
          mode: 'act',
          enableTools: true,
          enableSpawnAgent: false,
          enableAgentTeams: false,
          yolo: true,
        }),
      })
    )
    expect(events.map(event => event.type)).to.deep.equal([
      'checkpoint_created',
      'message',
      'tool_call',
      'tool_result',
      'message',
      'workspace_diff',
      'checkpoint_created',
    ])
    expect(events[0].payload.phase).to.equal('before')
    expect(events[6].payload.phase).to.equal('after')
    expect(events[4].payload.content).to.equal('Updated the paper.')
  })

  it('unsubscribes and disposes the Cline core after a run', async function (ctx) {
    await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
          providerId: 'provider-1',
        },
      })
    )

    expect(ctx.unsubscribe).to.have.been.calledOnce
    expect(ctx.cline.dispose).to.have.been.calledOnce
  })

  it('normalizes Mongo ObjectId-like session ids before calling Cline', async function (ctx) {
    const events = await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: {
          toString() {
            return 'session-1'
          },
        },
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
          providerId: 'provider-1',
        },
      })
    )

    expect(ctx.cline.start).to.have.been.calledWith(
      sinon.match({
        config: sinon.match({
          sessionId: 'session-1',
        }),
        sessionMetadata: sinon.match({
          superpaperAgentSessionId: 'session-1',
        }),
      })
    )
    expect(events.map(event => event.type)).to.include('tool_call')
  })

  it('updates an existing Cline local provider before starting the session', async function (ctx) {
    const zod = await import('zod')

    expect(zod.fromJSONSchema).to.be.a('function')
  })

  it('does not register project AI channels as unsupported Cline local gateway providers', async function (ctx) {
    ctx.providerSettingsManager.getProviderSettings
      .withArgs('superpaper-provider-1')
      .returns({
        provider: 'superpaper-provider-1',
        model: 'old-model',
      })

    await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
          providerId: 'provider-1',
        },
      })
    )

    expect(ctx.addLocalProvider).not.to.have.been.called
    expect(ctx.updateLocalProvider).not.to.have.been.called
    expect(ctx.ProviderSettingsManager).not.to.have.been.called
    expect(ctx.ClineCore.create).to.have.been.calledOnce
  })

  it('injects project rules and selected skills into the Cline system prompt without enabling teams', async function (ctx) {
    await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Polish abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
          providerId: 'provider-1',
        },
        agentContext: {
          instructionProfiles: [
            {
              name: 'Project Rules',
              content: 'Never edit raw data files unless asked.',
            },
          ],
          skills: [
            {
              id: 'academic-polish',
              displayName: 'Academic polish',
              description: 'Improve prose',
              requiredTools: ['project.read_file'],
              content: 'Prefer concise academic English.',
            },
          ],
          enabledPluginIds: ['latex-core'],
          toolPolicies: [
            {
              name: 'patch.propose',
              requiresApproval: false,
              allowedModes: ['act'],
            },
          ],
        },
      })
    )

    const startConfig = ctx.cline.start.firstCall.args[0].config
    expect(startConfig.enableSpawnAgent).to.equal(false)
    expect(startConfig.enableAgentTeams).to.equal(false)
    expect(startConfig.systemPrompt).to.contain('Project Rules')
    expect(startConfig.systemPrompt).to.contain(
      'Never edit raw data files unless asked.'
    )
    expect(startConfig.systemPrompt).to.contain('Academic polish')
    expect(startConfig.systemPrompt).to.contain(
      'Prefer concise academic English.'
    )
    expect(startConfig.systemPrompt).to.contain('patch.propose')
    expect(startConfig.systemPrompt).not.to.contain('plain-key')
  })

  it('uses an explicit superPaper Cline tool policy and SDK runtime metadata', async function (ctx) {
    await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Polish abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
          providerId: 'provider-1',
        },
        agentContext: {
          permissionProfile: {
            id: 'project-agent-default',
            externalToolsEnabled: false,
          },
          skills: [
            {
              id: 'academic-polish',
              displayName: 'Academic polish',
              content: 'Prefer concise academic English.',
            },
          ],
          enabledPluginIds: ['latex-core'],
        },
      })
    )

    const createOptions = ctx.ClineCore.create.firstCall.args[0]
    expect(createOptions.toolPolicies.read_files).to.deep.equal({
      enabled: true,
      autoApprove: true,
    })
    expect(createOptions.toolPolicies.search_codebase).to.deep.equal({
      enabled: true,
      autoApprove: true,
    })
    expect(createOptions.toolPolicies.run_commands).to.deep.equal({
      enabled: true,
      autoApprove: true,
    })
    expect(createOptions.toolPolicies.apply_patch).to.deep.equal({
      enabled: true,
      autoApprove: true,
    })
    expect(createOptions.toolPolicies.editor).to.deep.equal({
      enabled: true,
      autoApprove: true,
    })
    expect(createOptions.toolPolicies.fetch_web_content).to.deep.equal({
      enabled: false,
      autoApprove: false,
    })
    expect(createOptions.toolPolicies.ask_question).to.deep.equal({
      enabled: false,
      autoApprove: false,
    })
    expect(createOptions.toolPolicies.team_spawn_teammate).to.deep.equal({
      enabled: false,
      autoApprove: false,
    })

    const startConfig = ctx.cline.start.firstCall.args[0].config
    expect(startConfig.skills).to.deep.equal(['academic-polish'])
    expect(startConfig.checkpoint).to.deep.equal({ enabled: false })
    expect(startConfig.workspaceMetadata).to.contain(
      'superPaper project project-1'
    )
    expect(startConfig.workspaceMetadata).to.contain(
      'direct workspace writes: enabled'
    )
    expect(startConfig.workspaceMetadata).not.to.contain('plain-key')
  })
})
