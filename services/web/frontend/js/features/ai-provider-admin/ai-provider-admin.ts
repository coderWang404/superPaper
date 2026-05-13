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
  statusMessage: string | null
  errorMessage: string | null
}

type ProviderListResponse = {
  providers: AiProvider[]
}

type ProviderResponse = {
  provider: AiProvider
}

const SAFE_ERROR_MESSAGE = 'AI provider request failed'

export function initAiProviderAdmin(root: HTMLElement): void {
  const csrfToken = root.dataset.csrfToken || ''
  const state: ProviderState = {
    providers: [],
    loading: true,
    statusMessage: null,
    errorMessage: null,
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
      state.statusMessage = 'Provider added'
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
      state.statusMessage = 'Models synced'
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
        ? 'Provider test passed'
        : 'Provider test failed'
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
        ? 'Provider enabled'
        : 'Provider disabled'
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
      state.statusMessage = 'API key replaced'
      state.errorMessage = null
      apiKeyInput.value = ''
      render()
    } catch (error) {
      showSafeError()
    }
  }

  async function handleDeleteProvider(provider: AiProvider) {
    if (!window.confirm(`Delete AI provider ${provider.name}?`)) {
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
      state.statusMessage = 'Provider deleted'
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
    state.errorMessage = SAFE_ERROR_MESSAGE
    state.statusMessage = null
    render()
  }

  function render() {
    root.innerHTML = `
      <div class="ai-provider-admin">
        <div class="ai-provider-admin-feedback">
          <div class="text-muted" role="status">${escapeHtml(
            state.loading ? 'Loading AI providers...' : state.statusMessage || ''
          )}</div>
          ${
            state.errorMessage
              ? `<div class="alert alert-danger" role="alert">${escapeHtml(
                  state.errorMessage
                )}</div>`
              : ''
          }
        </div>
        ${renderProviderTable(state.providers, state.loading)}
        ${renderCreateForm()}
      </div>
    `

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

function renderProviderTable(providers: AiProvider[], loading: boolean) {
  if (loading) {
    return ''
  }

  if (providers.length === 0) {
    return '<p class="text-muted">No AI providers configured</p>'
  }

  return `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Name</th>
          <th>Base URL</th>
          <th>Models</th>
          <th>Default</th>
          <th>Health</th>
          <th>Enabled</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${providers.map(renderProviderRow).join('')}
      </tbody>
    </table>
  `
}

function renderProviderRow(provider: AiProvider) {
  const models = provider.models.map(model => model.id).join(', ') || 'No models'
  const escapedProviderId = escapeHtml(provider.id)
  const escapedProviderName = escapeHtml(provider.name)
  return `
    <tr>
      <td>
        <strong>${escapedProviderName}</strong>
        <div class="small text-muted">${
          provider.hasApiKey ? 'API key stored' : 'No API key stored'
        }</div>
        <form
          class="ai-provider-admin-replace-key"
          aria-label="Replace ${escapedProviderName} key"
          data-ai-provider-replace-key-form
          data-provider-id="${escapedProviderId}"
        >
          <label class="sr-only" for="ai-provider-replacement-key-${escapedProviderId}">
            New API key for ${escapedProviderName}
          </label>
          <input
            class="form-control input-sm"
            id="ai-provider-replacement-key-${escapedProviderId}"
            name="replacementApiKey"
            type="password"
            autocomplete="off"
            placeholder="New API key"
          >
          <button class="btn btn-secondary btn-xs" type="submit">Replace key</button>
        </form>
      </td>
      <td>${escapeHtml(provider.baseURL)}</td>
      <td>${escapeHtml(models)}</td>
      <td>${escapeHtml(provider.defaultModel || 'None')}</td>
      <td>${escapeHtml(provider.healthStatus || 'unknown')}</td>
      <td>${provider.enabled ? 'Enabled' : 'Disabled'}</td>
      <td>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-sync-models
          data-provider-id="${escapedProviderId}"
        >
          Sync models
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-test
          data-provider-id="${escapedProviderId}"
        >
          Test
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-provider-toggle
          data-provider-id="${escapedProviderId}"
        >
          ${provider.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          data-ai-provider-delete
          data-provider-id="${escapedProviderId}"
        >
          Delete
        </button>
      </td>
    </tr>
  `
}

function renderCreateForm() {
  return `
    <hr>
    <h4>Add provider</h4>
    <form aria-label="Add AI provider" data-ai-provider-create-form>
      <div class="form-group">
        <label class="form-label" for="ai-provider-name">Provider name</label>
        <input class="form-control" id="ai-provider-name" name="name" type="text" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-base-url">Base URL</label>
        <input class="form-control" id="ai-provider-base-url" name="baseURL" type="url" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-api-key">API key</label>
        <input class="form-control" id="ai-provider-api-key" name="apiKey" type="password" required autocomplete="off">
      </div>
      <div class="checkbox">
        <label for="ai-provider-enabled">
          <input id="ai-provider-enabled" name="enabled" type="checkbox" checked>
          Enabled
        </label>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-model-ids">Model IDs</label>
        <input class="form-control" id="ai-provider-model-ids" name="modelIds" type="text" placeholder="gpt-4.1, deepseek-chat">
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-provider-default-model">Default model</label>
        <input class="form-control" id="ai-provider-default-model" name="defaultModel" type="text">
      </div>
      <button class="btn btn-primary" type="submit">Add provider</button>
    </form>
  `
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
