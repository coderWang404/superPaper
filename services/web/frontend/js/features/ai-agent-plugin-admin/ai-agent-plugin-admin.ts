import getMeta from '@/utils/meta'

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

type AdminLanguage = 'en' | 'zh'

type TranslationKey =
  | 'actions'
  | 'agentPlugins'
  | 'agentPluginsDescription'
  | 'disabled'
  | 'disable'
  | 'enabled'
  | 'enable'
  | 'enableAfterInstall'
  | 'fileCount'
  | 'files'
  | 'integrity'
  | 'installAgentPlugin'
  | 'installPlugin'
  | 'installed'
  | 'loading'
  | 'localDirectory'
  | 'manifest'
  | 'name'
  | 'noPlugins'
  | 'noRequiredTools'
  | 'pluginDirectoryPath'
  | 'pluginDisabled'
  | 'pluginEnabled'
  | 'pluginId'
  | 'pluginInstalled'
  | 'pluginPreviewReady'
  | 'pluginRequestFailed'
  | 'pluginZipUrl'
  | 'previewAgentPlugin'
  | 'previewingPlugin'
  | 'previewPlugin'
  | 'safeSubset'
  | 'sha256'
  | 'skills'
  | 'source'
  | 'sourceType'
  | 'status'
  | 'unknown'
  | 'version'
  | 'zipUrl'

const TRANSLATIONS: Record<AdminLanguage, Record<TranslationKey, string>> = {
  en: {
    actions: 'Actions',
    agentPlugins: 'Agent plugins',
    agentPluginsDescription:
      'Install instruction-only packages that add reusable Agent skills. Executable capabilities are rejected server-side.',
    disabled: 'Disabled',
    disable: 'Disable',
    enabled: 'Enabled',
    enable: 'Enable',
    enableAfterInstall: 'Enable after install',
    fileCount: 'Files',
    files: 'files',
    integrity: 'Integrity',
    installAgentPlugin: 'Install Agent plugin',
    installPlugin: 'Install plugin',
    installed: 'Installed',
    loading: 'Loading Agent plugins...',
    localDirectory: 'Local directory',
    manifest: 'Manifest',
    name: 'Name',
    noPlugins: 'No Agent plugins installed',
    noRequiredTools: 'No required tools',
    pluginDirectoryPath: 'Plugin directory path',
    pluginDisabled: 'Plugin disabled',
    pluginEnabled: 'Plugin enabled',
    pluginId: 'Plugin ID',
    pluginInstalled: 'Plugin installed',
    pluginPreviewReady: 'Plugin preview ready',
    pluginRequestFailed: 'Agent plugin request failed',
    pluginZipUrl: 'Plugin zip URL',
    previewAgentPlugin: 'Preview Agent plugin',
    previewingPlugin: 'Previewing plugin...',
    previewPlugin: 'Preview plugin',
    safeSubset: 'Safe subset',
    sha256: 'SHA-256',
    skills: 'Skills',
    source: 'Source',
    sourceType: 'Source type',
    status: 'Status',
    unknown: 'Unknown',
    version: 'Version',
    zipUrl: 'HTTPS zip URL',
  },
  zh: {
    actions: '操作',
    agentPlugins: 'Agent 插件',
    agentPluginsDescription:
      '安装只包含指令的能力包，为 Agent 增加可复用技能。可执行能力由服务端拒绝。',
    disabled: '已禁用',
    disable: '禁用',
    enabled: '已启用',
    enable: '启用',
    enableAfterInstall: '安装后启用',
    fileCount: '文件',
    files: '个文件',
    integrity: '完整性',
    installAgentPlugin: '安装 Agent 插件',
    installPlugin: '安装插件',
    installed: '已安装',
    loading: '正在加载 Agent 插件...',
    localDirectory: '本地目录',
    manifest: '清单',
    name: '名称',
    noPlugins: '尚未安装 Agent 插件',
    noRequiredTools: '无工具依赖',
    pluginDirectoryPath: '插件目录路径',
    pluginDisabled: '插件已禁用',
    pluginEnabled: '插件已启用',
    pluginId: '插件 ID',
    pluginInstalled: '插件已安装',
    pluginPreviewReady: '插件预览已生成',
    pluginRequestFailed: 'Agent 插件请求失败',
    pluginZipUrl: '插件 zip 地址',
    previewAgentPlugin: '预览 Agent 插件',
    previewingPlugin: '正在预览插件...',
    previewPlugin: '预览插件',
    safeSubset: '安全子集',
    sha256: 'SHA-256',
    skills: '技能',
    source: '来源',
    sourceType: '来源类型',
    status: '状态',
    unknown: '未知',
    version: '版本',
    zipUrl: 'HTTPS zip 地址',
  },
}

