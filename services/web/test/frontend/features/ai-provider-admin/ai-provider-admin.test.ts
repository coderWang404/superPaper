import { expect } from 'chai'
import { fireEvent, render, screen } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { createElement } from 'react'

import { resetMeta } from '../../helpers/reset-meta'
import { initAiProviderAdmin } from '../../../../frontend/js/features/ai-provider-admin/ai-provider-admin'

describe('ai-provider-admin', function () {
  const fakeProviderKey = ['test', 'key'].join('-')

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    document.body.innerHTML = ''
    resetMeta()
  })

  it('extracts safe validation field messages without rendering secrets', async function () {
    const submittedCredential = 'test-provider-key-value'

    fetchMock.post('/admin/ai/providers', {
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid AI provider input',
          fields: [{ field: 'baseURL', message: 'baseURL must use https' }],
          apiKey: submittedCredential,
        },
      },
    })

    const { createProvider } = await import(
      '../../../../frontend/js/features/ai-provider-admin/api'
    )

    await expect(
      createProvider('csrf-token', {
        name: 'Unsafe',
        providerType: 'openai-compatible',
        baseURL: 'http://example.test/v1',
        apiKey: submittedCredential,
        enabled: true,
        defaultModel: null,
        models: [],
      })
    ).to.be.rejectedWith('Invalid AI provider input: baseURL must use https')
  })

  it('renders the React provider admin app with redacted provider state', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })

    const { AiProviderAdminApp } = await import(
      '../../../../frontend/js/features/ai-provider-admin/components/ai-provider-admin-app'
    )

    render(createElement(AiProviderAdminApp, { csrfToken: 'csrf-token' }))

    await screen.findByText('Provider One')
    screen.getByText('https://provider-one.example/v1')
    screen.getByText('API key stored')
    expect(document.body.textContent).not.to.contain(fakeProviderKey)
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

  it('fills the DeepSeek preset and creates the normalized model request', async function () {
    fetchMock.get('/admin/ai/providers', { providers: [] })
    fetchMock.post('/admin/ai/providers', {
      provider: providerFixture({
        name: 'DeepSeek',
        baseURL: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
      }),
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('No AI providers configured')

    fireEvent.change(screen.getByLabelText('Preset channels'), {
      target: { value: 'deepseek' },
    })
    fireEvent.input(screen.getByLabelText('API key'), {
      target: { value: fakeProviderKey },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Add AI provider' }))

    await screen.findByText('Provider added')

    const createCall = fetchMock.callHistory
      .calls('/admin/ai/providers')
      .find(call => call.options.method === 'post')
    if (!createCall) {
      throw new Error('expected AI provider create request')
    }
    expect(JSON.parse(createCall.options.body as string)).to.deep.equal({
      name: 'DeepSeek',
      providerType: 'openai-compatible',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: fakeProviderKey,
      enabled: true,
      defaultModel: 'deepseek-chat',
      models: [
        {
          id: 'deepseek-chat',
          displayName: 'deepseek-chat',
          source: 'manual',
          enabled: true,
        },
      ],
    })
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
    }, {
      delay: 100,
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(
      screen.getByRole('button', { name: 'Sync models for Provider One' })
    )
    await screen.findByText('Syncing...')
    expect(
      screen.getByRole('button', { name: 'Sync models for Provider One' })
    ).to.have.property('disabled', true)

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

  it('names provider action buttons with their provider', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [
        providerFixture(),
        providerFixture({
          id: 'provider-two',
          name: 'Provider Two',
          baseURL: 'https://provider-two.example/v1',
          enabled: false,
        }),
      ],
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    await screen.findByText('Provider Two')

    screen.getByRole('button', { name: 'Sync models for Provider One' })
    screen.getByRole('button', { name: 'Sync models for Provider Two' })
    screen.getByRole('button', { name: 'Test Provider One' })
    screen.getByRole('button', { name: 'Test Provider Two' })
    screen.getByRole('button', { name: 'Disable Provider One' })
    screen.getByRole('button', { name: 'Enable Provider Two' })
  })

  it('tests provider connectivity using the test endpoint', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture({ healthStatus: 'unknown' })],
    })
    fetchMock.post('/admin/ai/providers/provider-one/test', {
      ok: true,
      provider: providerFixture({ healthStatus: 'ok' }),
    }, {
      delay: 100,
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(
      screen.getByRole('button', { name: 'Test Provider One' })
    )
    await screen.findByText('Testing...')
    expect(
      screen.getByRole('button', { name: 'Test Provider One' })
    ).to.have.property('disabled', true)

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
    fireEvent.click(
      screen.getByRole('button', { name: 'Disable Provider One' })
    )

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
    expect(screen.queryByLabelText('New API key for Provider One')).to.equal(
      null
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Replace key for Provider One' })
    )
    fireEvent.input(screen.getByLabelText('New API key for Provider One'), {
      target: { value: fakeProviderKey },
    })
    fireEvent.submit(
      screen.getByRole('form', { name: 'Replace key for Provider One' })
    )
    await screen.findByRole('button', { name: 'Replacing...' })

    await screen.findByText('API key replaced')

    const call = fetchMock.callHistory.calls(
      '/admin/ai/providers/provider-one'
    )[0]
    expect(call.options.method).to.equal('patch')
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      apiKey: fakeProviderKey,
    })
    expect(screen.queryByLabelText('New API key for Provider One')).to.equal(
      null
    )
  })

  it('explains the accepted Model IDs format', async function () {
    fetchMock.get('/admin/ai/providers', { providers: [] })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('No AI providers configured')
    const modelIdsInput = screen.getByLabelText('Model IDs')
    const helper = screen.getByText(
      'Use commas or new lines, for example: gpt-4.1, deepseek-chat.'
    )

    expect(modelIdsInput.getAttribute('aria-describedby')).to.equal(helper.id)
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
      fireEvent.click(
        screen.getByRole('button', { name: 'Delete Provider One' })
      )

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

  it('shows the safe API error message from the response body', async function () {
    fetchMock.get('/admin/ai/providers', { providers: [] })
    fetchMock.post('/admin/ai/providers', {
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid AI provider input',
          fields: [
            {
              field: 'baseURL',
              message: 'baseURL must use https',
            },
          ],
        },
      },
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('No AI providers configured')
    fireEvent.input(screen.getByLabelText('Provider name'), {
      target: { value: 'Provider One' },
    })
    fireEvent.input(screen.getByLabelText('Base URL'), {
      target: { value: 'http://unsafe.example.test/private' },
    })
    fireEvent.input(screen.getByLabelText('API key'), {
      target: { value: fakeProviderKey },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Add AI provider' }))

    await screen.findByRole('alert')
    screen.getByText('Invalid AI provider input: baseURL must use https')
    expect(document.body.textContent).not.to.contain(fakeProviderKey)
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).to.equal(
      ''
    )
    expect(document.body.textContent).not.to.contain(
      'http://unsafe.example.test/private'
    )
  })

  it('does not render submitted API keys after replace validation errors', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })
    fetchMock.patch('/admin/ai/providers/provider-one', {
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid AI provider input',
          fields: [{ field: 'apiKey', message: 'API key is invalid' }],
        },
      },
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    fireEvent.click(
      screen.getByRole('button', { name: 'Replace key for Provider One' })
    )
    fireEvent.input(screen.getByLabelText('New API key for Provider One'), {
      target: { value: fakeProviderKey },
    })
    fireEvent.submit(
      screen.getByRole('form', { name: 'Replace key for Provider One' })
    )

    await screen.findByRole('alert')
    screen.getByText('Invalid AI provider input: API key is invalid')
    expect(document.body.textContent).not.to.contain(fakeProviderKey)
    expect(
      (screen.getByLabelText('New API key for Provider One') as HTMLInputElement)
        .value
    ).to.equal('')
  })

  it('strips unexpected provider secret fields before storing client state', async function () {
    const { initialProviderAdminState, providerAdminReducer } = await import(
      '../../../../frontend/js/features/ai-provider-admin/state'
    )

    const state = providerAdminReducer(initialProviderAdminState, {
      type: 'load:success',
      providers: [
        providerFixture({
          apiKey: fakeProviderKey,
          encryptedApiKey: 'encrypted-provider-key-value',
        }),
      ],
    })

    expect(JSON.stringify(state.providers)).not.to.contain(fakeProviderKey)
    expect(JSON.stringify(state.providers)).not.to.contain('encryptedApiKey')
  })

  it('ignores provider test responses without a provider payload', async function () {
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture({ healthStatus: 'unknown' })],
    })
    fetchMock.post('/admin/ai/providers/provider-one/test', {
      ok: false,
      provider: null,
    })
    const uncaughtErrors: Error[] = []
    const handleError = (event: ErrorEvent) => {
      uncaughtErrors.push(event.error || new Error(event.message))
      event.preventDefault()
    }
    window.addEventListener('error', handleError)

    try {
      initAiProviderAdmin(renderRoot())

      await screen.findByText('Provider One')
      fireEvent.click(
        screen.getByRole('button', { name: 'Test Provider One' })
      )

      await screen.findByText('Provider test failed')
      screen.getByText('unknown')
      expect(uncaughtErrors).to.deep.equal([])
    } finally {
      window.removeEventListener('error', handleError)
    }
  })

  it('uses the system language for provider administration copy', async function () {
    window.metaAttributesCache.set('ol-i18n', { currentLangCode: 'zh-CN' })
    fetchMock.get('/admin/ai/providers', {
      providers: [providerFixture()],
    })

    initAiProviderAdmin(renderRoot())

    await screen.findByText('Provider One')
    screen.getByRole('heading', { name: '添加供应商' })
    screen.getByText('供应商名称')
    expect(screen.getAllByText('模型')).to.have.length(2)
    screen.getByText('API 密钥已保存')
    screen.getByRole('button', { name: '同步 Provider One 的模型' })
    screen.getByRole('button', { name: '测试 Provider One' })
    screen.getByRole('button', { name: '禁用 Provider One' })
    expect(screen.queryByRole('button', { name: '中文' })).to.equal(null)
    expect(screen.queryByRole('button', { name: 'English' })).to.equal(null)
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
