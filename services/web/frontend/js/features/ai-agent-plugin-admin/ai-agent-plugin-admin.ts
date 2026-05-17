type AgentPluginSource =
  | {
      sourceType: 'local_directory'
      path: string
    }
  | {
      sourceType: 'zip_url'
      url: string
    }

type AgentPluginPreviewSkill = {
  id: string
  displayName: string
  description: string
  requiredTools: string[]
  contentBytes: number
  sourcePath: string
}

type AgentPluginPreview = {
  plugin: {
    id: string
    name: string
    version: string
    displayName: string
    description: string
    manifestFormat: string
  }
  source: {
    type: string
    url?: string
    pathHash?: string
  }
  skills: AgentPluginPreviewSkill[]
  integrity: {
    sha256?: string
  }
  packageBytes: number
  fileCount: number
  warnings: string[]
}

type AgentPluginInstallation = {
  pluginId: string
  name: string
  version: string
  displayName: string
  description: string
  enabled: boolean
  status: string
  manifestFormat: string
  source: {
    type: string
    url?: string
    pathHash?: string
  }
  integrity: {
    sha256?: string
  }
  packageBytes: number
  fileCount: number
  skillIds: string[]
  warnings: string[]
}

type PluginState = {
  plugins: AgentPluginInstallation[]
  preview: AgentPluginPreview | null
  loading: boolean
  previewing: boolean
  installing: boolean
  sourceType: 'local_directory' | 'zip_url'
  sourceValue: string
  statusMessage: string | null
  errorMessage: string | null
}

const SAFE_ERROR_MESSAGE = 'Agent plugin request failed'

export function initAiAgentPluginAdmin(root: HTMLElement): void {
  const csrfToken = root.dataset.csrfToken || ''
  const state: PluginState = {
    plugins: [],
    preview: null,
    loading: true,
    previewing: false,
    installing: false,
    sourceType: 'local_directory',
    sourceValue: '',
    statusMessage: null,
    errorMessage: null,
  }

  async function loadPlugins() {
    state.loading = true
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<{
        plugins: AgentPluginInstallation[]
      }>('/admin/ai/agent/plugins', csrfToken)
      state.plugins = response.plugins
      state.loading = false
      render()
    } catch {
      showSafeError()
    }
  }

  async function handlePreview(event: Event) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    state.previewing = true
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const source = pluginSourceFromForm(form)
      state.sourceType = source.sourceType
      state.sourceValue =
        source.sourceType === 'zip_url' ? source.url : source.path
      const response = await requestJSON<{ preview: AgentPluginPreview }>(
        '/admin/ai/agent/plugins/preview',
        csrfToken,
        {
          method: 'POST',
          body: source,
        }
      )
      state.preview = response.preview
      state.previewing = false
      state.statusMessage = 'Plugin preview ready'
      render()
    } catch {
      showSafeError()
    }
  }

  async function handleInstall() {
    const form = root.querySelector<HTMLFormElement>(
      '[data-ai-agent-plugin-source-form]'
    )
    if (!form) {
      return
    }
    state.installing = true
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const response = await requestJSON<{
        plugin: AgentPluginInstallation
      }>('/admin/ai/agent/plugins/install', csrfToken, {
        method: 'POST',
        body: {
          ...pluginSourceFromForm(form),
          enabled: getCheckboxInput(form, 'enabled').checked,
        },
      })
      upsertPlugin(response.plugin)
      state.preview = null
      state.installing = false
      state.statusMessage = 'Plugin installed'
      render()
    } catch {
      showSafeError()
    }
  }

  async function handleToggle(plugin: AgentPluginInstallation) {
    try {
      const response = await requestJSON<{
        plugin: AgentPluginInstallation
      }>(
        `/admin/ai/agent/plugins/${encodeURIComponent(plugin.pluginId)}`,
        csrfToken,
        {
          method: 'PATCH',
          body: { enabled: !plugin.enabled },
        }
      )
      upsertPlugin(response.plugin)
      state.statusMessage = response.plugin.enabled
        ? 'Plugin enabled'
        : 'Plugin disabled'
      state.errorMessage = null
      render()
    } catch {
      showSafeError()
    }
  }

  function upsertPlugin(plugin: AgentPluginInstallation) {
    const index = state.plugins.findIndex(
      existingPlugin => existingPlugin.pluginId === plugin.pluginId
    )
    if (index === -1) {
      state.plugins = [plugin, ...state.plugins]
    } else {
      state.plugins = state.plugins.map(existingPlugin =>
        existingPlugin.pluginId === plugin.pluginId ? plugin : existingPlugin
      )
    }
  }

  function showSafeError() {
    state.loading = false
    state.previewing = false
    state.installing = false
    state.statusMessage = null
    state.errorMessage = SAFE_ERROR_MESSAGE
    render()
  }

  function render() {
    root.innerHTML = `
      <div class="ai-agent-plugin-admin">
        <div class="ai-provider-admin-feedback">
          <div class="text-muted" role="status">${escapeHtml(
            state.loading
              ? 'Loading Agent plugins...'
              : state.statusMessage || ''
          )}</div>
          ${
            state.errorMessage
              ? `<div class="alert alert-danger" role="alert">${escapeHtml(
                  state.errorMessage
                )}</div>`
              : ''
          }
        </div>
        ${renderPluginTable(state.plugins, state.loading)}
        ${renderSourceForm(state)}
        ${renderPreview(state.preview, state.previewing, state.installing)}
      </div>
    `

    root
      .querySelector<HTMLFormElement>('[data-ai-agent-plugin-source-form]')
      ?.addEventListener('submit', handlePreview)

    root
      .querySelector<HTMLSelectElement>('[data-ai-agent-plugin-source-type]')
      ?.addEventListener('change', event => {
        const select = event.currentTarget as HTMLSelectElement | null
        if (!select) {
          return
        }
        state.sourceType =
          select.value === 'zip_url' ? 'zip_url' : 'local_directory'
        state.sourceValue = ''
        state.preview = null
        render()
      })

    root
      .querySelector<HTMLButtonElement>('[data-ai-agent-plugin-install]')
      ?.addEventListener('click', () => {
        void handleInstall()
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-agent-plugin-toggle]')
      .forEach(button => {
        button.addEventListener('click', () => {
          const plugin = state.plugins.find(
            item => item.pluginId === button.dataset.pluginId
          )
          if (plugin) {
            void handleToggle(plugin)
          }
        })
      })
  }

  render()
  void loadPlugins()
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

  return response.json()
}