const SAFE_ERROR_MESSAGE = 'Agent plugin request failed'

export function initAiAgentPluginAdmin(root: HTMLElement): void {
  const csrfToken = root.dataset.csrfToken || ''
  const language = getAdminLanguage()
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

  function t(key: TranslationKey) {
    return TRANSLATIONS[language][key]
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
      state.statusMessage = t('pluginPreviewReady')
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
      state.statusMessage = t('pluginInstalled')
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
        ? t('pluginEnabled')
        : t('pluginDisabled')
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
    state.errorMessage = t('pluginRequestFailed')
    render()
  }

  function render() {
    root.innerHTML = `
      <div class="ai-agent-plugin-admin">
        ${renderPluginOverview(state.plugins, t)}
        <div class="ai-provider-admin-feedback">
          <div class="text-muted" role="status">${escapeHtml(
            state.loading ? t('loading') : state.statusMessage || ''
          )}</div>
          ${
            state.errorMessage
              ? `<div class="alert alert-danger" role="alert">${escapeHtml(
                  state.errorMessage
                )}</div>`
              : ''
          }
        </div>
        <div class="ai-admin-section">
          <div class="ai-admin-section-header">
            <div>
              <h4>${escapeHtml(t('agentPlugins'))}</h4>
              <p>${escapeHtml(t('agentPluginsDescription'))}</p>
            </div>
          </div>
          ${renderPluginTable(state.plugins, state.loading, t)}
        </div>
        <div class="ai-admin-section">
          <div class="ai-admin-section-header">
            <div>
              <h4>${escapeHtml(t('installAgentPlugin'))}</h4>
              <p>${escapeHtml(t('safeSubset'))}</p>
            </div>
          </div>
          ${renderSourceForm(state, t)}
          ${renderPreview(state.preview, state.previewing, state.installing, t)}
        </div>
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

function renderPluginOverview(
  plugins: AgentPluginInstallation[],
  t: (key: TranslationKey) => string
) {
  const enabledCount = plugins.filter(plugin => plugin.enabled).length
  const skillCount = plugins.reduce(
    (total, plugin) => total + plugin.skillIds.length,
    0
  )

  return `
    <div class="ai-admin-overview" aria-label="${escapeHtml(
      t('agentPlugins')
    )}">
      ${renderMetric(t('installed'), String(plugins.length))}
      ${renderMetric(t('enabled'), String(enabledCount))}
      ${renderMetric(t('skills'), String(skillCount))}
      ${renderMetric(t('safeSubset'), 'v1')}
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

