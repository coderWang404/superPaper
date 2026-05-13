import { expect } from 'chai'
import fetchMock from 'fetch-mock'

import {
  getProjectAiConfig,
  sendProjectAiChat,
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
})