function renderPluginTable(
  plugins: AgentPluginInstallation[],
  loading: boolean
) {
  if (loading) {
    return ''
  }
  if (plugins.length === 0) {
    return '<p class="text-muted">No Agent plugins installed</p>'
  }

  return `
    <table class="table table-striped">
      <thead>
        <tr>
          <th>Name</th>
          <th>Version</th>
          <th>Skills</th>
          <th>Source</th>
          <th>Integrity</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${plugins.map(renderPluginRow).join('')}
      </tbody>
    </table>
  `
}

function renderPluginRow(plugin: AgentPluginInstallation) {
  const escapedPluginId = escapeHtml(plugin.pluginId)
  return `
    <tr>
      <td>
        <strong>${escapeHtml(plugin.displayName || plugin.name)}</strong>
        <div class="small text-muted">${escapeHtml(plugin.pluginId)}</div>
      </td>
      <td>${escapeHtml(plugin.version)}</td>
      <td>${plugin.skillIds.length}</td>
      <td>${escapeHtml(sourceLabel(plugin.source))}</td>
      <td><code>${escapeHtml(shortHash(plugin.integrity.sha256))}</code></td>
      <td>${escapeHtml(plugin.enabled ? 'Enabled' : 'Disabled')}</td>
      <td>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          data-ai-agent-plugin-toggle
          data-plugin-id="${escapedPluginId}"
        >
          ${plugin.enabled ? 'Disable' : 'Enable'}
        </button>
      </td>
    </tr>
  `
}