function renderPluginTable(
  plugins: AgentPluginInstallation[],
  loading: boolean,
  t: (key: TranslationKey) => string
) {
  if (loading) {
    return ''
  }
  if (plugins.length === 0) {
    return `<p class="text-muted">${escapeHtml(t('noPlugins'))}</p>`
  }

  return `
    <div class="ai-admin-table-wrap">
      <table class="table table-striped ai-admin-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('name'))}</th>
            <th>${escapeHtml(t('version'))}</th>
            <th>${escapeHtml(t('skills'))}</th>
            <th>${escapeHtml(t('source'))}</th>
            <th>${escapeHtml(t('integrity'))}</th>
            <th>${escapeHtml(t('status'))}</th>
            <th>${escapeHtml(t('actions'))}</th>
          </tr>
        </thead>
        <tbody>
          ${plugins.map(plugin => renderPluginRow(plugin, t)).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderPluginRow(
  plugin: AgentPluginInstallation,
  t: (key: TranslationKey) => string
) {
  const escapedPluginId = escapeHtml(plugin.pluginId)
  return `
    <tr>
      <td>
        <strong>${escapeHtml(plugin.displayName || plugin.name)}</strong>
        <div class="ai-admin-row-subtitle">${escapeHtml(plugin.pluginId)}</div>
      </td>
      <td>${escapeHtml(plugin.version)}</td>
      <td>${plugin.skillIds.length}</td>
      <td>${escapeHtml(sourceLabel(plugin.source, t))}</td>
      <td><code>${escapeHtml(shortHash(plugin.integrity.sha256))}</code></td>
      <td>${renderStatusBadge(
        plugin.enabled ? t('enabled') : t('disabled'),
        plugin.enabled ? 'enabled' : 'disabled'
      )}</td>
      <td>
        <div class="ai-admin-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-ai-agent-plugin-toggle
            data-plugin-id="${escapedPluginId}"
          >
            ${plugin.enabled ? t('disable') : t('enable')}
          </button>
        </div>
      </td>
    </tr>
  `
}

function renderSourceForm(
  state: PluginState,
  t: (key: TranslationKey) => string
) {
  const isLocal = state.sourceType === 'local_directory'
  return `
    <form class="ai-admin-form" aria-label="${escapeHtml(
      t('previewAgentPlugin')
    )}" data-ai-agent-plugin-source-form>
      <div class="ai-admin-form-grid">
        <div class="form-group">
          <label class="form-label" for="ai-agent-plugin-source-type">${escapeHtml(
            t('sourceType')
          )}</label>
          <select
            class="form-control"
            id="ai-agent-plugin-source-type"
            name="sourceType"
            data-ai-agent-plugin-source-type
          >
            <option value="local_directory" ${isLocal ? 'selected' : ''}>${escapeHtml(
              t('localDirectory')
            )}</option>
            <option value="zip_url" ${isLocal ? '' : 'selected'}>${escapeHtml(
              t('zipUrl')
            )}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ai-agent-plugin-source-value">${
            isLocal
              ? escapeHtml(t('pluginDirectoryPath'))
              : escapeHtml(t('pluginZipUrl'))
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
      </div>
      <div class="ai-admin-form-footer">
        <label class="ai-admin-checkbox" for="ai-agent-plugin-enabled">
          <input id="ai-agent-plugin-enabled" name="enabled" type="checkbox" checked>
          <span>${escapeHtml(t('enableAfterInstall'))}</span>
        </label>
        <button class="btn btn-secondary" type="submit" ${
          state.previewing ? 'disabled' : ''
        }>${escapeHtml(t('previewPlugin'))}</button>
      </div>
    </form>
  `
}

function renderPreview(
  preview: AgentPluginPreview | null,
  previewing: boolean,
  installing: boolean,
  t: (key: TranslationKey) => string
) {
  if (previewing) {
    return `<p class="text-muted">${escapeHtml(t('previewingPlugin'))}</p>`
  }
  if (!preview) {
    return ''
  }

  return `
    <div class="ai-agent-plugin-preview">
      <div class="ai-agent-plugin-preview-header">
        <h4>${escapeHtml(preview.plugin.displayName || preview.plugin.name)}</h4>
        ${renderStatusBadge(t('safeSubset'), 'enabled')}
      </div>
      <dl class="ai-admin-definition-list">
        <dt>${escapeHtml(t('pluginId'))}</dt>
        <dd>${escapeHtml(preview.plugin.id)}</dd>
        <dt>${escapeHtml(t('version'))}</dt>
        <dd>${escapeHtml(preview.plugin.version)}</dd>
        <dt>${escapeHtml(t('manifest'))}</dt>
        <dd>${escapeHtml(preview.plugin.manifestFormat)}</dd>
        <dt>${escapeHtml(t('fileCount'))}</dt>
        <dd>${preview.fileCount} ${escapeHtml(t('files'))}, ${formatBytes(
          preview.packageBytes
        )}</dd>
        <dt>${escapeHtml(t('sha256'))}</dt>
        <dd><code>${escapeHtml(preview.integrity.sha256 || '')}</code></dd>
      </dl>
      <h5>${escapeHtml(t('skills'))}</h5>
      <ul class="ai-agent-plugin-skill-list">
        ${preview.skills.map(skill => renderPreviewSkill(skill, t)).join('')}
      </ul>
      <button
        type="button"
        class="btn btn-primary"
        data-ai-agent-plugin-install
        ${installing ? 'disabled' : ''}
      >
        ${escapeHtml(t('installPlugin'))}
      </button>
    </div>
  `
}

function renderPreviewSkill(
  skill: AgentPluginPreviewSkill,
  t: (key: TranslationKey) => string
) {
  return `
    <li>
      <strong>${escapeHtml(skill.displayName || skill.id)}</strong>
      <div class="ai-admin-row-subtitle">${escapeHtml(skill.id)}</div>
      <div>${escapeHtml(skill.description)}</div>
      <div class="ai-admin-row-subtitle">
        ${escapeHtml(skill.requiredTools.join(', ') || t('noRequiredTools'))} ·
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

function sourceLabel(
  source: AgentPluginInstallation['source'],
  t: (key: TranslationKey) => string
) {
  if (source.type === 'zip_url') {
    return source.url || t('zipUrl')
  }
  if (source.type === 'local_directory') {
    return t('localDirectory')
  }
  return t('unknown')
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
