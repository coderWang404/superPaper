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
  language: AdminLanguage
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
  | 'addProviderForm'
  | 'apiKey'
  | 'apiKeyReplaced'
  | 'apiKeyStored'
  | 'baseURL'
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
  | 'models'
  | 'modelsSynced'
  | 'name'
  | 'newApiKey'
  | 'newApiKeyFor'
  | 'noApiKeyStored'
  | 'noProviders'
  | 'noModels'
  | 'none'
  | 'providerAdded'
  | 'providerDeleted'
  | 'providerDisabled'
  | 'providerEnabled'
  | 'providerName'
  | 'providerTestFailed'
  | 'providerTestPassed'
  | 'replaceKey'
  | 'replaceKeyFor'
  | 'requestFailed'
  | 'syncModels'
  | 'test'
  | 'unknown'

const TRANSLATIONS: Record<AdminLanguage, Record<TranslationKey, string>> = {
  en: {
    actions: 'Actions',
    addProvider: 'Add provider',
    addProviderForm: 'Add AI provider',
    apiKey: 'API key',
    apiKeyReplaced: 'API key replaced',
    apiKeyStored: 'API key stored',
    baseURL: 'Base URL',
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
    models: 'Models',
    modelsSynced: 'Models synced',
    name: 'Name',
    newApiKey: 'New API key',
    newApiKeyFor: 'New API key for',
    noApiKeyStored: 'No API key stored',
    noProviders: 'No AI providers configured',
    noModels: 'No models',
    none: 'None',
    providerAdded: 'Provider added',
    providerDeleted: 'Provider deleted',
    providerDisabled: 'Provider disabled',
    providerEnabled: 'Provider enabled',
    providerName: 'Provider name',
    providerTestFailed: 'Provider test failed',
    providerTestPassed: 'Provider test passed',
    replaceKey: 'Replace key',
    replaceKeyFor: 'Replace',
    requestFailed: 'AI provider request failed',
    syncModels: 'Sync models',
    test: 'Test',
    unknown: 'unknown',
  },
  zh: {
    actions: '操作',
    addProvider: '添加供应商',
    addProviderForm: '添加 AI 供应商',
    apiKey: 'API 密钥',
    apiKeyReplaced: 'API 密钥已替换',
    apiKeyStored: 'API 密钥已保存',
    baseURL: 'Base URL',
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
    models: '模型',
    modelsSynced: '模型已同步',
    name: '名称',
    newApiKey: '新 API 密钥',
    newApiKeyFor: '新的 API 密钥：',
    noApiKeyStored: '未保存 API 密钥',
    noProviders: '尚未配置 AI 供应商',
    noModels: '无模型',
    none: '无',
    providerAdded: '供应商已添加',
    providerDeleted: '供应商已删除',
    providerDisabled: '供应商已禁用',
    providerEnabled: '供应商已启用',
    providerName: '供应商名称',
    providerTestFailed: '供应商测试失败',
    providerTestPassed: '供应商测试通过',
    replaceKey: '替换密钥',
    replaceKeyFor: '替换',
    requestFailed: 'AI 供应商请求失败',
    syncModels: '同步模型',
    test: '测试',
    unknown: '未知',
  },
}

const SAFE_ERROR_MESSAGE = 'AI provider request failed'

