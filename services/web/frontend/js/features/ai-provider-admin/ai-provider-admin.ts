import getMeta from '@/utils/meta'

type AiProviderModel = {
  id: string
  displayName: string
  source: 'manual' | 'synced'
  enabled: boolean
}

type AiProvider = {
  id: string
  name: string
  providerType: 'openai-compatible'
  baseURL: string
  enabled: boolean
  hasApiKey: boolean
  models: AiProviderModel[]
  defaultModel: string | null
  healthStatus: 'unknown' | 'ok' | 'error'
}

type ProviderState = {
  providers: AiProvider[]
  loading: boolean
  activeAction: string | null
  expandedKeyProviderId: string | null
  statusMessage: TranslationKey | null
  errorMessage: TranslationKey | null
}

type ProviderListResponse = {
  providers: AiProvider[]
}

type ProviderResponse = {
  provider: AiProvider
}

type AdminLanguage = 'en' | 'zh'

type TranslationKey =
  | 'actions'
  | 'addProvider'
  | 'addProviderDescription'
  | 'addProviderForm'
  | 'apiKey'
  | 'apiKeyReplaced'
  | 'apiKeyStored'
  | 'baseURL'
  | 'cancel'
  | 'confirmDelete'
  | 'default'
  | 'defaultModel'
  | 'delete'
  | 'disabled'
  | 'disable'
  | 'enabled'
  | 'enable'
  | 'health'
  | 'loading'
  | 'modelIds'
  | 'modelIdsHelp'
  | 'models'
  | 'modelsSynced'
  | 'name'
  | 'newApiKey'
  | 'newApiKeyFor'
  | 'noApiKeyStored'
  | 'noProviders'
  | 'noModels'
  | 'none'
  | 'providerConfigured'
  | 'providerAdded'
  | 'providerDeleted'
  | 'providerDisabled'
  | 'providerEnabled'
  | 'providerName'
  | 'providers'
  | 'providersDescription'
  | 'providerTestFailed'
  | 'providerTestPassed'
  | 'replaceKey'
  | 'replaceKeyBusy'
  | 'replaceKeyFor'
  | 'replaceProviderKeyFor'
  | 'requestFailed'
  | 'presetChannels'
  | 'selectPreset'
  | 'syncingModels'
  | 'syncModels'
  | 'test'
  | 'testingProvider'
  | 'unknown'