function renderSourceForm(state: PluginState) {
  const isLocal = state.sourceType === 'local_directory'
  return `
    <hr>
    <h4>Install Agent plugin</h4>
    <form aria-label="Preview Agent plugin" data-ai-agent-plugin-source-form>
      <div class="form-group">
        <label class="form-label" for="ai-agent-plugin-source-type">Source type</label>
        <select
          class="form-control"
          id="ai-agent-plugin-source-type"
          name="sourceType"
          data-ai-agent-plugin-source-type
        >
          <option value="local_directory" ${isLocal ? 'selected' : ''}>Local directory</option>
          <option value="zip_url" ${isLocal ? '' : 'selected'}>HTTPS zip URL</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="ai-agent-plugin-source-value">${
          isLocal ? 'Plugin directory path' : 'Plugin zip URL'
        }</label>
        <input
          class="form-control"
          id="ai-agent-plugin-source-value"
          name="sourceValue"
          type="${isLocal ? 'text' : 'url'}"
          value="${escapeHtml(state.sourceValue)}"
          required
        >
      </div>
      <div class="checkbox">
        <label for="ai-agent-plugin-enabled">
          <input id="ai-agent-plugin-enabled" name="enabled" type="checkbox" checked>
          Enable after install
        </label>
      </div>
      <button class="btn btn-secondary" type="submit" ${
        state.previewing ? 'disabled' : ''
      }>Preview plugin</button>
    </form>
  `
}

function renderPreview(
  preview: AgentPluginPreview | null,
  previewing: boolean,
  installing: boolean
) {
  if (previewing) {
    return '<p class="text-muted">Previewing plugin...</p>'
  }
  if (!preview) {
    return ''
  }

  return `
    <div class="well ai-agent-plugin-preview">
      <h4>${escapeHtml(preview.plugin.displayName || preview.plugin.name)}</h4>
      <dl class="dl-horizontal">
        <dt>Plugin ID</dt>
        <dd>${escapeHtml(preview.plugin.id)}</dd>
        <dt>Version</dt>
        <dd>${escapeHtml(preview.plugin.version)}</dd>
        <dt>Manifest</dt>
        <dd>${escapeHtml(preview.plugin.manifestFormat)}</dd>
        <dt>Files</dt>
        <dd>${preview.fileCount} files, ${formatBytes(preview.packageBytes)}</dd>
        <dt>SHA-256</dt>
        <dd><code>${escapeHtml(preview.integrity.sha256 || '')}</code></dd>
      </dl>
      <h5>Skills</h5>
      <ul>
        ${preview.skills.map(renderPreviewSkill).join('')}
      </ul>
      <button
        type="button"
        class="btn btn-primary"
        data-ai-agent-plugin-install
        ${installing ? 'disabled' : ''}
      >
        Install plugin
      </button>
    </div>
  `
}

function renderPreviewSkill(skill: AgentPluginPreviewSkill) {
  return `
    <li>
      <strong>${escapeHtml(skill.displayName || skill.id)}</strong>
      <div class="small text-muted">${escapeHtml(skill.id)}</div>
      <div>${escapeHtml(skill.description)}</div>
      <div class="small text-muted">
        ${escapeHtml(skill.requiredTools.join(', ') || 'No required tools')} ·
        ${formatBytes(skill.contentBytes)}
      </div>
    </li>
  `
}

function pluginSourceFromForm(form: HTMLFormElement): AgentPluginSource {
  const sourceType = getFormInput(form, 'sourceType').value
  const sourceValue = getFormInput(form, 'sourceValue').value
  if (sourceType === 'zip_url') {
    return {
      sourceType: 'zip_url',
      url: sourceValue,
    }
  }
  return {
    sourceType: 'local_directory',
    path: sourceValue,
  }
}

function getFormInput(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) {
    throw new Error(`Missing input: ${name}`)
  }
  return input
}

function getCheckboxInput(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${name}`)
  }
  return input
}

function sourceLabel(source: AgentPluginInstallation['source']) {
  if (source.type === 'zip_url') {
    return source.url || 'HTTPS zip URL'
  }
  if (source.type === 'local_directory') {
    return 'Local directory'
  }
  return 'Unknown'
}

function shortHash(hash?: string) {
  return hash ? hash.slice(0, 12) : 'unknown'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
