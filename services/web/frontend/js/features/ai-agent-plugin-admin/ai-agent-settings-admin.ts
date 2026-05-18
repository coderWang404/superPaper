import getMeta from '@/utils/meta'

type AgentTool = {
  name: string
  description: string
  access: string
  requiresApproval: boolean
  category?: string
  riskLevel?: string
}

type AgentSkill = {
  id: string
  name: string
  displayName: string
  description: string
  modelInvocable: boolean
  requiredTools: string[]
  keywords?: string[]
  content?: string
  enabled?: boolean
  scope?: string
  pluginId?: string | null
}

type AgentPlugin = {
  id: string
  name: string
  version: string
  displayName?: string
  description: string
  enabled: boolean
  skills: string[]
  toolPresets: string[]
  scope?: string
}

type AgentInstructionProfile = {
  id: string
  scope: 'global' | 'project'
  projectId: string | null
  name: string
  enabled: boolean
  content?: string
  bytes?: number
  sha256?: string
  createdAt: string | null
  updatedAt: string | null
}

type AgentConfig = {
  tools: AgentTool[]
  skills: AgentSkill[]
  plugins: AgentPlugin[]
  enabledSkillIds?: string[]
  enabledPluginIds?: string[]
  instructionProfiles?: AgentInstructionProfile[]
}

type SkillFormState = {
  editingSkillId: string | null
  id: string
  displayName: string
  description: string
  keywords: string
  requiredTools: string[]
  content: string
  enabled: boolean
  modelInvocable: boolean
  pluginId: string | null
}

type InstructionFormState = {
  editingName: string | null
  name: string
  content: string
  enabled: boolean
}

type SettingsState = {
  config: AgentConfig | null
  loading: boolean
  savingSkill: boolean
  savingInstructions: boolean
  activeAction: string | null
  skillForm: SkillFormState
  instructionForm: InstructionFormState
  statusMessage: string | null
  errorMessage: string | null
}

type AdminLanguage = 'en' | 'zh'

type TranslationKey =
  | 'actions'
  | 'addCustomSkill'
  | 'agentRules'
  | 'agentRulesDescription'
  | 'cancel'
  | 'content'
  | 'customSkills'
  | 'disabled'
  | 'disableSkill'
  | 'enabled'
  | 'enableSkill'
  | 'globalInstructionsSaved'
  | 'instructionEnabled'
  | 'instructionName'
  | 'instructions'
  | 'keywords'
  | 'loading'
  | 'modelInvocable'
  | 'name'
  | 'noRequiredTools'
  | 'noSkills'
  | 'plugin'
  | 'requiredTools'
  | 'saveInstructions'
  | 'saveSkill'
  | 'savingInstructions'
  | 'savingSkill'
  | 'scope'
  | 'skillDescription'
  | 'skillDisabled'
  | 'skillEnabled'
  | 'skillId'
  | 'skillName'
  | 'skillSaved'
  | 'status'
  | 'unknown'
  | 'updateSkill'

