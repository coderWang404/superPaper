import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Alert, Form } from 'react-bootstrap'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import { useProjectContext } from '@/shared/context/project-context'
import { usePermissionsContext } from '@/features/ide-react/context/permissions-context'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormCheckbox from '@/shared/components/ol/ol-form-checkbox'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import OLSpinner from '@/shared/components/ol/ol-spinner'
import MaterialIcon from '@/shared/components/material-icon'
import {
  getEditableProjectAiAgentConfig,
  installProjectAiAgentPlugin,
  listProjectAiAgentPlugins,
  previewProjectAiAgentPlugin,
  previewProjectAiAgentSkillImport,
  setProjectAiAgentPluginEnabled,
  updateProjectAiAgentSettings,
  uploadProjectAiAgentPluginZip,
  type AiAgentInstructionProfile,
  type AiAgentPluginInstallation,
  type AiAgentPluginPreview,
  type AiAgentPluginSource,
  type AiAgentSkill,
  type AiAgentSkillImportSource,
  type ProjectAiAgentConfig,
} from '@/features/ai-agent/api'

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

type PluginSourceState = {
  kind: 'github' | 'zip_url' | 'local_directory' | 'uploaded_zip'
  value: string
  uploadId?: string
  originalName?: string
}

type AgentSettingsTab = 'rules' | 'skills' | 'plugins'

const PROJECT_RULES_NAME = 'Project Agent Rules'
const DEFAULT_RULES = `# Project Agent Rules

- Never expose secrets, tokens, cookies, or internal configuration.
- Project file edits must be proposed as a patch before user approval.
`
const DEFAULT_SKILL_MARKDOWN = `---
name: custom-skill
description: Describe the concrete task and when the Agent should use this Skill.
---

# Custom Skill

Use this Skill when the user asks for this workflow.

## Instructions

1. Inspect the relevant project context first.
2. Keep the response focused on the requested task.
3. Propose file edits as a patch for user review.
`