const TRANSLATIONS: Record<AdminLanguage, Record<TranslationKey, string>> = {
  en: {
    actions: 'Actions',
    addProvider: 'Add provider',
    addProviderDescription:
      'Register an OpenAI-compatible endpoint. Keys stay server-side and are never rendered back to the browser.',
    addProviderForm: 'Add AI provider',
    apiKey: 'API key',
    apiKeyReplaced: 'API key replaced',
    apiKeyStored: 'API key stored',
    baseURL: 'Base URL',
    cancel: 'Cancel',
    confirmDelete: 'Delete AI provider',
    default: 'Default',
    defaultModel: 'Default model',
    delete: 'Delete',
    disabled: 'Disabled',
    disable: 'Disable',
    enabled: 'Enabled',
    enable: 'Enable',
    health: 'Health',
    loading: 'Loading AI providers...',
    modelIds: 'Model IDs',
    modelIdsHelp: 'Use commas or new lines, for example: gpt-4.1, deepseek-chat.',
    models: 'Models',
    modelsSynced: 'Models synced',
    name: 'Name',
    newApiKey: 'New API key',
    newApiKeyFor: 'New API key for',
    noApiKeyStored: 'No API key stored',
    noProviders: 'No AI providers configured',
    noModels: 'No models',
    none: 'None',
    providerConfigured: 'Providers configured',
    providerAdded: 'Provider added',
    providerDeleted: 'Provider deleted',
    providerDisabled: 'Provider disabled',
    providerEnabled: 'Provider enabled',
    providerName: 'Provider name',
    providers: 'AI providers',
    providersDescription:
      'Manage model gateways used by project chat and Agent mode.',
    providerTestFailed: 'Provider test failed',
    providerTestPassed: 'Provider test passed',
    replaceKey: 'Replace key',
    replaceKeyBusy: 'Replacing...',
    replaceKeyFor: 'Replace',
    replaceProviderKeyFor: 'Replace key for',
    requestFailed: 'AI provider request failed',
    syncingModels: 'Syncing...',
    syncModels: 'Sync models',
    test: 'Test',
    testingProvider: 'Testing...',
    unknown: 'unknown',
    presetChannels: 'Preset channels',
    selectPreset: '-- Select preset --',
  },
  zh: {
    actions: '操作',
    addProvider: '添加供应商',
    addProviderDescription:
      '注册 OpenAI 兼容接口。密钥只保存在服务端，不会回传到浏览器。',
    addProviderForm: '添加 AI 供应商',
    apiKey: 'API 密钥',
    apiKeyReplaced: 'API 密钥已替换',
    apiKeyStored: 'API 密钥已保存',
    baseURL: 'Base URL',
    cancel: '取消',
    confirmDelete: '删除 AI 供应商',
    default: '默认',
    defaultModel: '默认模型',
    delete: '删除',
    disabled: '已禁用',
    disable: '禁用',
    enabled: '已启用',
    enable: '启用',
    health: '健康状态',
    loading: '正在加载 AI 供应商...',
    modelIds: '模型 ID',
    modelIdsHelp: '可使用逗号或换行分隔，例如：gpt-4.1, deepseek-chat。',
    models: '模型',
    modelsSynced: '模型已同步',
    name: '名称',
    newApiKey: '新 API 密钥',
    newApiKeyFor: '新的 API 密钥：',
    noApiKeyStored: '未保存 API 密钥',
    noProviders: '尚未配置 AI 供应商',
    noModels: '无模型',
    none: '无',
    providerConfigured: '已配置供应商',
    providerAdded: '供应商已添加',
    providerDeleted: '供应商已删除',
    providerDisabled: '供应商已禁用',
    providerEnabled: '供应商已启用',
    providerName: '供应商名称',
    providers: 'AI 供应商',
    providersDescription: '管理项目聊天和 Agent 模式使用的模型网关。',
    providerTestFailed: '供应商测试失败',
    providerTestPassed: '供应商测试通过',
    replaceKey: '替换密钥',
    replaceKeyBusy: '正在替换...',
    replaceKeyFor: '替换',
    replaceProviderKeyFor: '替换密钥：',
    requestFailed: 'AI 供应商请求失败',
    syncingModels: '正在同步...',
    syncModels: '同步模型',
    test: '测试',
    testingProvider: '正在测试...',
    unknown: '未知',
    presetChannels: '预设渠道',
    selectPreset: '-- 选择预设渠道 --',
  },
}

const SAFE_ERROR_MESSAGE = 'AI provider request failed'