const TRANSLATIONS: Record<AdminLanguage, Record<TranslationKey, string>> = {
  en: {
    actions: 'Actions',
    addCustomSkill: 'Add custom skill',
    agentRules: 'Global Agent rules',
    agentRulesDescription: 'AGENTS.md-style instructions applied to all projects.',
    cancel: 'Cancel',
    content: 'Content',
    customSkills: 'Agent skills',
    disabled: 'Disabled',
    disableSkill: 'Disable skill',
    enabled: 'Enabled',
    enableSkill: 'Enable skill',
    globalInstructionsSaved: 'Global Agent rules saved',
    instructionEnabled: 'Enable these rules',
    instructionName: 'Rule profile name',
    instructions: 'Instructions',
    keywords: 'Keywords',
    loading: 'Loading Agent settings...',
    modelInvocable: 'Model can select this skill',
    name: 'Name',
    noRequiredTools: 'No required tools',
    noSkills: 'No Agent skills configured',
    plugin: 'Plugin',
    requiredTools: 'Required tools',
    saveInstructions: 'Save rules',
    saveSkill: 'Save skill',
    savingInstructions: 'Saving rules...',
    savingSkill: 'Saving skill...',
    scope: 'Scope',
    skillDescription: 'Description',
    skillDisabled: 'Skill disabled',
    skillEnabled: 'Skill enabled',
    skillId: 'Skill ID',
    skillName: 'Display name',
    skillSaved: 'Skill saved',
    status: 'Status',
    unknown: 'Unknown',
    updateSkill: 'Update skill',
  },
  zh: {
    actions: '操作',
    addCustomSkill: '添加自定义 Skill',
    agentRules: '全局 Agent 约束',
    agentRulesDescription: '类似 AGENTS.md 的全局指令，应用到所有项目。',
    cancel: '取消',
    content: '内容',
    customSkills: 'Agent Skill',
    disabled: '已禁用',
    disableSkill: '禁用 Skill',
    enabled: '已启用',
    enableSkill: '启用 Skill',
    globalInstructionsSaved: '全局 Agent 约束已保存',
    instructionEnabled: '启用这组约束',
    instructionName: '约束档案名',
    instructions: '约束内容',
    keywords: '关键词',
    loading: '正在加载 Agent 设置...',
    modelInvocable: '允许模型选择这个 Skill',
    name: '名称',
    noRequiredTools: '无工具依赖',
    noSkills: '尚未配置 Agent Skill',
    plugin: '插件',
    requiredTools: '所需工具',
    saveInstructions: '保存约束',
    saveSkill: '保存 Skill',
    savingInstructions: '正在保存约束...',
    savingSkill: '正在保存 Skill...',
    scope: '范围',
    skillDescription: '描述',
    skillDisabled: 'Skill 已禁用',
    skillEnabled: 'Skill 已启用',
    skillId: 'Skill ID',
    skillName: '显示名称',
    skillSaved: 'Skill 已保存',
    status: '状态',
    unknown: '未知',
    updateSkill: '更新 Skill',
  },
}

const GLOBAL_RULES_NAME = 'Global Agent Rules'
const SAFE_ERROR_MESSAGE = 'Agent settings request failed'