export default function AgentSettingsPanel() {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const permissions = usePermissionsContext()
  const canAdminProject = permissions.admin
  const [config, setConfig] = useState<ProjectAiAgentConfig | null>(null)
  const [plugins, setPlugins] = useState<AiAgentPluginInstallation[]>([])
  const [preview, setPreview] = useState<AiAgentPluginPreview | null>(null)
  const [pluginSource, setPluginSource] = useState<PluginSourceState>({
    kind: 'github',
    value: '',
  })
  const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm)
  const [instructionForm, setInstructionForm] =
    useState<InstructionFormState>(emptyInstructionForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pluginBusy, setPluginBusy] = useState(false)
  const [skillImportBusy, setSkillImportBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [activeTab, setActiveTab] = useState<AgentSettingsTab>('skills')
  const [skillEditorVisible, setSkillEditorVisible] = useState(false)
  const [skillImportUrl, setSkillImportUrl] = useState('')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [nextConfig, nextPlugins] = await Promise.all([
        getEditableProjectAiAgentConfig(projectId),
        listProjectAiAgentPlugins(projectId),
      ])
      setConfig(nextConfig)
      setPlugins(nextPlugins.plugins)
      setInstructionForm(current =>
        instructionFormFromConfig(nextConfig, current)
      )
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setLoading(false)
    }
  }, [projectId, t])

  useEffect(() => {
    reload()
  }, [reload])

  const projectSkills = useMemo(
    () => config?.skills.filter(skill => skill.scope !== 'builtin') ?? [],
    [config?.skills]
  )
  const builtinSkills = useMemo(
    () => config?.skills.filter(skill => skill.scope === 'builtin') ?? [],
    [config?.skills]
  )

  async function saveConfig(
    body: {
      skills?: AiAgentSkill[]
      plugins?: ProjectAiAgentConfig['plugins']
      instructionProfiles?: AiAgentInstructionProfile[]
    },
    message: string
  ) {
    setSaving(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const nextConfig = await updateProjectAiAgentSettings(projectId, body)
      setConfig(nextConfig)
      setInstructionForm(current =>
        instructionFormFromConfig(nextConfig, current)
      )
      setStatusMessage(message)
      window.dispatchEvent(new CustomEvent('superpaper:ai-agent-config-changed'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setSaving(false)
    }
  }

  async function handleRulesSubmit(event: FormEvent) {
    event.preventDefault()
    const nextProfile: AiAgentInstructionProfile = {
      id: instructionForm.name,
      scope: 'project',
      projectId,
      name: instructionForm.name.trim(),
      content: instructionForm.content,
      enabled: instructionForm.enabled,
      createdAt: null,
      updatedAt: null,
    }
    const instructionProfiles = upsertInstructionProfile(
      config?.instructionProfiles ?? [],
      nextProfile,
      instructionForm.editingName
    )
    await saveConfig(
      { instructionProfiles },
      t('agent_settings_rules_saved')
    )
  }

  async function handleSkillSubmit(event: FormEvent) {
    event.preventDefault()
    const validationError = validateSkillForm(skillForm, t)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }
    const nextSkill = skillFromForm(skillForm)
    const skills = upsertSkill(config?.skills ?? [], nextSkill)
    await saveConfig({ skills }, t('agent_settings_skill_saved'))
    setSkillForm(emptySkillForm())
    setSkillEditorVisible(false)
  }

  async function handleSkillImportSubmit(event?: FormEvent) {
    event?.preventDefault()
    const source = skillSourceFromText(skillImportUrl)
    if (!source) {
      setErrorMessage(t('agent_settings_skill_url_required'))
      return
    }
    await previewSkillImportSource(source)
  }

  async function toggleSkill(skill: AiAgentSkill) {
    const skills = upsertSkill(config?.skills ?? [], {
      ...skill,
      enabled: skill.enabled === false,
      scope: 'project',
    })
    await saveConfig(
      { skills },
      skill.enabled === false
        ? t('agent_settings_skill_enabled')
        : t('agent_settings_skill_disabled')
    )
  }

  async function handlePluginPreview(event?: FormEvent) {
    event?.preventDefault()
    const source = sourceFromState(pluginSource)
    if (!source) {
      setErrorMessage(t('agent_settings_plugin_source_required'))
      return
    }
    setPluginBusy(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const response = await previewProjectAiAgentPlugin(projectId, source)
      setPreview(response.preview)
      setPluginSource(sourceStateFromSource(source))
      setStatusMessage(t('agent_settings_plugin_preview_ready'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setPluginBusy(false)
    }
  }

  async function handlePluginInstall() {
    const source = sourceFromState(pluginSource)
    if (!source || !preview) {
      return
    }
    setPluginBusy(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const response = await installProjectAiAgentPlugin(projectId, {
        ...source,
        enabled: true,
      })
      setConfig(response.config)
      setPlugins(current => upsertPluginInstallation(current, response.plugin))
      setPreview(null)
      setStatusMessage(t('agent_settings_plugin_installed'))
      window.dispatchEvent(new CustomEvent('superpaper:ai-agent-config-changed'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setPluginBusy(false)
    }
  }

  async function handlePluginToggle(plugin: AiAgentPluginInstallation) {
    setPluginBusy(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const response = await setProjectAiAgentPluginEnabled(
        projectId,
        plugin.pluginId,
        !plugin.enabled
      )
      setConfig(response.config)
      setPlugins(current => upsertPluginInstallation(current, response.plugin))
      setStatusMessage(
        response.plugin.enabled
          ? t('agent_settings_plugin_enabled')
          : t('agent_settings_plugin_disabled')
      )
      window.dispatchEvent(new CustomEvent('superpaper:ai-agent-config-changed'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setPluginBusy(false)
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (!canAdminProject) {
      return
    }
    const files = Array.from(event.dataTransfer.files || [])
    const text = event.dataTransfer.getData('text/uri-list') ||
      event.dataTransfer.getData('text/plain')

    if (files.length > 0) {
      await handleDroppedFile(files[0])
      return
    }
    const detectedSource = sourceFromText(text)
    const detectedSkillSource = skillSourceFromText(text)
    if (detectedSkillSource) {
      await previewSkillImportSource(detectedSkillSource)
      return
    }
    if (detectedSource) {
      setActiveTab('plugins')
      setPluginSource(sourceStateFromSource(detectedSource))
      await previewSource(detectedSource)
    }
  }

  async function handleDroppedFile(file: File) {
    setPluginBusy(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      if (isZipFile(file)) {
        const response = await uploadProjectAiAgentPluginZip(projectId, file)
        setActiveTab('plugins')
        setPreview(response.preview)
        setPluginSource({
          kind: 'uploaded_zip',
          value: response.originalName,
          uploadId: response.uploadId,
          originalName: response.originalName,
        })
        setStatusMessage(t('agent_settings_plugin_zip_uploaded'))
        return
      }
      const text = await readFileText(file)
      const nextForm = skillFormFromDroppedText(text, file.name)
      setSkillForm(nextForm)
      setSkillEditorVisible(true)
      setActiveTab('skills')
      setStatusMessage(t('agent_settings_skill_file_recognized'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setPluginBusy(false)
    }
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !canAdminProject) {
      return
    }
    await handleDroppedFile(file)
  }

  async function previewSource(source: AiAgentPluginSource) {
    setPluginBusy(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const response = await previewProjectAiAgentPlugin(projectId, source)
      setPreview(response.preview)
      setStatusMessage(t('agent_settings_plugin_preview_ready'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setPluginBusy(false)
    }
  }

  async function previewSkillImportSource(source: AiAgentSkillImportSource) {
    setSkillImportBusy(true)
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const response = await previewProjectAiAgentSkillImport(projectId, source)
      setSkillForm(
        skillFormFromDroppedText(
          response.preview.content,
          response.preview.source.path || 'SKILL.md'
        )
      )
      setSkillEditorVisible(true)
      setActiveTab('skills')
      setSkillImportUrl(response.preview.source.url)
      setStatusMessage(t('agent_settings_skill_url_imported'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setSkillImportBusy(false)
    }
  }

  return (
    <div className="agent-settings-panel">
      <RailPanelHeader title={t('agent_settings')} />
      <div
        className={`agent-settings-body ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={event => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => {
          if (event.currentTarget === event.target) {
            setDragActive(false)
          }
        }}
        onDrop={handleDrop}
      >
        {loading && (
          <div className="agent-settings-loading" role="status">
            <OLSpinner />
            <span>{t('agent_settings_loading')}</span>
          </div>
        )}

        {!loading && (
          <>
            {config && (
              <>
                {!canAdminProject && (
                  <Alert variant="warning">
                    {t('agent_settings_view_only')}
                  </Alert>
                )}
                {statusMessage && (
                  <Alert variant="success" role="status">
                    {statusMessage}
                  </Alert>
                )}
                {errorMessage && (
                  <Alert variant="danger" role="alert">
                    {errorMessage}
                  </Alert>
                )}
                <div className="agent-settings-hero">
                  <div>
                    <h5>{t('agent_settings_workspace_title')}</h5>
                    <p>{t('agent_settings_workspace_description')}</p>
                  </div>
                  <DropZone
                    active={dragActive}
                    disabled={!canAdminProject || pluginBusy || skillImportBusy}
                    fileInputRef={fileInputRef}
                    t={t}
                    onFileInput={handleFileInput}
                  />
                </div>
                <AgentSettingsTabs
                  activeTab={activeTab}
                  skillCount={config.skills.length}
                  pluginCount={plugins.length}
                  t={t}
                  onChange={setActiveTab}
                />
                {activeTab === 'rules' && (
                  <RulesSection
                    t={t}
                    form={instructionForm}
                    disabled={!canAdminProject || saving}
                    saving={saving}
                    onChange={setInstructionForm}
                    onSubmit={handleRulesSubmit}
                  />
                )}
                {activeTab === 'skills' && (
                  <SkillsSection
                    t={t}
                    skills={projectSkills}
                    builtinSkills={builtinSkills}
                    form={skillForm}
                    editorVisible={skillEditorVisible}
                    importUrl={skillImportUrl}
                    importBusy={skillImportBusy}
                    disabled={!canAdminProject || saving}
                    saving={saving}
                    onFormChange={setSkillForm}
                    onImportUrlChange={setSkillImportUrl}
                    onImportUrlSubmit={handleSkillImportSubmit}
                    onSubmit={handleSkillSubmit}
                    onCreateNew={() => {
                      setSkillForm(
                        skillFormFromDroppedText(
                          DEFAULT_SKILL_MARKDOWN,
                          'SKILL.md'
                        )
                      )
                      setSkillEditorVisible(true)
                      setActiveTab('skills')
                    }}
                    onEdit={skill => {
                      setSkillForm(skillFormFromSkill(skill))
                      setSkillEditorVisible(true)
                    }}
                    onCancel={() => {
                      setSkillForm(emptySkillForm())
                      setSkillEditorVisible(false)
                    }}
                    onToggle={toggleSkill}
                  />
                )}
                {activeTab === 'plugins' && (
                  <PluginsSection
                    t={t}
                    plugins={plugins}
                    preview={preview}
                    source={pluginSource}
                    busy={pluginBusy}
                    disabled={!canAdminProject || pluginBusy}
                    onSourceChange={setPluginSource}
                    onPreview={handlePluginPreview}
                    onInstall={handlePluginInstall}
                    onToggle={handlePluginToggle}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AgentSettingsTabs({
  activeTab,
  skillCount,
  pluginCount,
  t,
  onChange,
}: {
  activeTab: AgentSettingsTab
  skillCount: number
  pluginCount: number
  t: ReturnType<typeof useTranslation>['t']
  onChange: (tab: AgentSettingsTab) => void
}) {
  const tabs: Array<{
    id: AgentSettingsTab
    label: string
    count?: number
  }> = [
    {
      id: 'skills',
      label: t('agent_settings_tab_skills'),
      count: skillCount,
    },
    {
      id: 'plugins',
      label: t('agent_settings_tab_plugins'),
      count: pluginCount,
    },
    { id: 'rules', label: t('agent_settings_tab_rules') },
  ]
  return (
    <div
      className="agent-settings-tabs"
      role="tablist"
      aria-label={t('agent_settings')}
    >
      {tabs.map(tab => (
        <button
          type="button"
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={
            typeof tab.count === 'number'
              ? `${tab.label} ${tab.count}`
              : tab.label
          }
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {typeof tab.count === 'number' && <em>{tab.count}</em>}
        </button>
      ))}
    </div>
  )
}

function DropZone({
  active,
  disabled,
  fileInputRef,
  t,
  onFileInput,
}: {
  active: boolean
  disabled: boolean
  fileInputRef: RefObject<HTMLInputElement>
  t: ReturnType<typeof useTranslation>['t']
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className={`agent-settings-dropzone ${active ? 'active' : ''}`}>
      <div>
        <strong>{t('agent_settings_dropzone_title')}</strong>
        <span>{t('agent_settings_dropzone_description')}</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="visually-hidden"
        accept=".md,.markdown,.zip,application/zip,text/markdown,text/plain"
        disabled={disabled}
        onChange={onFileInput}
        aria-label={t('agent_settings_choose_file')}
      />
      <OLButton
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => fileInputRef.current?.click()}
      >
        {t('agent_settings_choose_file')}
      </OLButton>
    </div>
  )
}

function RulesSection({
  t,
  form,
  disabled,
  saving,
  onChange,
  onSubmit,
}: {
  t: ReturnType<typeof useTranslation>['t']
  form: InstructionFormState
  disabled: boolean
  saving: boolean
  onChange: (form: InstructionFormState) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <section className="agent-settings-section">
      <div className="agent-settings-section-header">
        <h5>{t('agent_settings_project_rules')}</h5>
        <p>{t('agent_settings_project_rules_description')}</p>
      </div>
      <Form
        className="agent-settings-rule-editor"
        onSubmit={onSubmit}
        aria-label={t('agent_settings_project_rules_form')}
      >
        <Form.Group className="agent-settings-field" controlId="agent-rules-name">
          <Form.Label>{t('agent_settings_profile_name')}</Form.Label>
          <OLFormControl
            value={form.name}
            disabled={disabled}
            onChange={event =>
              onChange({ ...form, name: event.currentTarget.value })
            }
          />
        </Form.Group>
        <Form.Group
          className="agent-settings-field"
          controlId="agent-rules-content"
        >
          <Form.Label>{t('agent_settings_rules_content')}</Form.Label>
          <Form.Control
            as="textarea"
            rows={9}
            value={form.content}
            disabled={disabled}
            spellCheck={false}
            onChange={event =>
              onChange({ ...form, content: event.currentTarget.value })
            }
          />
        </Form.Group>
        <div className="agent-settings-form-footer">
          <OLFormCheckbox
            id="agent-rules-enabled"
            label={t('agent_settings_enable_rules')}
            checked={form.enabled}
            disabled={disabled}
            onChange={event =>
              onChange({ ...form, enabled: event.currentTarget.checked })
            }
          />
          <OLButton
            type="submit"
            variant="primary"
            disabled={disabled}
            isLoading={saving}
            loadingLabel={t('saving')}
          >
            {t('agent_settings_save_rules')}
          </OLButton>
        </div>
      </Form>
    </section>
  )
}

function SkillsSection({
  t,
  skills,
  builtinSkills,
  form,
  editorVisible,
  importUrl,
  importBusy,
  disabled,
  saving,
  onFormChange,
  onImportUrlChange,
  onImportUrlSubmit,
  onSubmit,
  onCreateNew,
  onEdit,
  onCancel,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  skills: AiAgentSkill[]
  builtinSkills: AiAgentSkill[]
  form: SkillFormState
  editorVisible: boolean
  importUrl: string
  importBusy: boolean
  disabled: boolean
  saving: boolean
  onFormChange: (form: SkillFormState) => void
  onImportUrlChange: (value: string) => void
  onImportUrlSubmit: (event: FormEvent) => void
  onSubmit: (event: FormEvent) => void
  onCreateNew: () => void
  onEdit: (skill: AiAgentSkill) => void
  onCancel: () => void
  onToggle: (skill: AiAgentSkill) => void
}) {
  const customSkills = skills.filter(skill => !skill.pluginId)
  const pluginSkills = skills.filter(skill => Boolean(skill.pluginId))
  const allSkills = [...customSkills, ...pluginSkills, ...builtinSkills]
  const selectedSkill = allSkills.find(skill => skill.id === form.editingSkillId)
  const enabledCount = allSkills.filter(skill => skill.enabled !== false).length
  const hasDraft = Boolean(
    editorVisible ||
    form.editingSkillId ||
      form.content.trim() ||
      form.displayName.trim() ||
      form.description.trim() ||
      form.id.trim()
  )
  return (
    <section className="agent-settings-section agent-settings-workbench">
      <div className="agent-settings-section-header">
        <h5>{t('agent_settings_project_skills')}</h5>
        <p>{t('agent_settings_project_skills_description')}</p>
      </div>
      <div className="agent-settings-split-view">
        <aside className="agent-settings-sidebar-list">
          <div className="agent-settings-sidebar-toolbar">
            <div>
              <strong>{t('agent_settings_skill_library')}</strong>
              <span>
                {t('agent_settings_skills_enabled_summary', {
                  enabled: enabledCount,
                  total: allSkills.length,
                })}
              </span>
            </div>
            <OLButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={onCreateNew}
            >
              {t('agent_settings_new_skill')}
            </OLButton>
          </div>
          <form
            className="agent-settings-skill-import"
            onSubmit={onImportUrlSubmit}
            aria-label={t('agent_settings_skill_url_import_form')}
          >
            <div>
              <strong>{t('agent_settings_import_skill_url')}</strong>
              <span>{t('agent_settings_import_skill_url_description')}</span>
            </div>
            <div className="agent-settings-inline-control">
              <OLFormControl
                value={importUrl}
                disabled={disabled || importBusy}
                aria-label={t('agent_settings_skill_url')}
                placeholder="https://github.com/org/repo/blob/main/skills/name/SKILL.md"
                onChange={event =>
                  onImportUrlChange(event.currentTarget.value)
                }
              />
              <OLButton
                type="submit"
                variant="secondary"
                size="sm"
                disabled={disabled || importBusy || !importUrl.trim()}
                isLoading={importBusy}
                loadingLabel={t('agent_settings_importing')}
              >
                {t('agent_settings_import_skill')}
              </OLButton>
            </div>
          </form>
          <SkillGroup
            t={t}
            title={t('agent_settings_custom_skills')}
            empty={t('agent_settings_no_project_skills')}
            skills={customSkills}
            selectedSkillId={form.editingSkillId}
            disabled={disabled}
            onEdit={onEdit}
            onToggle={onToggle}
          />
          <SkillGroup
            t={t}
            title={t('agent_settings_plugin_skills')}
            empty={t('agent_settings_no_plugin_skills')}
            skills={pluginSkills}
            selectedSkillId={form.editingSkillId}
            disabled={disabled}
            onEdit={onEdit}
            onToggle={onToggle}
          />
          <SkillGroup
            t={t}
            title={t('agent_settings_builtin_skills')}
            empty={t('agent_settings_no_builtin_skills')}
            skills={builtinSkills}
            selectedSkillId={form.editingSkillId}
            disabled={disabled}
            onEdit={onEdit}
            onToggle={onToggle}
          />
        </aside>
        <div className="agent-settings-editor-pane">
          {hasDraft ? (
            <SkillForm
              t={t}
              form={form}
              selectedSkill={selectedSkill ?? null}
              disabled={disabled}
              saving={saving}
              onChange={onFormChange}
              onSubmit={onSubmit}
              onCancel={onCancel}
            />
          ) : (
            <div className="agent-settings-empty-state">
              <strong>{t('agent_settings_skill_editor_empty_title')}</strong>
              <span>{t('agent_settings_skill_editor_empty')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function SkillGroup({
  t,
  title,
  empty,
  skills,
  selectedSkillId,
  disabled,
  onEdit,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  title: string
  empty: string
  skills: AiAgentSkill[]
  selectedSkillId: string | null
  disabled: boolean
  onEdit: (skill: AiAgentSkill) => void
  onToggle: (skill: AiAgentSkill) => void
}) {
  return (
    <div className="agent-settings-skill-group">
      <div className="agent-settings-skill-group-title">{title}</div>
      {skills.length === 0 ? (
        <p className="agent-settings-muted">{empty}</p>
      ) : (
        <div className="agent-settings-skill-list">
          {skills.map(skill => (
            <SkillRow
              t={t}
              key={skill.id}
              skill={skill}
              selected={selectedSkillId === skill.id}
              disabled={disabled}
              onEdit={onEdit}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SkillRow({
  t,
  skill,
  selected,
  disabled,
  onEdit,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  skill: AiAgentSkill
  selected: boolean
  disabled: boolean
  onEdit: (skill: AiAgentSkill) => void
  onToggle: (skill: AiAgentSkill) => void
}) {
  const sourceLabel = skillSourceLabel(skill, t)
  return (
    <div className={`agent-settings-skill-row ${selected ? 'selected' : ''}`}>
      <button
        type="button"
        className="agent-settings-skill-open"
        disabled={disabled && !skill.content}
        onClick={() => onEdit(skill)}
      >
        <span className="agent-settings-file-icon" aria-hidden="true">
          <MaterialIcon type="description" />
        </span>
        <span className="agent-settings-skill-copy">
          <strong>{skill.displayName || skill.name || skill.id}</strong>
          <span>{skill.description || skill.id}</span>
        </span>
      </button>
      <div className="agent-settings-skill-meta">
        <span className="agent-settings-source">{sourceLabel}</span>
        <label className="agent-settings-switch">
          <input
            type="checkbox"
            checked={skill.enabled !== false}
            disabled={disabled}
            onChange={() => onToggle(skill)}
            aria-label={`${skill.displayName || skill.id} ${t('enabled')}`}
          />
          <span />
        </label>
      </div>
    </div>
  )
}

function SkillForm({
  t,
  form,
  selectedSkill,
  disabled,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: {
  t: ReturnType<typeof useTranslation>['t']
  form: SkillFormState
  selectedSkill: AiAgentSkill | null
  disabled: boolean
  saving: boolean
  onChange: (form: SkillFormState) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  const preview = skillPreviewFromForm(form)
  const parsed = parseSkillMarkdown(form.content)
  const hasValidFrontmatter = Boolean(preview.id && preview.description)
  const invalidName = Boolean(
    preview.id && !isSafeSkillName(preview.id)
  )
  const readOnlyPluginSkill = Boolean(form.pluginId)
  const metadataRows = [
    [
      t('agent_settings_skill_preview_name'),
      preview.id || t('agent_settings_skill_preview_missing_name'),
    ],
    [
      t('description'),
      preview.description || t('agent_settings_skill_preview_missing_description'),
    ],
    [
      t('agent_settings_skill_source'),
      selectedSkill ? skillSourceLabel(selectedSkill, t) : 'SKILL.md',
    ],
    [
      t('agent_settings_required_tools'),
      form.requiredTools.join(', ') || t('agent_settings_no_required_tools'),
    ],
  ]

  return (
    <Form
      className="agent-settings-skill-editor"
      onSubmit={onSubmit}
      aria-label={
        form.editingSkillId
          ? t('agent_settings_edit_skill_form')
          : t('agent_settings_add_skill_form')
      }
    >
      <div className="agent-settings-editor-header">
        <div>
          <h6>
            {preview.displayName ||
              preview.id ||
              (form.editingSkillId
                ? t('agent_settings_edit_skill')
                : t('agent_settings_add_skill'))}
          </h6>
          <p>{t('agent_settings_skill_editor_description')}</p>
        </div>
        <div className="agent-settings-actions">
          <OLButton type="button" variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </OLButton>
          <OLButton
            type="submit"
            variant="primary"
            disabled={
              disabled ||
              readOnlyPluginSkill ||
              !hasValidFrontmatter ||
              invalidName
            }
            isLoading={saving}
            loadingLabel={t('saving')}
          >
            {t('agent_settings_save_skill')}
          </OLButton>
        </div>
      </div>
      <div className="agent-settings-skill-summary">
        {metadataRows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {!hasValidFrontmatter && (
        <Alert variant="warning" className="agent-settings-inline-alert">
          {t('agent_settings_skill_frontmatter_required')}
        </Alert>
      )}
      {invalidName && (
        <Alert variant="warning" className="agent-settings-inline-alert">
          {t('agent_settings_skill_name_invalid')}
        </Alert>
      )}
      {readOnlyPluginSkill && (
        <Alert variant="info" className="agent-settings-inline-alert">
          {t('agent_settings_plugin_skill_readonly')}
        </Alert>
      )}
      <Form.Group
        className="agent-settings-field agent-settings-markdown-field"
        controlId="agent-skill-content"
      >
        <Form.Label>{t('agent_settings_skill_markdown')}</Form.Label>
        <Form.Control
          as="textarea"
          rows={18}
          value={form.content}
          disabled={disabled || readOnlyPluginSkill}
          spellCheck={false}
          required
          onChange={event =>
            onChange({
              ...form,
              content: event.currentTarget.value,
              ...metadataFromSkillMarkdown(event.currentTarget.value, form),
            })
          }
        />
      </Form.Group>
      <div className="agent-settings-form-footer">
        <div className="agent-settings-checkboxes">
          <OLFormCheckbox
            id="agent-skill-enabled"
            label={t('enabled')}
            checked={form.enabled}
            disabled={disabled}
            onChange={event =>
              onChange({ ...form, enabled: event.currentTarget.checked })
            }
          />
          <OLFormCheckbox
            id="agent-skill-model-invocable"
            label={t('agent_settings_model_can_choose_skill')}
            checked={form.modelInvocable}
            disabled={disabled || readOnlyPluginSkill}
            onChange={event =>
              onChange({ ...form, modelInvocable: event.currentTarget.checked })
            }
          />
        </div>
      </div>
      <details className="agent-settings-advanced">
        <summary>{t('agent_settings_parsed_metadata')}</summary>
        <p>{t('agent_settings_parsed_metadata_description')}</p>
        <dl className="agent-settings-metadata-list">
          <div>
            <dt>{t('agent_settings_skill_id')}</dt>
            <dd>{form.id || parsed.name || t('agent_settings_none')}</dd>
          </div>
          <div>
            <dt>{t('agent_settings_keywords')}</dt>
            <dd>{form.keywords || t('agent_settings_none')}</dd>
          </div>
          <div>
            <dt>{t('agent_settings_required_tools')}</dt>
            <dd>
              {form.requiredTools.join(', ') ||
                t('agent_settings_no_required_tools')}
            </dd>
          </div>
        </dl>
        <div className="agent-settings-grid agent-settings-compat-fields">
          <Form.Group
            className="agent-settings-field"
            controlId="agent-skill-display-name"
          >
            <Form.Label>{t('agent_settings_display_name')}</Form.Label>
            <OLFormControl
              value={form.displayName}
              disabled={disabled || readOnlyPluginSkill}
              placeholder="Literature Review"
              onChange={event =>
                onChange({ ...form, displayName: event.currentTarget.value })
              }
            />
          </Form.Group>
          <Form.Group
            className="agent-settings-field"
            controlId="agent-skill-id"
          >
            <Form.Label>{t('agent_settings_skill_id')}</Form.Label>
            <OLFormControl
              value={form.id}
              disabled={
                disabled || readOnlyPluginSkill || Boolean(form.editingSkillId)
              }
              required
              onChange={event =>
                onChange({ ...form, id: event.currentTarget.value })
              }
            />
          </Form.Group>
          <Form.Group
            className="agent-settings-field"
            controlId="agent-skill-keywords"
          >
            <Form.Label>{t('agent_settings_keywords')}</Form.Label>
            <OLFormControl
              value={form.keywords}
              disabled={disabled || readOnlyPluginSkill}
              onChange={event =>
                onChange({ ...form, keywords: event.currentTarget.value })
              }
            />
          </Form.Group>
        </div>
        <Form.Group
          className="agent-settings-field"
          controlId="agent-skill-tools"
        >
          <Form.Label>{t('agent_settings_required_tools')}</Form.Label>
          <OLFormSelect
            multiple
            value={form.requiredTools}
            disabled={disabled || readOnlyPluginSkill}
            onChange={event =>
              onChange({
                ...form,
                requiredTools: Array.from(
                  event.currentTarget.selectedOptions
                ).map(option => option.value),
              })
            }
          >
            {selectedSkillRequiredTools(selectedSkill, form).map(toolName => (
              <option key={toolName} value={toolName}>
                {toolName}
              </option>
            ))}
          </OLFormSelect>
        </Form.Group>
      </details>
    </Form>
  )
}

function selectedSkillRequiredTools(
  selectedSkill: AiAgentSkill | null,
  form: SkillFormState
) {
  const tools = new Set<string>()
  for (const tool of selectedSkill?.requiredTools ?? []) {
    tools.add(tool)
  }
  for (const tool of form.requiredTools) {
    tools.add(tool)
  }
  return [...tools].sort()
}

function skillSourceLabel(
  skill: AiAgentSkill,
  t: ReturnType<typeof useTranslation>['t']
) {
  if (skill.scope === 'builtin') {
    return t('agent_settings_builtin_skill')
  }
  if (skill.pluginId) {
    return t('agent_settings_plugin_skill')
  }
  return t('agent_settings_project_skill')
}

function PluginsSection({
  t,
  plugins,
  preview,
  source,
  busy,
  disabled,
  onSourceChange,
  onPreview,
  onInstall,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  plugins: AiAgentPluginInstallation[]
  preview: AiAgentPluginPreview | null
  source: PluginSourceState
  busy: boolean
  disabled: boolean
  onSourceChange: (source: PluginSourceState) => void
  onPreview: (event: FormEvent) => void
  onInstall: () => void
  onToggle: (plugin: AiAgentPluginInstallation) => void
}) {
  return (
    <section className="agent-settings-section agent-settings-workbench">
      <div className="agent-settings-section-header">
        <h5>{t('agent_settings_project_plugins')}</h5>
        <p>{t('agent_settings_project_plugins_description')}</p>
      </div>
      <div className="agent-settings-split-view">
        <aside className="agent-settings-sidebar-list">
          <div className="agent-settings-sidebar-toolbar">
            <div>
              <strong>{t('agent_settings_installed_plugins')}</strong>
              <span>
                {t('agent_settings_plugins_enabled_summary', {
                  enabled: plugins.filter(plugin => plugin.enabled).length,
                  total: plugins.length,
                })}
              </span>
            </div>
          </div>
          <div className="agent-settings-plugin-list">
            {plugins.length === 0 && (
              <p className="agent-settings-muted">
                {t('agent_settings_no_project_plugins')}
              </p>
            )}
            {plugins.map(plugin => (
              <PluginRow
                t={t}
                key={`${plugin.pluginId}:${plugin.version}`}
                plugin={plugin}
                disabled={disabled}
                onToggle={onToggle}
              />
            ))}
          </div>
        </aside>
        <div className="agent-settings-editor-pane">
          <Form
            className="agent-settings-plugin-installer"
            onSubmit={onPreview}
            aria-label={t('agent_settings_plugin_source_form')}
          >
            <div className="agent-settings-editor-header">
              <div>
                <h6>{t('agent_settings_install_plugin')}</h6>
                <p>{t('agent_settings_plugin_import_description')}</p>
              </div>
            </div>
            <div className="agent-settings-plugin-source-row">
              <Form.Group
                className="agent-settings-field"
                controlId="agent-plugin-source-type"
              >
                <Form.Label>{t('agent_settings_source_type')}</Form.Label>
                <OLFormSelect
                  value={source.kind}
                  disabled={disabled || source.kind === 'uploaded_zip'}
                  onChange={event =>
                    onSourceChange({
                      kind: event.currentTarget.value as PluginSourceState['kind'],
                      value: '',
                    })
                  }
                >
                  <option value="github">{t('agent_settings_github_link')}</option>
                  <option value="zip_url">{t('agent_settings_https_zip_url')}</option>
                  <option value="local_directory">
                    {t('agent_settings_server_directory')}
                  </option>
                  {source.kind === 'uploaded_zip' && (
                    <option value="uploaded_zip">
                      {t('agent_settings_uploaded_zip')}
                    </option>
                  )}
                </OLFormSelect>
              </Form.Group>
              <Form.Group
                className="agent-settings-field"
                controlId="agent-plugin-source-value"
              >
                <Form.Label>{pluginSourceLabel(source.kind, t)}</Form.Label>
                <OLFormControl
                  value={source.value}
                  disabled={disabled || source.kind === 'uploaded_zip'}
                  required={source.kind !== 'uploaded_zip'}
                  onChange={event =>
                    onSourceChange({
                      ...source,
                      value: event.currentTarget.value,
                    })
                  }
                  placeholder={pluginSourcePlaceholder(source.kind)}
                />
              </Form.Group>
            </div>
            <div className="agent-settings-form-footer">
              <span className="agent-settings-muted">
                {t('agent_settings_plugin_source_hint')}
              </span>
              <OLButton
                type="submit"
                variant="primary"
                disabled={disabled || source.kind === 'uploaded_zip'}
                isLoading={busy}
                loadingLabel={t('agent_settings_previewing')}
              >
                {t('agent_settings_preview_plugin')}
              </OLButton>
            </div>
          </Form>
          {preview ? (
            <PluginPreview
              t={t}
              preview={preview}
              busy={busy}
              disabled={disabled}
              onInstall={onInstall}
            />
          ) : (
            <div className="agent-settings-empty-state">
              <strong>{t('agent_settings_plugin_preview_empty_title')}</strong>
              <span>{t('agent_settings_plugin_preview_empty')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function PluginRow({
  t,
  plugin,
  disabled,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  plugin: AiAgentPluginInstallation
  disabled: boolean
  onToggle: (plugin: AiAgentPluginInstallation) => void
}) {
  return (
    <div className="agent-settings-plugin-row">
      <div className="agent-settings-plugin-copy">
        <div>
          <strong>{plugin.displayName || plugin.name}</strong>
          <span className="agent-settings-source">
            {sourceLabel(plugin.source, t)}
          </span>
        </div>
        <p>
          {plugin.pluginId} ·{' '}
          {t('agent_settings_skill_count', {
            count: plugin.skillIds.length,
          })}
        </p>
      </div>
      <label className="agent-settings-switch">
        <input
          type="checkbox"
          checked={plugin.enabled}
          disabled={disabled}
          onChange={() => onToggle(plugin)}
          aria-label={`${plugin.displayName || plugin.name} ${t('enabled')}`}
        />
        <span />
      </label>
    </div>
  )
}

function PluginPreview({
  t,
  preview,
  busy,
  disabled,
  onInstall,
}: {
  t: ReturnType<typeof useTranslation>['t']
  preview: AiAgentPluginPreview
  busy: boolean
  disabled: boolean
  onInstall: () => void
}) {
  return (
    <div className="agent-settings-preview">
      <div className="agent-settings-preview-header">
        <div>
          <strong>{preview.plugin.displayName || preview.plugin.name}</strong>
          <span>{preview.plugin.id} · {preview.plugin.version}</span>
        </div>
        <span className="agent-settings-badge on">
          {t('agent_settings_safe_subset')}
        </span>
      </div>
      <div className="agent-settings-preview-meta">
        <span>{t('agent_settings_file_count', { count: preview.fileCount })}</span>
        <span>{formatBytes(preview.packageBytes)}</span>
        <code>{shortHash(preview.integrity.sha256)}</code>
      </div>
      <div className="agent-settings-preview-skills">
        {preview.skills.map(skill => (
          <div className="agent-settings-preview-skill" key={skill.id}>
            <span className="agent-settings-file-icon" aria-hidden="true">
              <MaterialIcon type="description" />
            </span>
            <div>
              <strong>{skill.displayName || skill.id}</strong>
              <span>{skill.id}</span>
              <p>
                {skill.requiredTools.join(', ') ||
                  t('agent_settings_no_required_tools')}
              </p>
            </div>
          </div>
        ))}
      </div>
      <OLButton
        type="button"
        variant="primary"
        disabled={disabled}
        isLoading={busy}
        loadingLabel={t('agent_settings_installing')}
        onClick={onInstall}
      >
        {t('agent_settings_install_plugin')}
      </OLButton>
    </div>
  )
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

function emptyInstructionForm(): InstructionFormState {
  return {
    editingName: null,
    name: PROJECT_RULES_NAME,
    content: DEFAULT_RULES,
    enabled: true,
  }
}

function instructionFormFromConfig(
  config: ProjectAiAgentConfig,
  current: InstructionFormState
) {
  const profiles = config.instructionProfiles ?? []
  const selected =
    profiles.find(profile => profile.name === current.editingName) ??
    profiles.find(profile => profile.name === PROJECT_RULES_NAME) ??
    profiles[0]
  if (!selected) {
    return current.editingName ? current : emptyInstructionForm()
  }
  return {
    editingName: selected.name,
    name: selected.name,
    content: selected.content || '',
    enabled: selected.enabled !== false,
  }
}

function upsertInstructionProfile(
  profiles: AiAgentInstructionProfile[],
  nextProfile: AiAgentInstructionProfile,
  previousName: string | null
) {
  const filtered = profiles.filter(
    profile => profile.name !== nextProfile.name && profile.name !== previousName
  )
  const previousProfile =
    previousName && previousName !== nextProfile.name
      ? profiles.find(profile => profile.name === previousName)
      : null
  return [
    ...filtered,
    ...(previousProfile ? [{ ...previousProfile, enabled: false }] : []),
    nextProfile,
  ].sort((left, right) => left.name.localeCompare(right.name))
}

function skillFromForm(form: SkillFormState): AiAgentSkill {
  const parsed = parseSkillMarkdown(form.content)
  const id = slugFromSkillName(
    form.editingSkillId ||
      form.id.trim() ||
      parsed.name ||
      'custom-skill'
  )
  const displayName =
    form.displayName.trim() ||
    parsed.displayName ||
    firstMarkdownHeading(form.content) ||
    parsed.name ||
    id
  const description =
    parsed.description || form.description.trim() || displayName
  const parsedModelInvocable =
    typeof parsed.disableModelInvocation === 'boolean'
      ? !parsed.disableModelInvocation
      : parsed.modelInvocable
  return {
    id,
    name: parsed.name || id,
    displayName,
    description,
    keywords: splitList(form.keywords || (parsed.keywords ?? []).join(', ')),
    requiredTools:
      form.requiredTools.length > 0
        ? form.requiredTools
        : parsed.requiredTools || parsed.allowedTools || [],
    content: form.content,
    enabled: form.enabled,
    modelInvocable:
      typeof parsedModelInvocable === 'boolean'
        ? parsedModelInvocable
        : form.modelInvocable,
    scope: 'project',
    pluginId: form.pluginId,
  }
}

function skillFormFromSkill(skill: AiAgentSkill): SkillFormState {
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

function skillFormFromDroppedText(content: string, fileName: string) {
  const parsed = parseSkillMarkdown(content)
  const id = parsed.name || slugFromFileName(fileName)
  const title =
    parsed.displayName || firstMarkdownHeading(content) || parsed.name || id
  return {
    ...emptySkillForm(),
    id: slugFromSkillName(id),
    displayName: title,
    description: parsed.description || firstNonHeadingLine(content) || title,
    keywords: (parsed.keywords ?? []).join(', '),
    requiredTools: parsed.requiredTools || parsed.allowedTools || [],
    modelInvocable:
      typeof parsed.disableModelInvocation === 'boolean'
        ? !parsed.disableModelInvocation
        : parsed.modelInvocable !== false,
    content,
  }
}

function metadataFromSkillMarkdown(
  content: string,
  form: SkillFormState
): Partial<SkillFormState> {
  const parsed = parseSkillMarkdown(content)
  const title = parsed.displayName || firstMarkdownHeading(content) || parsed.name
  const next: Partial<SkillFormState> = {}
  if (title) {
    next.displayName = title
  }
  if (parsed.name && !form.editingSkillId) {
    next.id = slugFromSkillName(parsed.name)
  }
  if (parsed.description) {
    next.description = parsed.description
  }
  const parsedTools = parsed.requiredTools || parsed.allowedTools
  if (parsedTools) {
    next.requiredTools = parsedTools
  }
  if (parsed.keywords) {
    next.keywords = parsed.keywords.join(', ')
  }
  if (typeof parsed.disableModelInvocation === 'boolean') {
    next.modelInvocable = !parsed.disableModelInvocation
  } else if (typeof parsed.modelInvocable === 'boolean') {
    next.modelInvocable = parsed.modelInvocable
  }
  return next
}

function parseSkillMarkdown(content: string) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  if (!frontmatter) {
    return {}
  }
  return {
    name: yamlStringValue(frontmatter[1], 'name'),
    displayName: yamlStringValue(frontmatter[1], 'displayName'),
    description: yamlStringValue(frontmatter[1], 'description'),
    requiredTools: yamlStringListValue(frontmatter[1], 'requiredTools'),
    allowedTools: yamlStringListValue(frontmatter[1], 'allowed-tools'),
    keywords: yamlStringListValue(frontmatter[1], 'keywords'),
    modelInvocable: yamlBooleanValue(frontmatter[1], 'modelInvocable'),
    disableModelInvocation: yamlBooleanValue(
      frontmatter[1],
      'disable-model-invocation'
    ),
  }
}

function yamlStringValue(yaml: string, key: string) {
  const match = yaml.match(
    new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.+?))\\s*$`, 'm')
  )
  return (match?.[1] || match?.[2] || match?.[3] || '').trim()
}

function yamlStringListValue(yaml: string, key: string) {
  const scalar = yamlStringValue(yaml, key)
  if (scalar) {
    return splitList(scalar)
  }
  const block = yaml.match(
    new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'm')
  )
  if (!block) {
    return undefined
  }
  return block[1]
    .split(/\r?\n/)
    .map(line => line.replace(/^\s+-\s+/, '').trim())
    .filter(Boolean)
}

function yamlBooleanValue(yaml: string, key: string) {
  const value = yamlStringValue(yaml, key).toLowerCase()
  if (['true', 'yes'].includes(value)) {
    return true
  }
  if (['false', 'no'].includes(value)) {
    return false
  }
  return undefined
}

function skillPreviewFromForm(form: SkillFormState) {
  const parsed = parseSkillMarkdown(form.content)
  return {
    id: parsed.name || form.id.trim(),
    displayName:
      form.displayName.trim() ||
      parsed.displayName ||
      firstMarkdownHeading(form.content) ||
      parsed.name,
    description: parsed.description || form.description.trim(),
  }
}

function validateSkillForm(
  form: SkillFormState,
  t: ReturnType<typeof useTranslation>['t']
) {
  const parsed = parseSkillMarkdown(form.content)
  if (!parsed.name || !parsed.description) {
    return t('agent_settings_skill_frontmatter_required')
  }
  if (!isSafeSkillName(parsed.name)) {
    return t('agent_settings_skill_name_invalid')
  }
  return null
}

function isSafeSkillName(name: string) {
  return /^[a-z0-9][a-z0-9-]{0,119}$/.test(name)
}

function upsertSkill(skills: AiAgentSkill[], nextSkill: AiAgentSkill) {
  return [
    ...skills.filter(skill => skill.id !== nextSkill.id),
    nextSkill,
  ].sort((left, right) => left.id.localeCompare(right.id))
}

function upsertPluginInstallation(
  plugins: AiAgentPluginInstallation[],
  nextPlugin: AiAgentPluginInstallation
) {
  return [
    nextPlugin,
    ...plugins.filter(plugin => plugin.pluginId !== nextPlugin.pluginId),
  ].sort((left, right) => left.pluginId.localeCompare(right.pluginId))
}

function sourceFromState(state: PluginSourceState): AiAgentPluginSource | null {
  const value = state.value.trim()
  if (state.kind === 'uploaded_zip') {
    return state.uploadId
      ? {
          sourceType: 'uploaded_zip',
          uploadId: state.uploadId,
          originalName: state.originalName,
        }
      : null
  }
  if (state.kind === 'github') {
    return value ? githubSourceFromUrl(value) : null
  }
  if (state.kind === 'zip_url') {
    return value ? { sourceType: 'zip_url', url: value } : null
  }
  return value ? { sourceType: 'local_directory', path: value } : null
}

function sourceFromText(text: string): AiAgentPluginSource | null {
  const value = text.trim()
  if (!value) {
    return null
  }
  const line = value
    .split(/\s+/)
    .find(
      item =>
        isGitHubUrl(item) || item.startsWith('https://') || item.startsWith('/')
    )
  if (!line) {
    return null
  }
  if (isGitHubUrl(line)) {
    return githubSourceFromUrl(line)
  }
  if (line.startsWith('https://')) {
    return { sourceType: 'zip_url', url: line }
  }
  if (line.startsWith('/')) {
    return { sourceType: 'local_directory', path: line }
  }
  return null
}

function skillSourceFromText(text: string): AiAgentSkillImportSource | null {
  const value = text.trim()
  if (!value) {
    return null
  }
  const line = value
    .split(/\s+/)
    .find(item => item.startsWith('https://'))
  if (!line) {
    return null
  }
  if (isGitHubSkillUrl(line)) {
    return { sourceType: 'github_file', url: line }
  }
  if (isRawSkillUrl(line)) {
    return { sourceType: 'url', url: line }
  }
  return null
}

function githubSourceFromUrl(url: string): AiAgentPluginSource {
  const refMatch = url.match(/\/tree\/([^/]+)/)
  return {
    sourceType: 'github',
    url,
    ...(refMatch ? { ref: decodeURIComponent(refMatch[1]) } : {}),
  }
}

function sourceStateFromSource(source: AiAgentPluginSource): PluginSourceState {
  if (source.sourceType === 'uploaded_zip') {
    return {
      kind: 'uploaded_zip',
      value: source.originalName || 'Uploaded plugin zip',
      uploadId: source.uploadId,
      originalName: source.originalName,
    }
  }
  if (source.sourceType === 'github') {
    return { kind: 'github', value: source.url }
  }
  if (source.sourceType === 'zip_url') {
    return { kind: 'zip_url', value: source.url }
  }
  return { kind: 'local_directory', value: source.path }
}

function isGitHubUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'github.com'
  } catch {
    return false
  }
}

function isGitHubSkillUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      (url.pathname.includes('/blob/') || url.pathname.includes('/tree/')) &&
      (url.pathname.toLowerCase().endsWith('/skill.md') ||
        url.pathname.includes('/tree/'))
    )
  } catch {
    return false
  }
}

function isRawSkillUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'raw.githubusercontent.com' &&
      url.pathname.toLowerCase().endsWith('/skill.md')
    )
  } catch {
    return false
  }
}

function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function isZipFile(file: File) {
  return file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
}

function readFileText(file: File) {
  if (typeof file.text === 'function') {
    return file.text()
  }
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then(buffer => new TextDecoder().decode(buffer))
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('File read failed'))
    reader.readAsText(file)
  })
}

function slugFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-skill'
}

function slugFromSkillName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-skill'
}

function firstMarkdownHeading(content: string) {
  return content
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('# '))
    ?.replace(/^#\s+/, '')
}

function firstNonHeadingLine(content: string) {
  return content
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'))
}

function pluginSourceLabel(
  kind: PluginSourceState['kind'],
  t: ReturnType<typeof useTranslation>['t']
) {
  switch (kind) {
    case 'github':
      return t('agent_settings_github_url')
    case 'zip_url':
      return t('agent_settings_https_zip_url')
    case 'uploaded_zip':
      return t('agent_settings_uploaded_zip')
    default:
      return t('agent_settings_server_directory_path')
  }
}

function pluginSourcePlaceholder(kind: PluginSourceState['kind']) {
  switch (kind) {
    case 'github':
      return 'https://github.com/org/repo'
    case 'zip_url':
      return 'https://example.com/plugin.zip'
    case 'uploaded_zip':
      return 'Uploaded plugin zip'
    default:
      return '/srv/superpaper-agent-plugins/plugin'
  }
}

function sourceLabel(
  source: AiAgentPluginInstallation['source'],
  t: ReturnType<typeof useTranslation>['t']
) {
  if (source.type === 'github') {
    return source.url || 'GitHub'
  }
  if (source.type === 'zip_url') {
    return source.url || t('agent_settings_zip_url')
  }
  if (source.type === 'uploaded_zip') {
    return source.originalName || t('agent_settings_uploaded_zip')
  }
  if (source.type === 'local_directory') {
    return t('agent_settings_server_directory')
  }
  return t('agent_settings_unknown_source')
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

function shortHash(hash?: string) {
  return hash ? hash.slice(0, 12) : 'unknown'
}

function errorToMessage(
  error: unknown,
  t: ReturnType<typeof useTranslation>['t']
) {
  if (error instanceof Error) {
    return error.message
  }
  return t('agent_settings_request_failed')
}
