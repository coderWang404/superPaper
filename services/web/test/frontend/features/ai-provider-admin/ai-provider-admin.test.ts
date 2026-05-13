import { expect } from 'chai'
import { fireEvent, screen } from '@testing-library/dom'
import fetchMock from 'fetch-mock'

import { initAiProviderAdmin } from '../../../../frontend/js/features/ai-provider-admin/ai-provider-admin'

describe('ai-provider-admin', function () {
  const fakeProviderKey = ['test', 'key'].join('-')

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    document.body.innerHTML = ''
  })

  it('loads providers from the admin endpoint and renders redacted providers', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    screen.getByText('https://provider-one.example/v1')
    expect(screen.getAllByText('model-one')).to.have.length(2)
    screen.getByText('API key stored')
    expect(document.body.textContent).not.to.contain('test-key')
  })

  it('creates a provider with baseURL and API key, then clears the password field', async function () {
    fetchMock.get('/admin/ai/providers', { providers: [] })
    fetchMock.post('/admin/ai/providers', {
      provider: providerFixture(),
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('No AI providers configured')

    fireEvent.input(screen.getByLabelText('Provider name'), {
      target: { value: 'Provider One' },
    })
    fireEvent.input(screen.getByLabelText('Base URL'), {
      target: { value: 'https://provider-one.example/v1' },
    })
    fireEvent.input(screen.getByLabelText('API key'), {
      target: { value: fakeProviderKey },
    })
    fireEvent.input(screen.getByLabelText('Model IDs'), {
      target: { value: 'model-one, model-two' },
    })
    fireEvent.input(screen.getByLabelText('Default model'), {
      target: { value: 'model-one' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Add AI provider' }))

    await screen.findByText('Provider added')

    const call = fetchMock.callHistory
      .calls('/admin/ai/providers')
      .find(call => call.options.method === 'post')
    expect(call).to.exist
    expect(call.options.headers).to.include({
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-token',
    })
    expect(JSON.parse(call!.options.body as string)).to.deep.equal({
      name: 'Provider One',
      providerType: 'openai-compatible',
      baseURL: 'https://provider-one.example/v1',
      apiKey: fakeProviderKey,
      enabled: true,
      models: [
        {
          id: 'model-one',
          displayName: 'model-one',
          source: 'manual',
          enabled: true,
        },
        {
          id: 'model-two',
          displayName: 'model-two',
          source: 'manual',
          enabled: true,
        },
      ],
      defaultModel: 'model-one',
    })
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).to.equal(
      ''
    )
  })

  it('syncs models for a provider using the sync endpoint', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })
    fetchMock.post('/admin/ai/providers/provider-one/sync-models', {
      provider: providerFixture({
        models: [
          {
            id: 'model-one',
            displayName: 'model-one',
            source: 'synced',
            enabled: true,
          },
          {
            id: 'model-two',
            displayName: 'model-two',
            source: 'synced',
            enabled: true,
          },
        ],
      }),
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(screen.getByRole('button', { name: 'Sync models' }))

    await screen.findByText('Models synced')
    screen.getByText('model-one, model-two')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/providers/provider-one/sync-models'
    )[0]
    expect(call.options.method).to.equal('post')
    expect(call.options.headers).to.include({
      'x-csrf-token': 'csrf-token',
    })
  })

  it('shows a safe error message when the API fails', async function () {
    fetchMock.get('/admin/ai/providers', 500)

    initAiProviderAdmin(renderRoot())

    await screen.findByRole('alert')
    screen.getByText('AI provider request failed')
  })
})

function renderRoot() {
  const root = document.createElement('div')
  root.id = 'ai-provider-admin'
  root.dataset.csrfToken = 'csrf-token'
  document.body.append(root)
  return root
}

function providerFixture(overrides = {}) {
  return {
    id: 'provider-one',
    name: 'Provider One',
    providerType: 'openai-compatible',
    baseURL: 'https://provider-one.example/v1',
    enabled: true,
    hasApiKey: true,
    models: [
      {
        id: 'model-one',
        displayName: 'model-one',
        source: 'manual',
        enabled: true,
      },
    ],
    defaultModel: 'model-one',
    healthStatus: 'ok',
    lastModelSyncAt: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}
