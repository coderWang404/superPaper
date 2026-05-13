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
    if (!call) {
      throw new Error('expected AI provider create request')
    }
    expect(call.options.headers).to.include({
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-token',
    })
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
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

  it('tests provider connectivity using the test endpoint', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture({ healthStatus: 'unknown' })],
    })
    fetchMock.post('/admin/ai/providers/provider-one/test', {
      ok: true,
      provider: providerFixture({ healthStatus: 'ok' }),
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    await screen.findByText('Provider test passed')
    screen.getByText('ok')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/providers/provider-one/test'
    )[0]
    expect(call.options.method).to.equal('post')
  })

  it('toggles a provider enabled state', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture({ enabled: true })],
    })
    fetchMock.patch('/admin/ai/providers/provider-one', {
      provider: providerFixture({ enabled: false }),
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))

    await screen.findByText('Provider disabled')
    screen.getByText('Disabled')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/providers/provider-one'
    )[0]
    expect(call.options.method).to.equal('patch')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      enabled: false,
    })
  })

  it('replaces a provider API key and clears the replacement field', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })
    fetchMock.patch('/admin/ai/providers/provider-one', {
      provider: providerFixture(),
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.input(screen.getByLabelText('New API key for Provider One'), {
      target: { value: fakeProviderKey },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Replace Provider One key' }))

    await screen.findByText('API key replaced')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/providers/provider-one'
    )[0]
    expect(call.options.method).to.equal('patch')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      apiKey: fakeProviderKey,
    })
    expect(
      (screen.getByLabelText('New API key for Provider One') as HTMLInputElement)
        .value
    ).to.equal('')
  })

  it('deletes a provider after confirmation', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })
    fetchMock.delete('/admin/ai/providers/provider-one', 204)
    const confirm = window.confirm
    window.confirm = () => true

    try {
      initAiProviderAdmin(renderRoot())

      await screen.findByText('Provider One')
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await screen.findByText('Provider deleted')
      screen.getByText('No AI providers configured')

      const call = fetchMock.callHistory.calls(
        '/admin/ai/providers/provider-one'
      )[0]
      expect(call.options.method).to.equal('delete')
    } finally {
      window.confirm = confirm
    }
  })

  it('shows a safe error message when the API fails', async function () {
    fetchMock.get('/admin/ai/providers', 500)

    initAiProviderAdmin(renderRoot())

    await screen.findByRole('alert')
    screen.getByText('AI provider request failed')
  })

  it('switches the admin provider interface between English and Chinese', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(screen.getByRole('button', { name: '中文' }))

    screen.getByRole('heading', { name: '添加供应商' })
    screen.getByText('供应商名称')
    screen.getByText('模型')
    screen.getByText('API 密钥已保存')
    screen.getByRole('button', { name: 'English' })

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    screen.getByRole('heading', { name: 'Add provider' })
    screen.getByText('Provider name')
    screen.getByText('Models')
    screen.getByText('API key stored')
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