export function initAiAgentSettingsAdmin(root: HTMLElement): void {
  const csrfToken = root.dataset.csrfToken || ''
  const language = getAdminLanguage()
  const state: SettingsState = {
    config: null,
    loading: true,
    savingSkill: false,
    savingInstructions: false,
    activeAction: null,
    skillForm: emptySkillForm(),
    instructionForm: emptyInstructionForm(language),
    statusMessage: null,
    errorMessage: null,
  }

  function t(key: TranslationKey) {
    return TRANSLATIONS[language][key]
  }

  async function loadConfig({ silent = false } = {}) {
    if (!silent) {
      state.loading = true
      state.errorMessage = null
      render()
    }

    try {
      state.config = await requestJSON<AgentConfig>(
        '/admin/ai/agent/config',
        csrfToken
      )
      state.instructionForm = instructionFormFromConfig(
        state.config,
        state.instructionForm,
        language
      )
      state.loading = false
      render()
    } catch {
      showSafeError()
    }
  }

  async function saveConfig(
    body: {
      skills?: AgentSkill[]
      plugins?: AgentPlugin[]
      instructionProfiles?: AgentInstructionProfile[]
    },
    statusMessage: string
  ) {
    const response = await requestJSON<AgentConfig>(
      '/admin/ai/agent/settings',
      csrfToken,
      {
        method: 'PATCH',
        body,
      }
    )
    state.config = response
    state.instructionForm = instructionFormFromConfig(
      response,
      state.instructionForm,
      language
    )
    state.statusMessage = statusMessage
    state.errorMessage = null
    window.dispatchEvent(new CustomEvent('superpaper:ai-agent-config-changed'))
  }

  async function handleSkillSubmit(event: Event) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    state.savingSkill = true
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const nextSkill = skillFromForm(form, state.skillForm)
      const skills = upsertSkill(configSkills(), nextSkill)
      await saveConfig({ skills }, t('skillSaved'))
      state.skillForm = emptySkillForm()
    } catch {
      showSafeError()
    } finally {
      state.savingSkill = false
      render()
    }
  }

  async function handleSkillToggle(skillId: string) {
    const skill = configSkills().find(item => item.id === skillId)
    if (!skill) {
      return
    }
    state.activeAction = `skill:${skillId}`
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const skills = upsertSkill(configSkills(), {
        ...skill,
        enabled: skill.enabled === false,
      })
      await saveConfig(
        { skills },
        skill.enabled === false ? t('skillEnabled') : t('skillDisabled')
      )
    } catch {
      showSafeError()
    } finally {
      state.activeAction = null
      render()
    }
  }

  async function handleInstructionsSubmit(event: Event) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    state.savingInstructions = true
    state.statusMessage = null
    state.errorMessage = null
    render()

    try {
      const profile = instructionFromForm(form)
      const instructionProfiles = upsertInstructionProfile(
        configInstructionProfiles(),
        profile,
        state.instructionForm.editingName
      )
      await saveConfig({ instructionProfiles }, t('globalInstructionsSaved'))
      state.instructionForm = {
        editingName: profile.name,
        name: profile.name,
        content: profile.content || '',
        enabled: profile.enabled !== false,
      }
    } catch {
      showSafeError()
    } finally {
      state.savingInstructions = false
      render()
    }
  }

  function configSkills() {
    return state.config?.skills ?? []
  }

  function configPlugins() {
    return state.config?.plugins ?? []
  }

  function configInstructionProfiles() {
    return state.config?.instructionProfiles ?? []
  }

  function showSafeError() {
    state.loading = false
    state.savingSkill = false
    state.savingInstructions = false
    state.activeAction = null
    state.statusMessage = null
    state.errorMessage = SAFE_ERROR_MESSAGE
    render()
  }

  function render() {
    root.innerHTML = `
      <div class="ai-agent-settings-admin">
        <div class="ai-provider-admin-feedback">
          <div class="text-muted" role="status">${escapeHtml(
            state.loading ? t('loading') : statusText(state, t)
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
              <h4>${escapeHtml(t('agentRules'))}</h4>
              <p>${escapeHtml(t('agentRulesDescription'))}</p>
            </div>
          </div>
          ${renderInstructionForm(state, t)}
        </div>
        <div class="ai-admin-section">
          <div class="ai-admin-section-header">
            <div>
              <h4>${escapeHtml(t('customSkills'))}</h4>
              <p>${escapeHtml(t('agentRulesDescription'))}</p>
            </div>
          </div>
          ${renderSkillTable(configSkills(), state.loading, t)}
          ${state.config ? renderSkillForm(state, t) : ''}
        </div>
      </div>
    `

    root
      .querySelector<HTMLFormElement>('[data-ai-agent-instructions-form]')
      ?.addEventListener('submit', event => {
        void handleInstructionsSubmit(event)
      })

    root
      .querySelector<HTMLFormElement>('[data-ai-agent-skill-form]')
      ?.addEventListener('submit', event => {
        void handleSkillSubmit(event)
      })

    root
      .querySelector<HTMLButtonElement>('[data-ai-agent-skill-cancel]')
      ?.addEventListener('click', () => {
        state.skillForm = emptySkillForm()
        render()
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-agent-skill-edit]')
      .forEach(button => {
        button.addEventListener('click', () => {
          const skill = configSkills().find(item => item.id === button.dataset.skillId)
          if (skill) {
            state.skillForm = skillFormFromSkill(skill)
            render()
          }
        })
      })

    root
      .querySelectorAll<HTMLButtonElement>('[data-ai-agent-skill-toggle]')
      .forEach(button => {
        button.addEventListener('click', () => {
          void handleSkillToggle(button.dataset.skillId || '')
        })
      })
  }

  window.addEventListener('superpaper:ai-agent-config-changed', () => {
    void loadConfig({ silent: true })
  })

  render()
  void loadConfig()
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

function renderInstructionForm(
  state: SettingsState,
  t: (key: TranslationKey) => string
) {
  const form = state.instructionForm
  return `
    <form class="ai-admin-form" aria-label="${escapeHtml(
      t('agentRules')
    )}" data-ai-agent-instructions-form>
      <div class="ai-admin-form-grid">
        <div class="form-group">
          <label class="form-label" for="ai-agent-instruction-name">${escapeHtml(
            t('instructionName')
          )}</label>
          <input class="form-control" id="ai-agent-instruction-name" name="name" type="text" value="${escapeHtml(
            form.name
          )}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="ai-agent-instruction-enabled">${escapeHtml(
            t('status')
          )}</label>
          <label class="ai-admin-checkbox" for="ai-agent-instruction-enabled">
            <input id="ai-agent-instruction-enabled" name="enabled" type="checkbox" ${
              form.enabled ? 'checked' : ''
            }>
            <span>${escapeHtml(t('instructionEnabled'))}</span>
          </label>
        </div>
      </div>
      <div class="form-group ai-admin-form-wide">
        <label class="form-label" for="ai-agent-instruction-content">${escapeHtml(
          t('instructions')
        )}</label>
        <textarea class="form-control ai-admin-textarea" id="ai-agent-instruction-content" name="content" rows="10">${escapeHtml(
          form.content
        )}</textarea>
      </div>
      <div class="ai-admin-form-footer">
        <button class="btn btn-primary" type="submit" ${
          state.savingInstructions ? 'disabled' : ''
        }>${escapeHtml(
          state.savingInstructions ? t('savingInstructions') : t('saveInstructions')
        )}</button>
      </div>
    </form>
  `
}

function renderSkillTable(
  skills: AgentSkill[],
  loading: boolean,
  t: (key: TranslationKey) => string
) {
  if (loading) {
    return ''
  }
  if (skills.length === 0) {
    return `<p class="text-muted">${escapeHtml(t('noSkills'))}</p>`
  }
  return `
    <div class="ai-admin-table-wrap">
      <table class="table table-striped ai-admin-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('name'))}</th>
            <th>${escapeHtml(t('plugin'))}</th>
            <th>${escapeHtml(t('requiredTools'))}</th>
            <th>${escapeHtml(t('scope'))}</th>
            <th>${escapeHtml(t('status'))}</th>
            <th>${escapeHtml(t('actions'))}</th>
          </tr>
        </thead>
        <tbody>
          ${skills.map(skill => renderSkillRow(skill, t)).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderSkillRow(skill: AgentSkill, t: (key: TranslationKey) => string) {
  const escapedSkillId = escapeHtml(skill.id)
  const disabled = skill.pluginId ? 'disabled' : ''
  return `
    <tr>
      <td>
        <strong>${escapeHtml(skill.displayName || skill.name || skill.id)}</strong>
        <div class="ai-admin-row-subtitle">${escapeHtml(skill.id)}</div>
        <div class="ai-admin-row-subtitle">${escapeHtml(skill.description || '')}</div>
      </td>
      <td>${escapeHtml(skill.pluginId || t('unknown'))}</td>
      <td>${escapeHtml(skill.requiredTools.join(', ') || t('noRequiredTools'))}</td>
      <td>${escapeHtml(skill.scope || t('unknown'))}</td>
      <td>${renderStatusBadge(
        skill.enabled === false ? t('disabled') : t('enabled'),
        skill.enabled === false ? 'disabled' : 'enabled'
      )}</td>
      <td>
        <div class="ai-admin-actions">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-ai-agent-skill-edit
            data-skill-id="${escapedSkillId}"
            ${disabled}
          >
            ${escapeHtml(t('updateSkill'))}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            data-ai-agent-skill-toggle
            data-skill-id="${escapedSkillId}"
          >
            ${escapeHtml(skill.enabled === false ? t('enableSkill') : t('disableSkill'))}
          </button>
        </div>
      </td>
    </tr>
  `
}

function renderSkillForm(
  state: SettingsState,
  t: (key: TranslationKey) => string
) {
  const form = state.skillForm
  return `
    <form class="ai-admin-form ai-admin-nested-form" aria-label="${escapeHtml(
      form.editingSkillId ? t('updateSkill') : t('addCustomSkill')
    )}" data-ai-agent-skill-form>
      <h5>${escapeHtml(form.editingSkillId ? t('updateSkill') : t('addCustomSkill'))}</h5>
      <div class="ai-admin-form-grid">
        <div class="form-group">
          <label class="form-label" for="ai-agent-skill-id">${escapeHtml(
            t('skillId')
          )}</label>
          <input class="form-control" id="ai-agent-skill-id" name="id" type="text" value="${escapeHtml(
            form.id
          )}" ${form.editingSkillId ? 'readonly' : ''} required>
        </div>
        <div class="form-group">
          <label class="form-label" for="ai-agent-skill-name">${escapeHtml(
            t('skillName')
          )}</label>
          <input class="form-control" id="ai-agent-skill-name" name="displayName" type="text" value="${escapeHtml(
            form.displayName
          )}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="ai-agent-skill-description">${escapeHtml(
            t('skillDescription')
          )}</label>
          <input class="form-control" id="ai-agent-skill-description" name="description" type="text" value="${escapeHtml(
            form.description
          )}" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="ai-agent-skill-keywords">${escapeHtml(
            t('keywords')
          )}</label>
          <input class="form-control" id="ai-agent-skill-keywords" name="keywords" type="text" value="${escapeHtml(
            form.keywords
          )}">
        </div>
      </div>
      <div class="form-group ai-admin-form-wide">
        <label class="form-label" for="ai-agent-skill-tools">${escapeHtml(
          t('requiredTools')
        )}</label>
        <select class="form-control ai-admin-multiselect" id="ai-agent-skill-tools" name="requiredTools" multiple>
          ${(state.config?.tools ?? [])
            .map(tool =>
              `<option value="${escapeHtml(tool.name)}" ${
                form.requiredTools.includes(tool.name) ? 'selected' : ''
              }>${escapeHtml(tool.name)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="form-group ai-admin-form-wide">
        <label class="form-label" for="ai-agent-skill-content">${escapeHtml(
          t('content')
        )}</label>
        <textarea class="form-control ai-admin-textarea" id="ai-agent-skill-content" name="content" rows="8" required>${escapeHtml(
          form.content
        )}</textarea>
      </div>
      <div class="ai-admin-form-footer">
        <div class="ai-admin-form-footer-options">
          <label class="ai-admin-checkbox" for="ai-agent-skill-enabled">
            <input id="ai-agent-skill-enabled" name="enabled" type="checkbox" ${
              form.enabled ? 'checked' : ''
            }>
            <span>${escapeHtml(t('enabled'))}</span>
          </label>
          <label class="ai-admin-checkbox" for="ai-agent-skill-model-invocable">
            <input id="ai-agent-skill-model-invocable" name="modelInvocable" type="checkbox" ${
              form.modelInvocable ? 'checked' : ''
            }>
            <span>${escapeHtml(t('modelInvocable'))}</span>
          </label>
        </div>
        <div class="ai-admin-actions">
          ${
            form.editingSkillId
              ? `<button class="btn btn-secondary" type="button" data-ai-agent-skill-cancel>${escapeHtml(
                  t('cancel')
                )}</button>`
              : ''
          }
          <button class="btn btn-primary" type="submit" ${
            state.savingSkill ? 'disabled' : ''
          }>${escapeHtml(state.savingSkill ? t('savingSkill') : t('saveSkill'))}</button>
        </div>
      </div>
    </form>
  `
}

function skillFromForm(
  form: HTMLFormElement,
  currentForm: SkillFormState
): AgentSkill {
  return {
    id: getFormInput(form, 'id').value.trim(),
    name: getFormInput(form, 'id').value.trim(),
    displayName: getFormInput(form, 'displayName').value.trim(),
    description: getFormInput(form, 'description').value.trim(),
    keywords: splitList(getFormInput(form, 'keywords').value),
    requiredTools: getSelectedOptions(form, 'requiredTools'),
    content: getTextArea(form, 'content').value,
    enabled: getCheckboxInput(form, 'enabled').checked,
    modelInvocable: getCheckboxInput(form, 'modelInvocable').checked,
    scope: 'global',
    pluginId: currentForm.pluginId,
  }
}

function instructionFromForm(form: HTMLFormElement): AgentInstructionProfile {
  return {
    id: getFormInput(form, 'name').value.trim(),
    scope: 'global',
    projectId: null,
    name: getFormInput(form, 'name').value.trim(),
    content: getTextArea(form, 'content').value,
    enabled: getCheckboxInput(form, 'enabled').checked,
    createdAt: null,
    updatedAt: null,
  }
}

function upsertSkill(skills: AgentSkill[], nextSkill: AgentSkill) {
  const filtered = skills.filter(skill => skill.id !== nextSkill.id)
  return [...filtered, nextSkill].sort((left, right) =>
    left.id.localeCompare(right.id)
  )
}

function upsertInstructionProfile(
  profiles: AgentInstructionProfile[],
  nextProfile: AgentInstructionProfile,
  previousName: string | null
) {
  const filtered = profiles.filter(
    profile => profile.name !== nextProfile.name && profile.name !== previousName
  )
  const previousProfile =
    previousName && previousName !== nextProfile.name
      ? profiles.find(profile => profile.name === previousName)
      : null
  const disabledPreviousProfile = previousProfile
    ? { ...previousProfile, enabled: false }
    : null
  return [
    ...filtered,
    ...(disabledPreviousProfile ? [disabledPreviousProfile] : []),
    nextProfile,
  ].sort((left, right) =>
    left.name.localeCompare(right.name)
  )
}

function instructionFormFromConfig(
  config: AgentConfig,
  currentForm: InstructionFormState,
  language: AdminLanguage
): InstructionFormState {
  const globalProfiles = (config.instructionProfiles ?? []).filter(
    profile => profile.scope === 'global'
  )
  const selected =
    globalProfiles.find(profile => profile.name === currentForm.editingName) ??
    globalProfiles.find(profile => profile.name === GLOBAL_RULES_NAME) ??
    globalProfiles[0]

  if (!selected) {
    return currentForm.editingName ? currentForm : emptyInstructionForm(language)
  }
  return {
    editingName: selected.name,
    name: selected.name,
    content: selected.content || '',
    enabled: selected.enabled !== false,
  }
}

function skillFormFromSkill(skill: AgentSkill): SkillFormState {
  return {
    editingSkillId: skill.id,
    id: skill.id,
    displayName: skill.displayName || skill.name || skill.id,
    description: skill.description || '',
    keywords: (skill.keywords ?? []).join(', '),
    requiredTools: skill.requiredTools ?? [],
    content: skill.content || '',
    enabled: skill.enabled !== false,
    modelInvocable: skill.modelInvocable !== false,
    pluginId: skill.pluginId || null,
  }
}

function emptySkillForm(): SkillFormState {
  return {
    editingSkillId: null,
    id: '',
    displayName: '',
    description: '',
    keywords: '',
    requiredTools: [],
    content: '',
    enabled: true,
    modelInvocable: true,
    pluginId: null,
  }
}

function emptyInstructionForm(language: AdminLanguage): InstructionFormState {
  return {
    editingName: null,
    name: GLOBAL_RULES_NAME,
    content:
      language === 'zh'
        ? '# 全局 Agent 约束\n\n- 不要泄露密钥、Token、Cookie 或内部配置。\n- 修改项目文件必须先给出补丁预览，等待用户确认。\n'
        : '# Global Agent Rules\n\n- Never expose secrets, tokens, cookies, or internal configuration.\n- Project file edits must be proposed as a patch before user approval.\n',
    enabled: true,
  }
}

function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function getSelectedOptions(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLSelectElement)) {
    throw new Error(`Missing select: ${name}`)
  }
  return Array.from(input.selectedOptions).map(option => option.value)
}

function getFormInput(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${name}`)
  }
  return input
}

function getTextArea(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing textarea: ${name}`)
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

function statusText(
  state: SettingsState,
  t: (key: TranslationKey) => string
) {
  if (state.savingInstructions) {
    return t('savingInstructions')
  }
  if (state.savingSkill) {
    return t('savingSkill')
  }
  return state.statusMessage || ''
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
