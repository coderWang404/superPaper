import { expect } from 'chai'
import fetchMock from 'fetch-mock'

import {
  getProjectAiConfig,
  sendProjectAiChat,
  sendProjectAiChatStream,
} from '../../../../frontend/js/features/ai-assistant/api'

describe('ai-assistant api', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('loads project AI config from the project endpoint', async function () {
    fetchMock.get('/project/project123/ai/config', {
      providers: [
        {
          id: 'provider-one',
          name: 'Provider One',
          models: [
            { id: 'model-one', displayName: 'Model One', enabled: true },
          ],
          defaultModel: 'model-one',
        },
      ],
    })

    const config = await getProjectAiConfig('project123')

    expect(config.providers[0].id).to.equal('provider-one')
    expect(fetchMock.callHistory.called('/project/project123/ai/config')).to
      .equal(true)
  })

  it('sends prompt, model, provider, and selection to the chat endpoint', async function () {
    fetchMock.post('/project/project123/ai/chat', {
      answer: 'Use \\\\cite{} here.',
      providerId: 'provider-one',
      model: 'model-one',
      context: {
        includedFiles: ['main.tex'],
        selectionIncluded: true,
        truncated: false,
      },
    })

    const response = await sendProjectAiChat('project123', {
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
      selection: {
        docId: 'doc-one',
        path: 'main.tex',
        text: 'selected text',
      },
    })

    const call = fetchMock.callHistory.calls('/project/project123/ai/chat')[0]

    expect(response.answer).to.equal('Use \\\\cite{} here.')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
      selection: {
        docId: 'doc-one',
        path: 'main.tex',
        text: 'selected text',
      },
    })
  })

  it('streams chat deltas from the project stream endpoint', async function () {
    fetchMock.post('/project/project123/ai/chat/stream', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({ type: 'delta', delta: 'Use ' }) +
        '\n' +
        JSON.stringify({ type: 'delta', delta: '\\\\cite{} here.' }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          providerId: 'provider-one',
          model: 'model-one',
          context: {
            includedFiles: ['main.tex'],
            selectionIncluded: true,
            truncated: false,
          },
        }) +
        '\n',
    })
    const deltas: string[] = []

    const response = await sendProjectAiChatStream(
      'project123',
      {
        prompt: 'How should I cite this?',
        providerId: 'provider-one',
        model: 'model-one',
      },
      delta => deltas.push(delta)
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/chat/stream'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
    })
    expect(deltas).to.deep.equal(['Use ', '\\\\cite{} here.'])
    expect(response).to.deep.equal({
      answer: 'Use \\\\cite{} here.',
      providerId: 'provider-one',
      model: 'model-one',
      context: {
        includedFiles: ['main.tex'],
        selectionIncluded: true,
        truncated: false,
      },
    })
  })

  it('skips malformed chat stream lines and continues parsing deltas', async function () {
    fetchMock.post('/project/project123/ai/chat/stream', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        '{not-json}\n' +
        JSON.stringify({ type: 'delta', delta: 'Use ' }) +
        '\n' +
        'also not json\n' +
        JSON.stringify({ type: 'delta', delta: '\\\\cite{} here.' }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          providerId: 'provider-one',
          model: 'model-one',
          context: {
            includedFiles: ['main.tex'],
            selectionIncluded: true,
            truncated: false,
          },
        }) +
        '\n',
    })
    const deltas: string[] = []

    const response = await sendProjectAiChatStream(
      'project123',
      {
        prompt: 'How should I cite this?',
        providerId: 'provider-one',
        model: 'model-one',
      },
      delta => deltas.push(delta)
    )

    expect(deltas).to.deep.equal(['Use ', '\\\\cite{} here.'])
    expect(response.answer).to.equal('Use \\\\cite{} here.')
  })

  it('skips non-object and unknown chat stream events', async function () {
    fetchMock.post('/project/project123/ai/chat/stream', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        'null\n' +
        '[]\n' +
        JSON.stringify({ type: 'unknown', message: 'ignore me' }) +
        '\n' +
        JSON.stringify({ type: 'delta', delta: 'Use ' }) +
        '\n' +
        JSON.stringify({ type: 'delta', delta: '\\\\cite{} here.' }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          providerId: 'provider-one',
          model: 'model-one',
          context: {
            includedFiles: ['main.tex'],
            selectionIncluded: true,
            truncated: false,
          },
        }) +
        '\n',
    })
    const deltas: string[] = []

    const response = await sendProjectAiChatStream(
      'project123',
      {
        prompt: 'How should I cite this?',
        providerId: 'provider-one',
        model: 'model-one',
      },
      delta => deltas.push(delta)
    )

    expect(deltas).to.deep.equal(['Use ', '\\\\cite{} here.'])
    expect(response.answer).to.equal('Use \\\\cite{} here.')
  })

  it('passes an AbortSignal to the project chat stream request', async function () {
    fetchMock.post('/project/project123/ai/chat/stream', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({
          type: 'done',
          providerId: 'provider-one',
          model: 'model-one',
          context: {
            includedFiles: [],
            selectionIncluded: false,
            truncated: false,
          },
        }) + '\n',
    })
    const controller = new AbortController()

    await sendProjectAiChatStream(
      'project123',
      {
        prompt: 'How should I cite this?',
        providerId: 'provider-one',
        model: 'model-one',
      },
      () => {},
      { signal: controller.signal }
    )

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/chat/stream'
    )[0]
    expect(call.options.signal).to.equal(controller.signal)
  })
})
