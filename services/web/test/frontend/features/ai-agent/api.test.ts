import { expect } from 'chai'
import fetchMock from 'fetch-mock'

import {
  createProjectAiAgentSession,
  getProjectAiAgentConfig,
  sendProjectAiAgentTurnStream,
} from '../../../../frontend/js/features/ai-agent/api'

describe('ai-agent api', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('loads project agent config', async function () {
    fetchMock.get('/project/project123/ai/agent/config', {
      permissionProfile: {
        id: 'readonly-default',
        writeToolsRequireApproval: true,
        externalToolsEnabled: false,
      },
      tools: [{ name: 'project.read_file', access: 'read' }],
      skills: [{ id: 'latex-compile-debug' }],
      plugins: [{ id: 'latex-core' }],
    })

    const config = await getProjectAiAgentConfig('project123')

    expect(config.permissionProfile.id).to.equal('readonly-default')
    expect(config.tools[0].name).to.equal('project.read_file')
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
})