export function initAiProviderAdmin(root: HTMLElement): void {
  const csrfToken = root.dataset.csrfToken || ''
  const state: ProviderState = {
    providers: [],
    loading: true,
    language: 'en',
    statusMessage: null,
    errorMessage: null,
  }

  function t(key: TranslationKey) {
    return TRANSLATIONS[state.language][key]
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
    try {
      const response = await requestJSON<ProviderResponse>(
        `/admin/ai/providers/${encodeURIComponent(providerId)}/sync-models`,
        csrfToken,
        { method: 'POST' }
      )
      replaceProvider(response.provider)
      state.statusMessage = 'modelsSynced'
      state.errorMessage = null
      render()
    } catch (error) {
      showSafeError()
    }
  }

  async function handleTestProvider(providerId: string) {
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
      render()
    } catch (error) {
      showSafeError()
    }
  }

  async function handleToggleProvider(provider: AiProvider) {
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
      render()
    } catch (error) {
      showSafeError()
    }
  }

  async function handleReplaceKey(event: Event, providerId: string) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const apiKeyInput = getFormInput(form, 'replacementApiKey')

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
      apiKeyInput.value = ''
      render()
    } catch (error) {
      showSafeError()
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
    state.errorMessage = 'requestFailed'
    state.statusMessage = null
    render()
  }

  function render() {
    root.innerHTML = `
      <div class="ai-provider-admin">
        <div class="ai-provider-admin-toolbar">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-ai-provider-language-toggle
          >
            ${state.language === 'en' ? '中文' : 'English'}
          </button>
        </div>
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
        ${renderProviderTable(state.providers, state.loading, t)}
        ${renderCreateForm(t)}
      </div>
    `

    root
      .querySelector<HTMLButtonElement>('[data-ai-provider-language-toggle]')
      ?.addEventListener('click', () => {
        state.language = state.language === 'en' ? 'zh' : 'en'
        render()
      })

    root
      .querySelector<HTMLFormElement>('[data-ai-provider-create-form]')
      ?.addEventListener('submit', handleCreate)

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-sync-models]')
      .forEach(button => {
        button.addEventListener('click', () => {
          void handleSyncModels(button.dataset.providerId || '')
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-test]')
      .forEach(button => {
        button.addEventListener('click', () => {
          void handleTestProvider(button.dataset.providerId || '')
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-toggle]')
      .forEach(button => {
        button.addEventListener('click', () => {
          const provider = findProvider(state.providers, button.dataset.providerId)
          if (provider) {
            void handleToggleProvider(provider)
          }
        })
      })

    root
      .querySelectorAll<HTMLFormElement>('[data-ai-provider-replace-key-form]')
      .forEach(form => {
        form.addEventListener('submit', event => {
          void handleReplaceKey(event, form.dataset.providerId || '')
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-provider-delete]')
      .forEach(button => {
        button.addEventListener('click', () => {
          const provider = findProvider(state.providers, button.dataset.providerId)
          if (provider) {
            void handleDeleteProvider(provider)
          }
        })
      })
  }

  render()
  void loadProviders()
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

function renderProviderTable(
  providers: AiProvider[],
  loading: boolean,
  t: (key: TranslationKey) => string
) {
  if (loading) {
    return ''
  }

  if (providers.length === 0) {
    return `<p class="text-muted">${escapeHtml(t('noProviders'))}</p>`
  }

  return `
    <table class="table table-striped">
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
        ${providers.map(provider => renderProviderRow(provider, t)).join('')}
      </tbody>
    </table>
  `
}

function renderProviderRow(
  provider: AiProvider,
  t: (key: TranslationKey) => string
) {
  const models =
    provider.models.map(model => model.id).join(', ') || t('noModels')
  const escapedProviderId = escapeHtml(provider.id)
  const escapedProviderName = escapeHtml(provider.name)
  return `
    <tr>
      <td>
        <strong>${escapedProviderName}</strong>
        <div class="small text-muted">${
          provider.hasApiKey ? t('apiKeyStored') : t('noApiKeyStored')
        }</div>
        <form
          class="ai-provider-admin-replace-key"
          aria-label="${escapeHtml(t('replaceKeyFor'))} ${escapedProviderName} key"
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
          <button class="btn btn-secondary btn-xs" type="submit">${escapeHtml(
            t('replaceKey')
          )}</button>
        </form>
      </td>
      <td>${escapeHtml(provider.baseURL)}</td>
      <td>${escapeHtml(models)}</td>
      <td>${escapeHtml(provider.defaultModel || t('none'))}</td>
      <td>${escapeHtml(healthLabel(provider.healthStatus, t))}</td>
      <td>${provider.enabled ? t('enabled') : t('disabled')}</td>
      <td>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-sync-models
          data-provider-id="${escapedProviderId}"
        >
          ${escapeHtml(t('syncModels'))}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-test
          data-provider-id="${escapedProviderId}"
        >
          ${escapeHtml(t('test'))}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-toggle
          data-provider-id="${escapedProviderId}"
        >
          ${provider.enabled ? t('disable') : t('enable')}
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          data-ai-provider-delete
          data-provider-id="${escapedProviderId}"
        >
          ${escapeHtml(t('delete'))}
        </button>
      </td>
    </tr>
  `
}

function renderCreateForm(t: (key: TranslationKey) => string) {
  return `
    <hr>
    <h4>${escapeHtml(t('addProvider'))}</h4>
    <form aria-label="${escapeHtml(t('addProviderForm'))}" data-ai-provider-create-form>
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
      <div class="checkbox">
        <label for="ai-provider-enabled">
          <input id="ai-provider-enabled" name="enabled" type="checkbox" checked>
          ${escapeHtml(t('enabled'))}
        </label>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-model-ids">${escapeHtml(
          t('modelIds')
        )}</label>
        <input class="form-control" id="ai-provider-model-ids" name="modelIds" type="text" placeholder="gpt-4.1, deepseek-chat">
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-default-model">${escapeHtml(
          t('defaultModel')
        )}</label>
        <input class="form-control" id="ai-provider-default-model" name="defaultModel" type="text">
      </div>
      <button class="btn btn-primary" type="submit">${escapeHtml(
        t('addProvider')
      )}</button>
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