export function initAiProviderAdmin(root: HTMLElement): void {
  const csrfToken = root.dataset.csrfToken || ''
  const language = getAdminLanguage()
  const state: ProviderState = {
    providers: [],
    loading: true,
    activeAction: null,
    expandedKeyProviderId: null,
    statusMessage: null,
    errorMessage: null,
  }

  function t(key: TranslationKey) {
    return TRANSLATIONS[language][key]
  }

  async function loadProviders() {
    state.loading = true
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<ProviderListResponse>(
        '/admin/ai/providers',
        csrfToken
      )
      state.providers = response.providers
      state.loading = false
      render()
    } catch (error) {
      showSafeError()
    }
  }

  async function handleCreate(event: Event) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const apiKeyInput = getFormInput(form, 'apiKey')

    try {
      const response = await requestJSON<ProviderResponse>(
        '/admin/ai/providers',
        csrfToken,
        {
          method: 'POST',
          body: providerInputFromForm(form),
        }
      )
      state.providers = [response.provider, ...state.providers]
      state.statusMessage = 'providerAdded'
      state.errorMessage = null
      form.reset()
      getFormInput(form, 'enabled').checked = true
      apiKeyInput.value = ''
      render()
    } catch (error) {
      showSafeError()
    }
  }

  async function handleSyncModels(providerId: string) {
    state.activeAction = `sync:${providerId}`
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<ProviderResponse>(
        `/admin/ai/providers/${encodeURIComponent(providerId)}/sync-models`,
        csrfToken,
        { method: 'POST' }
      )
      replaceProvider(response.provider)
      state.statusMessage = 'modelsSynced'
      state.errorMessage = null
    } catch (error) {
      showSafeError()
    } finally {
      state.activeAction = null
      render()
    }
  }

  async function handleTestProvider(providerId: string) {
    state.activeAction = `test:${providerId}`
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<ProviderResponse & { ok: boolean }>(
        `/admin/ai/providers/${encodeURIComponent(providerId)}/test`,
        csrfToken,
        { method: 'POST' }
      )
      replaceProvider(response.provider)
      state.statusMessage = response.ok
        ? 'providerTestPassed'
        : 'providerTestFailed'
      state.errorMessage = null
    } catch (error) {
      showSafeError()
    } finally {
      state.activeAction = null
      render()
    }
  }

  async function handleToggleProvider(provider: AiProvider) {
    state.activeAction = `toggle:${provider.id}`
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<ProviderResponse>(
        `/admin/ai/providers/${encodeURIComponent(provider.id)}`,
        csrfToken,
        {
          method: 'PATCH',
          body: { enabled: !provider.enabled },
        }
      )
      replaceProvider(response.provider)
      state.statusMessage = response.provider.enabled
        ? 'providerEnabled'
        : 'providerDisabled'
      state.errorMessage = null
    } catch (error) {
      showSafeError()
    } finally {
      state.activeAction = null
      render()
    }
  }

  async function handleReplaceKey(event: Event, providerId: string) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const apiKeyInput = getFormInput(form, 'replacementApiKey')
    state.activeAction = `replace-key:${providerId}`
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<ProviderResponse>(
        `/admin/ai/providers/${encodeURIComponent(providerId)}`,
        csrfToken,
        {
          method: 'PATCH',
          body: { apiKey: apiKeyInput.value },
        }
      )
      replaceProvider(response.provider)
      state.statusMessage = 'apiKeyReplaced'
      state.errorMessage = null
      state.expandedKeyProviderId = null
      apiKeyInput.value = ''
      render()
    } catch (error) {
      showSafeError()
    } finally {
      state.activeAction = null
      render()
    }
  }

  async function handleDeleteProvider(provider: AiProvider) {
    if (!window.confirm(`${t('confirmDelete')} ${provider.name}?`)) {
      return
    }

    try {
      await requestJSON(
        `/admin/ai/providers/${encodeURIComponent(provider.id)}`,
        csrfToken,
        { method: 'DELETE' }
      )
      state.providers = state.providers.filter(
        existingProvider => existingProvider.id !== provider.id
      )
      state.statusMessage = 'providerDeleted'
      state.errorMessage = null
      render()
    } catch (error) {
      showSafeError()
    }
  }

  function replaceProvider(provider: AiProvider) {
    state.providers = state.providers.map(existingProvider =>
      existingProvider.id === provider.id ? provider : existingProvider
    )
  }

  function showSafeError() {
    state.loading = false
    state.activeAction = null
    state.errorMessage = 'requestFailed'
    state.statusMessage = null
    render()
  }

  function render() {
    root.innerHTML = `
      <div class="ai-provider-admin">
        ${renderProviderOverview(state.providers, t)}
        <div class="ai-provider-admin-feedback">
          <div class="text-muted" role="status">${escapeHtml(
            state.loading
              ? t('loading')
              : state.statusMessage
                ? t(state.statusMessage)
                : ''
          )}</div>
          ${
            state.errorMessage
              ? `<div class="alert alert-danger" role="alert">${escapeHtml(
                  t(state.errorMessage)
                )}</div>`
              : ''
          }
        </div>
        <div class="ai-admin-section">
          <div class="ai-admin-section-header">
            <div>
              <h4>${escapeHtml(t('providers'))}</h4>
              <p>${escapeHtml(t('providersDescription'))}</p>
            </div>
          </div>
          ${renderProviderTable(
            state.providers,
            state.loading,
            state.activeAction,
            state.expandedKeyProviderId,
            t
          )}
        </div>
        <div class="ai-admin-section">
          <div class="ai-admin-section-header">
            <div>
              <h4>${escapeHtml(t('addProvider'))}</h4>
              <p>${escapeHtml(t('addProviderDescription'))}</p>
            </div>
          </div>
          ${renderCreateForm(t)}
        </div>
      </div>
    `

    root
      .querySelector<HTMLFormElement>('[data-ai-provider-create-form]')
      ?.addEventListener('submit', handleCreate)

    root
      .querySelector<HTMLSelectElement>('[data-ai-provider-preset]')
      ?.addEventListener('change', event => {
        const select = event.currentTarget as HTMLSelectElement
        const form = select.closest('form') as HTMLFormElement
        const presetMap: Record<string, { name: string; baseURL: string; defaultModel: string; modelIds: string }> = {
          'claudeaihub-gpt55': { name: 'ClaudeAIHub - GPT-5.5', baseURL: 'https://claudeaihub.cloud/v1', defaultModel: 'gpt-5.5', modelIds: 'gpt-5.5' },
          'claudeaihub-opus48': { name: 'ClaudeAIHub - Claude Opus 4.8', baseURL: 'https://claudeaihub.cloud/v1', defaultModel: 'claude-opus-4-8', modelIds: 'claude-opus-4-8' },
          'deepseek': { name: 'DeepSeek 官方', baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', modelIds: 'deepseek-chat' },
        }
        const preset = presetMap[select.value]
        if (!preset) return
        getFormInput(form, 'name').value = preset.name
        getFormInput(form, 'baseURL').value = preset.baseURL
        getFormInput(form, 'defaultModel').value = preset.defaultModel
        getFormInput(form, 'modelIds').value = preset.modelIds
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-sync-models]')
      .forEach(button => {
        button.addEventListener('click', () => {
          handleSyncModels(button.dataset.providerId || '').catch(() => {})
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-test]')
      .forEach(button => {
        button.addEventListener('click', () => {
          handleTestProvider(button.dataset.providerId || '').catch(() => {})
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-toggle]')
      .forEach(button => {
        button.addEventListener('click', () => {
          const provider = findProvider(state.providers, button.dataset.providerId)
          if (provider) {
            handleToggleProvider(provider).catch(() => {})
          }
        })
      })

    root
      .querySelectorAll<HTMLFormElement>('[data-ai-provider-replace-key-form]')
      .forEach(form => {
        form.addEventListener('submit', event => {
          handleReplaceKey(event, form.dataset.providerId || '').catch(() => {})
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-show-replace-key]')
      .forEach(button => {
        button.addEventListener('click', () => {
          state.expandedKeyProviderId = button.dataset.providerId || null
          state.statusMessage = null
          state.errorMessage = null
          render()
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>(
        '[data-ai-provider-cancel-replace-key]'
      )
      .forEach(button => {
        button.addEventListener('click', () => {
          if (state.expandedKeyProviderId === button.dataset.providerId) {
            state.expandedKeyProviderId = null
            render()
          }
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-delete]')
      .forEach(button => {
        button.addEventListener('click', () => {
          const provider = findProvider(state.providers, button.dataset.providerId)
          if (provider) {
            handleDeleteProvider(provider).catch(() => {})
          }
        })
      })

    root.querySelectorAll<HTMLSelectElement>('[data-ai-preset-select]').forEach(select => {
      select.addEventListener('change', (event) => {
        const selectEl = event.currentTarget as HTMLSelectElement
        const form = selectEl.closest('form') as HTMLFormElement
        if (!form || !selectEl.value) return
        const presets: Record<string, {name: string, baseURL: string, defaultModel: string, modelIds: string}> = {
          'claudeaihub-gpt5.5': {name: 'ClaudeAIHub', baseURL: 'https://claudeaihub.cloud', defaultModel: 'gpt-5.5', modelIds: 'gpt-5.5'},
          'claudeaihub-claude': {name: 'ClaudeAIHub Claude', baseURL: 'https://claudeaihub.cloud', defaultModel: 'claude-opus-4-8', modelIds: 'claude-opus-4-8'},
          'deepseek': {name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', modelIds: 'deepseek-chat,deepseek-reasoner'},
        }
        const preset = presets[selectEl.value]
        if (!preset) return
        getFormInput(form, 'name').value = preset.name
        getFormInput(form, 'baseURL').value = preset.baseURL
        getFormInput(form, 'defaultModel').value = preset.defaultModel
        getFormInput(form, 'modelIds').value = preset.modelIds
      })
    })
  }

  render()
  loadProviders().catch(() => {})
}

async function requestJSON<T>(
  path: string,
  csrfToken: string,
  options: {
    method?: string
    body?: Record<string, unknown>
  } = {}
): Promise<T> {
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Csrf-Token': csrfToken,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    throw new Error(SAFE_ERROR_MESSAGE)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

function renderProviderOverview(
  providers: AiProvider[],
  t: (key: TranslationKey) => string
) {
  const enabledCount = providers.filter(provider => provider.enabled).length
  const modelCount = providers.reduce(
    (total, provider) => total + provider.models.length,
    0
  )
  const okCount = providers.filter(provider => provider.healthStatus === 'ok')
    .length

  return `
    <div class="ai-admin-overview" aria-label="${escapeHtml(
      t('providers')
    )}">
      ${renderMetric(t('providerConfigured'), String(providers.length))}
      ${renderMetric(t('enabled'), String(enabledCount))}
      ${renderMetric(t('models'), String(modelCount))}
      ${renderMetric(t('health'), `${okCount}/${providers.length || 0}`)}
    </div>
  `
}

function renderMetric(label: string, value: string) {
  return `
    <div class="ai-admin-metric">
      <div class="ai-admin-metric-value">${escapeHtml(value)}</div>
      <div class="ai-admin-metric-label">${escapeHtml(label)}</div>
    </div>
  `
}

function renderProviderTable(
  providers: AiProvider[],
  loading: boolean,
  activeAction: string | null,
  expandedKeyProviderId: string | null,
  t: (key: TranslationKey) => string
) {
  if (loading) {
    return ''
  }

  if (providers.length === 0) {
    return `<p class="text-muted">${escapeHtml(t('noProviders'))}</p>`
  }

  return `
    <div class="ai-admin-table-wrap">
      <table class="table table-striped ai-admin-table">
      <thead>
        <tr>
          <th>${escapeHtml(t('name'))}</th>
          <th>${escapeHtml(t('baseURL'))}</th>
          <th>${escapeHtml(t('models'))}</th>
          <th>${escapeHtml(t('default'))}</th>
          <th>${escapeHtml(t('health'))}</th>
          <th>${escapeHtml(t('enabled'))}</th>
          <th>${escapeHtml(t('actions'))}</th>
        </tr>
      </thead>
      <tbody>
        ${providers
          .map(provider =>
            renderProviderRow(provider, activeAction, expandedKeyProviderId, t)
          )
          .join('')}
      </tbody>
      </table>
    </div>
  `
}

function renderProviderRow(
  provider: AiProvider,
  activeAction: string | null,
  expandedKeyProviderId: string | null,
  t: (key: TranslationKey) => string
) {
  const models =
    provider.models.map(model => model.id).join(', ') || t('noModels')
  const escapedProviderId = escapeHtml(provider.id)
  const escapedProviderName = escapeHtml(provider.name)
  const isSyncing = activeAction === `sync:${provider.id}`
  const isTesting = activeAction === `test:${provider.id}`
  const isReplacingKey = activeAction === `replace-key:${provider.id}`
  const isReplaceKeyExpanded = expandedKeyProviderId === provider.id
  return `
    <tr>
      <td>
        <strong>${escapedProviderName}</strong>
        <div class="ai-admin-row-subtitle">${escapeHtml(
          provider.hasApiKey ? t('apiKeyStored') : t('noApiKeyStored')
        )}</div>
        ${
          isReplaceKeyExpanded
            ? `<form
          class="ai-provider-admin-replace-key"
          aria-label="${escapeHtml(t('replaceProviderKeyFor'))} ${escapedProviderName}"
          data-ai-provider-replace-key-form
          data-provider-id="${escapedProviderId}"
        >
          <label class="sr-only" for="ai-provider-replacement-key-${escapedProviderId}">
            ${escapeHtml(t('newApiKeyFor'))} ${escapedProviderName}
          </label>
          <input
            class="form-control input-sm"
            id="ai-provider-replacement-key-${escapedProviderId}"
            name="replacementApiKey"
            type="password"
            autocomplete="off"
            placeholder="${escapeHtml(t('newApiKey'))}"
          >
          <button
            class="btn btn-secondary btn-xs"
            type="submit"
            ${activeAction ? 'disabled' : ''}
          >
            ${escapeHtml(t(isReplacingKey ? 'replaceKeyBusy' : 'replaceKey'))}
          </button>
          <button
            class="btn btn-link btn-xs"
            type="button"
            data-ai-provider-cancel-replace-key
            data-provider-id="${escapedProviderId}"
            ${activeAction ? 'disabled' : ''}
          >
            ${escapeHtml(t('cancel'))}
          </button>
        </form>
        `
            : `<button
          type="button"
          class="btn btn-secondary btn-xs ai-provider-admin-replace-key-toggle"
          data-ai-provider-show-replace-key
          data-provider-id="${escapedProviderId}"
          aria-label="${escapeHtml(t('replaceProviderKeyFor'))} ${escapedProviderName}"
          ${activeAction ? 'disabled' : ''}
        >
          ${escapeHtml(t('replaceKey'))}
        </button>`
        }
      </td>
      <td>${escapeHtml(provider.baseURL)}</td>
      <td>${escapeHtml(models)}</td>
      <td>${escapeHtml(provider.defaultModel || t('none'))}</td>
      <td>${renderStatusBadge(healthLabel(provider.healthStatus, t), provider.healthStatus)}</td>
      <td>${renderStatusBadge(
        provider.enabled ? t('enabled') : t('disabled'),
        provider.enabled ? 'enabled' : 'disabled'
      )}</td>
      <td>
        <div class="ai-admin-actions">
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-sync-models
          data-provider-id="${escapedProviderId}"
          ${activeAction ? 'disabled' : ''}
        >
          ${escapeHtml(t(isSyncing ? 'syncingModels' : 'syncModels'))}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-test
          data-provider-id="${escapedProviderId}"
          ${activeAction ? 'disabled' : ''}
        >
          ${escapeHtml(t(isTesting ? 'testingProvider' : 'test'))}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-toggle
          data-provider-id="${escapedProviderId}"
          ${activeAction ? 'disabled' : ''}
        >
          ${provider.enabled ? t('disable') : t('enable')}
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          data-ai-provider-delete
          data-provider-id="${escapedProviderId}"
          aria-label="${escapeHtml(t('delete'))} ${escapedProviderName}"
          ${activeAction ? 'disabled' : ''}
        >
          ${escapeHtml(t('delete'))}
        </button>
        </div>
      </td>
    </tr>
  `
}

function renderCreateForm(t: (key: TranslationKey) => string) {
  const modelIdsHelpId = 'ai-provider-model-ids-help'
  const presets = [
    { label: t('selectPreset'), value: '' },
    { label: 'ClaudeAIHub - GPT-5.5', value: 'claudeaihub-gpt55' },
    { label: 'ClaudeAIHub - Claude Opus 4.8', value: 'claudeaihub-opus48' },
    { label: 'DeepSeek 官方', value: 'deepseek' },
  ]

  return `
    <form class="ai-admin-form" aria-label="${escapeHtml(
      t('addProviderForm')
    )}" data-ai-provider-create-form>
      <div class="form-group">
        <label class="form-label" for="ai-provider-preset">${escapeHtml(t('presetChannels'))}</label>
        <select class="form-control" id="ai-provider-preset" data-ai-provider-preset>
          ${presets.map(p => `<option value="${escapeAttribute(p.value)}">${escapeHtml(p.label)}</option>`).join('')}
        </select>
      </div>
      <div class="ai-admin-form-grid">
      <div class="form-group">
        <label class="form-label" for="ai-provider-name">${escapeHtml(
          t('providerName')
        )}</label>
        <input class="form-control" id="ai-provider-name" name="name" type="text" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-base-url">${escapeHtml(
          t('baseURL')
        )}</label>
        <input class="form-control" id="ai-provider-base-url" name="baseURL" type="url" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-api-key">${escapeHtml(
          t('apiKey')
        )}</label>
        <input class="form-control" id="ai-provider-api-key" name="apiKey" type="password" required autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-model-ids">${escapeHtml(
          t('modelIds')
        )}</label>
        <input
          class="form-control"
          id="ai-provider-model-ids"
          name="modelIds"
          type="text"
          placeholder="gpt-4.1, deepseek-chat"
          aria-describedby="${modelIdsHelpId}"
        >
        <p class="ai-admin-help-text" id="${modelIdsHelpId}">
          ${escapeHtml(t('modelIdsHelp'))}
        </p>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-default-model">${escapeHtml(
          t('defaultModel')
        )}</label>
        <input class="form-control" id="ai-provider-default-model" name="defaultModel" type="text">
      </div>
      </div>
      <div class="ai-admin-form-footer">
        <label class="ai-admin-checkbox" for="ai-provider-enabled">
          <input id="ai-provider-enabled" name="enabled" type="checkbox" checked>
          <span>${escapeHtml(t('enabled'))}</span>
        </label>
      <button class="btn btn-primary" type="submit">${escapeHtml(
        t('addProvider')
      )}</button>
      </div>
    </form>
  `
}

function healthLabel(
  healthStatus: AiProvider['healthStatus'],
  t: (key: TranslationKey) => string
) {
  if (healthStatus === 'unknown') {
    return t('unknown')
  }
  return healthStatus
}

function providerInputFromForm(form: HTMLFormElement) {
  const modelIds = getFormInput(form, 'modelIds')
    .value.split(/[,\n]/)
    .map(modelId => modelId.trim())
    .filter(Boolean)

  return {
    name: getFormInput(form, 'name').value,
    providerType: 'openai-compatible',
    baseURL: getFormInput(form, 'baseURL').value,
    apiKey: getFormInput(form, 'apiKey').value,
    enabled: getFormInput(form, 'enabled').checked,
    models: modelIds.map(modelId => ({
      id: modelId,
      displayName: modelId,
      source: 'manual',
      enabled: true,
    })),
    defaultModel: getFormInput(form, 'defaultModel').value || null,
  }
}

function getFormInput(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${name}`)
  }
  return input
}

function findProvider(providers: AiProvider[], providerId?: string) {
  return providers.find(provider => provider.id === providerId)
}

function renderStatusBadge(label: string, tone: string) {
  return `<span class="ai-admin-status ai-admin-status-${escapeAttribute(
    tone
  )}">${escapeHtml(label)}</span>`
}

function getAdminLanguage(): AdminLanguage {
  const language = getMeta('ol-i18n')?.currentLangCode || 'en'
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return character
    }
  })
}

function escapeAttribute(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
}
