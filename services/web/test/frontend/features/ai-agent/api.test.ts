import { expect } from 'chai'
import fetchMock from 'fetch-mock'

import {
  applyProjectAiAgentPatch,
  createProjectAiAgentSession,
  getEditableProjectAiAgentConfig,
  getProjectAiAgentConfig,
  installProjectAiAgentPlugin,
  listProjectAiAgentPlugins,
  previewProjectAiAgentPlugin,
  rejectProjectAiAgentPatch,
  rollbackProjectAiAgentPatch,
  sendProjectAiAgentTurnStream,
  setProjectAiAgentPluginEnabled,
  startProjectAiAgentAct,
  updateProjectAiAgentSettings,
} from '../../../../frontend/js/features/ai-agent/api'

describe('ai-agent api', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('loads project agent config', async function () {
    fetchMock.get('/project/project123/ai/agent/config', {
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
      toolPolicies: [
        {
          name: 'project.read_file',
          access: 'read',
          requiresApproval: false,
          category: 'project',
          riskLevel: 'low',
          allowedModes: ['plan', 'act'],
        },
      ],
      skills: [{ id: 'latex-compile-debug' }],
      plugins: [{ id: 'latex-core' }],
      enabledSkillIds: ['latex-compile-debug'],
      enabledPluginIds: ['latex-core'],
      instructionProfiles: [],
    })

    const config = await getProjectAiAgentConfig('project123')

    expect(config.permissionProfile.id).to.equal('project-agent-default')
    expect(config.tools[0].name).to.equal('project.read_file')
  })

  it('loads editable project agent config', async function () {
    fetchMock.get('/project/project123/ai/agent/config?includeContent=true', {
      permissionProfile: {
        id: 'project-agent-default',
      },
      tools: [],
      skills: [{ id: 'project-skill', content: 'Skill body' }],
      plugins: [],
      instructionProfiles: [
        {
          name: 'Project Agent Rules',
          content: 'Project rules',
        },
      ],
    })

    const config = await getEditableProjectAiAgentConfig('project123')

    expect(config.skills[0].content).to.equal('Skill body')
    expect(config.instructionProfiles?.[0].content).to.equal('Project rules')
  })

  it('updates project agent settings with PATCH', async function () {
    fetchMock.patch('/project/project123/ai/agent/settings?includeContent=true', {
      skills: [],
      plugins: [],
      instructionProfiles: [],
    })

    await updateProjectAiAgentSettings('project123', {
      instructionProfiles: [
        {
          id: 'rules',
          scope: 'project',
          projectId: 'project123',
          name: 'Project Agent Rules',
          content: 'Project rules',
          enabled: true,
          createdAt: null,
          updatedAt: null,
        },
      ],
    })

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/settings?includeContent=true'
    )[0]
    expect(call.options.method).to.equal('patch')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      instructionProfiles: [
        {
          id: 'rules',
          scope: 'project',
          projectId: 'project123',
          name: 'Project Agent Rules',
          content: 'Project rules',
          enabled: true,
          createdAt: null,
          updatedAt: null,
        },
      ],
    })
  })

  it('manages project-scoped plugins', async function () {
    fetchMock.get('/project/project123/ai/agent/plugins', {
      plugins: [{ pluginId: 'latex-plugin' }],
    })
    fetchMock.post('/project/project123/ai/agent/plugins/preview', {
      preview: { plugin: { id: 'latex-plugin' }, skills: [] },
    })
    fetchMock.post('/project/project123/ai/agent/plugins/install', {
      plugin: { pluginId: 'latex-plugin' },
      config: {},
    })
    fetchMock.patch('/project/project123/ai/agent/plugins/latex-plugin', {
      plugin: { pluginId: 'latex-plugin', enabled: false },
      config: {},
    })

    await listProjectAiAgentPlugins('project123')
    await previewProjectAiAgentPlugin('project123', {
      sourceType: 'github',
      url: 'https://github.com/example/latex-plugin',
    })
    await installProjectAiAgentPlugin('project123', {
      sourceType: 'github',
      url: 'https://github.com/example/latex-plugin',
      enabled: true,
    })
    await setProjectAiAgentPluginEnabled('project123', 'latex-plugin', false)

    expect(
      JSON.parse(
        fetchMock.callHistory.calls(
          '/project/project123/ai/agent/plugins/preview'
        )[0].options.body as string
      )
    ).to.deep.equal({
      sourceType: 'github',
      url: 'https://github.com/example/latex-plugin',
    })
    expect(
      JSON.parse(
        fetchMock.callHistory.calls(
          '/project/project123/ai/agent/plugins/install'
        )[0].options.body as string
      )
    ).to.deep.equal({
      sourceType: 'github',
      url: 'https://github.com/example/latex-plugin',
      enabled: true,
    })
    expect(
      JSON.parse(
        fetchMock.callHistory.calls(
          '/project/project123/ai/agent/plugins/latex-plugin'
        )[0].options.body as string
      )
    ).to.deep.equal({ enabled: false })
  })

  it('creates project agent sessions', async function () {
    fetchMock.post('/project/project123/ai/agent/sessions', {
      session: {
        id: 'session-one',
        status: 'planning',
      },
    })

    const response = await createProjectAiAgentSession('project123', {
      task: 'Explain the project',
      providerId: 'provider-one',
      model: 'model-one',
    })

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      task: 'Explain the project',
      providerId: 'provider-one',
      model: 'model-one',
    })
    expect(response.session.id).to.equal('session-one')
  })

  it('passes an AbortSignal to the project agent session create request', async function () {
    fetchMock.post('/project/project123/ai/agent/sessions', {
      session: {
        id: 'session-one',
        status: 'planning',
      },
    })
    const controller = new AbortController()

    await createProjectAiAgentSession(
      'project123',
      {
        task: 'Explain the project',
        providerId: 'provider-one',
        model: 'model-one',
      },
      { signal: controller.signal }
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions'
    )[0]
    expect(call.options.signal).to.equal(controller.signal)
  })

  it('starts act mode for project agent sessions', async function () {
    fetchMock.post(
      '/project/project123/ai/agent/sessions/session-one/start-act',
      {
        session: {
          id: 'session-one',
          status: 'ready_for_act',
          mode: 'act',
        },
      }
    )

    const response = await startProjectAiAgentAct('project123', 'session-one')

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/start-act'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({})
    expect(response.session.mode).to.equal('act')
  })

  it('applies reviewed agent patches', async function () {
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/apply', {
      patch: {
        id: 'patch-one',
        status: 'applied',
        operations: [],
      },
    })

    const response = await applyProjectAiAgentPatch('project123', 'patch-one')

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/apply'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({})
    expect(response.patch.status).to.equal('applied')
  })

  it('applies selected agent patch hunks', async function () {
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/apply', {
      patch: {
        id: 'patch-one',
        status: 'partially_applied',
        operations: [],
      },
    })

    const response = await applyProjectAiAgentPatch(
      'project123',
      'patch-one',
      {
        hunkIds: ['op-0001:h-0001:abc123def456'],
        rejectUnselected: true,
      }
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/apply'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      hunkIds: ['op-0001:h-0001:abc123def456'],
      rejectUnselected: true,
    })
    expect(response.patch.status).to.equal('partially_applied')
  })

  it('rejects reviewed agent patches', async function () {
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/reject', {
      patch: {
        id: 'patch-one',
        status: 'rejected',
        operations: [],
      },
    })

    const response = await rejectProjectAiAgentPatch('project123', 'patch-one')

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/reject'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({})
    expect(response.patch.status).to.equal('rejected')
  })

  it('rejects selected agent patch hunks', async function () {
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/reject', {
      patch: {
        id: 'patch-one',
        status: 'partially_applied',
        operations: [],
      },
    })

    const response = await rejectProjectAiAgentPatch('project123', 'patch-one', {
      hunkIds: ['op-0001:h-0001:abc123def456'],
    })

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/reject'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      hunkIds: ['op-0001:h-0001:abc123def456'],
    })
    expect(response.patch.status).to.equal('partially_applied')
  })

  it('rolls back reviewed agent patches', async function () {
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/rollback', {
      patch: {
        id: 'patch-one',
        status: 'rolled_back',
        operations: [],
      },
    })

    const response = await rollbackProjectAiAgentPatch(
      'project123',
      'patch-one'
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/rollback'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({})
    expect(response.patch.status).to.equal('rolled_back')
  })

  it('rolls back selected agent patch hunks', async function () {
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/rollback', {
      patch: {
        id: 'patch-one',
        status: 'partially_applied',
        operations: [],
      },
    })

    const response = await rollbackProjectAiAgentPatch(
      'project123',
      'patch-one',
      {
        hunkIds: ['op-0001:h-0001:abc123def456'],
      }
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/rollback'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      hunkIds: ['op-0001:h-0001:abc123def456'],
    })
    expect(response.patch.status).to.equal('partially_applied')
  })

  it('streams agent events and done payloads', async function () {
    fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({
          type: 'event',
          event: {
            id: 'event-one',
            sessionId: 'session-one',
            sequence: 1,
            type: 'tool_call',
            payload: { name: 'project.read_file' },
            createdAt: null,
          },
        }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          session: { id: 'session-one', status: 'completed' },
          answer: 'Agent answer',
        }) +
        '\n',
    })
    const events: Array<{ type: string }> = []

    const response = await sendProjectAiAgentTurnStream(
      'project123',
      'session-one',
      {
        prompt: 'Explain the project',
        providerId: 'provider-one',
        model: 'model-one',
      },
      event => events.push(event)
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/turns'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      prompt: 'Explain the project',
      providerId: 'provider-one',
      model: 'model-one',
    })
    expect(events.map(event => event.type)).to.deep.equal(['tool_call'])
    expect(response.answer).to.equal('Agent answer')
  })

  it('passes an AbortSignal to the project agent turn stream request', async function () {
    fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({
          type: 'done',
          session: { id: 'session-one', status: 'completed' },
          answer: 'Agent answer',
        }) + '\n',
    })
    const controller = new AbortController()

    await sendProjectAiAgentTurnStream(
      'project123',
      'session-one',
      {
        prompt: 'Explain the project',
        providerId: 'provider-one',
        model: 'model-one',
      },
      () => {},
      { signal: controller.signal }
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/turns'
    )[0]
    expect(call.options.signal).to.equal(controller.signal)
  })

  it('skips malformed agent stream lines and continues parsing events', async function () {
    fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        '{not-json}\n' +
        JSON.stringify({
          type: 'event',
          event: {
            id: 'event-one',
            sessionId: 'session-one',
            sequence: 1,
            type: 'tool_call',
            payload: { name: 'project.read_file' },
            createdAt: null,
          },
        }) +
        '\n' +
        'also not json\n' +
        JSON.stringify({
          type: 'done',
          session: { id: 'session-one', status: 'completed' },
          answer: 'Agent answer',
        }) +
        '\n',
    })
    const events: Array<{ type: string }> = []

    const response = await sendProjectAiAgentTurnStream(
      'project123',
      'session-one',
      {
        prompt: 'Explain the project',
        providerId: 'provider-one',
        model: 'model-one',
      },
      event => events.push(event)
    )

    expect(events.map(event => event.type)).to.deep.equal(['tool_call'])
    expect(response.answer).to.equal('Agent answer')
  })

  it('skips non-object and unknown agent stream events', async function () {
    fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        'null\n' +
        '[]\n' +
        JSON.stringify({ type: 'unknown', message: 'ignore me' }) +
        '\n' +
        JSON.stringify({
          type: 'event',
          event: {
            id: 'event-one',
            sessionId: 'session-one',
            sequence: 1,
            type: 'tool_call',
            payload: { name: 'project.read_file' },
            createdAt: null,
          },
        }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          session: { id: 'session-one', status: 'completed' },
          answer: 'Agent answer',
        }) +
        '\n',
    })
    const events: Array<{ type: string }> = []

    const response = await sendProjectAiAgentTurnStream(
      'project123',
      'session-one',
      {
        prompt: 'Explain the project',
        providerId: 'provider-one',
        model: 'model-one',
      },
      event => events.push(event)
    )

    expect(events.map(event => event.type)).to.deep.equal(['tool_call'])
    expect(response.answer).to.equal('Agent answer')
  })
})
