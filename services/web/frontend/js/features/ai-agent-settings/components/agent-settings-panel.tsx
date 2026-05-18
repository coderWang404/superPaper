import {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
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
  setProjectAiAgentPluginEnabled,
  updateProjectAiAgentSettings,
  uploadProjectAiAgentPluginZip,
  type AiAgentInstructionProfile,
  type AiAgentPluginInstallation,
  type AiAgentPluginPreview,
  type AiAgentPluginSource,
  type AiAgentSkill,
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

const PROJECT_RULES_NAME = 'Project Agent Rules'
const DEFAULT_RULES = `# Project Agent Rules

- Never expose secrets, tokens, cookies, or internal configuration.
- Project file edits must be proposed as a patch before user approval.
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
  const [dragActive, setDragActive] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    const nextSkill = skillFromForm(skillForm)
    const skills = upsertSkill(config?.skills ?? [], nextSkill)
    await saveConfig({ skills }, t('agent_settings_skill_saved'))
    setSkillForm(emptySkillForm())
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
    if (detectedSource) {
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
      setStatusMessage(t('agent_settings_skill_file_recognized'))
    } catch (error) {
      setErrorMessage(errorToMessage(error, t))
    } finally {
      setPluginBusy(false)
    }
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
            <DropZone active={dragActive} t={t} />
            <RulesSection
              t={t}
              form={instructionForm}
              disabled={!canAdminProject || saving}
              saving={saving}
              onChange={setInstructionForm}
              onSubmit={handleRulesSubmit}
            />
            <SkillsSection
              t={t}
              skills={projectSkills}
              builtinSkills={builtinSkills}
              form={skillForm}
              config={config}
              disabled={!canAdminProject || saving}
              saving={saving}
              onFormChange={setSkillForm}
              onSubmit={handleSkillSubmit}
              onEdit={skill => setSkillForm(skillFormFromSkill(skill))}
              onCancel={() => setSkillForm(emptySkillForm())}
              onToggle={toggleSkill}
            />
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
          </>
        )}
      </div>
    </div>
  )
}

function DropZone({
  active,
  t,
}: {
  active: boolean
  t: ReturnType<typeof useTranslation>['t']
}) {
  return (
    <div className={`agent-settings-dropzone ${active ? 'active' : ''}`}>
      <MaterialIcon type="upload_file" />
      <div>
        <strong>{t('agent_settings_dropzone_title')}</strong>
        <span>{t('agent_settings_dropzone_description')}</span>
      </div>
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
  config,
  disabled,
  saving,
  onFormChange,
  onSubmit,
  onEdit,
  onCancel,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  skills: AiAgentSkill[]
  builtinSkills: AiAgentSkill[]
  form: SkillFormState
  config: ProjectAiAgentConfig | null
  disabled: boolean
  saving: boolean
  onFormChange: (form: SkillFormState) => void
  onSubmit: (event: FormEvent) => void
  onEdit: (skill: AiAgentSkill) => void
  onCancel: () => void
  onToggle: (skill: AiAgentSkill) => void
}) {
  return (
    <section className="agent-settings-section">
      <div className="agent-settings-section-header">
        <h5>{t('agent_settings_project_skills')}</h5>
        <p>{t('agent_settings_project_skills_description')}</p>
      </div>
      <div className="agent-settings-list">
        {skills.length === 0 && (
          <p className="agent-settings-muted">
            {t('agent_settings_no_project_skills')}
          </p>
        )}
        {skills.map(skill => (
          <SkillRow
            t={t}
            key={skill.id}
            skill={skill}
            disabled={disabled}
            onEdit={onEdit}
            onToggle={onToggle}
          />
        ))}
      </div>
      {builtinSkills.length > 0 && (
        <details className="agent-settings-details">
          <summary>{t('agent_settings_builtin_skills_available')}</summary>
          <div className="agent-settings-chip-list">
            {builtinSkills.map(skill => (
              <span className="agent-settings-chip" key={skill.id}>
                {skill.displayName || skill.id}
              </span>
            ))}
          </div>
        </details>
      )}
      <SkillForm
        t={t}
        form={form}
        config={config}
        disabled={disabled}
        saving={saving}
        onChange={onFormChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </section>
  )
}

function SkillRow({
  t,
  skill,
  disabled,
  onEdit,
  onToggle,
}: {
  t: ReturnType<typeof useTranslation>['t']
  skill: AiAgentSkill
  disabled: boolean
  onEdit: (skill: AiAgentSkill) => void
  onToggle: (skill: AiAgentSkill) => void
}) {
  const pluginManaged = Boolean(skill.pluginId)
  return (
    <div className="agent-settings-row">
      <div>
        <strong>{skill.displayName || skill.name || skill.id}</strong>
        <span>{skill.id}</span>
        {skill.description && <p>{skill.description}</p>}
      </div>
      <div className="agent-settings-row-actions">
        <span className={`agent-settings-badge ${skill.enabled === false ? 'off' : 'on'}`}>
          {skill.enabled === false ? t('disabled') : t('enabled')}
        </span>
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || pluginManaged}
          onClick={() => onEdit(skill)}
        >
          {t('edit')}
        </OLButton>
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onToggle(skill)}
        >
          {skill.enabled === false ? t('enable') : t('disable')}
        </OLButton>
      </div>
    </div>
  )
}

function SkillForm({
  t,
  form,
  config,
  disabled,
  saving,
  onChange,
  onSubmit,
  onCancel,
}: {
  t: ReturnType<typeof useTranslation>['t']
  form: SkillFormState
  config: ProjectAiAgentConfig | null
  disabled: boolean
  saving: boolean
  onChange: (form: SkillFormState) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  return (
    <Form
      className="agent-settings-nested-form"
      onSubmit={onSubmit}
      aria-label={
        form.editingSkillId
          ? t('agent_settings_edit_skill_form')
          : t('agent_settings_add_skill_form')
      }
    >
      <h6>
        {form.editingSkillId
          ? t('agent_settings_edit_skill')
          : t('agent_settings_add_skill')}
      </h6>
      <div className="agent-settings-grid">
        <Form.Group className="agent-settings-field" controlId="agent-skill-id">
          <Form.Label>{t('agent_settings_skill_id')}</Form.Label>
          <OLFormControl
            value={form.id}
            disabled={disabled || Boolean(form.editingSkillId)}
            required
            onChange={event => onChange({ ...form, id: event.currentTarget.value })}
          />
        </Form.Group>
        <Form.Group
          className="agent-settings-field"
          controlId="agent-skill-display-name"
        >
          <Form.Label>{t('agent_settings_display_name')}</Form.Label>
          <OLFormControl
            value={form.displayName}
            disabled={disabled}
            required
            onChange={event =>
              onChange({ ...form, displayName: event.currentTarget.value })
            }
          />
        </Form.Group>
        <Form.Group
          className="agent-settings-field"
          controlId="agent-skill-description"
        >
          <Form.Label>{t('description')}</Form.Label>
          <OLFormControl
            value={form.description}
            disabled={disabled}
            required
            onChange={event =>
              onChange({ ...form, description: event.currentTarget.value })
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
            disabled={disabled}
            onChange={event =>
              onChange({ ...form, keywords: event.currentTarget.value })
            }
          />
        </Form.Group>
      </div>
      <Form.Group className="agent-settings-field" controlId="agent-skill-tools">
        <Form.Label>{t('agent_settings_required_tools')}</Form.Label>
        <OLFormSelect
          multiple
          value={form.requiredTools}
          disabled={disabled}
          onChange={event =>
            onChange({
              ...form,
              requiredTools: Array.from(event.currentTarget.selectedOptions).map(
                option => option.value
              ),
            })
          }
        >
          {(config?.tools ?? []).map(tool => (
            <option key={tool.name} value={tool.name}>
              {tool.name}
            </option>
          ))}
        </OLFormSelect>
      </Form.Group>
      <Form.Group
        className="agent-settings-field"
        controlId="agent-skill-content"
      >
        <Form.Label>{t('agent_settings_skill_content')}</Form.Label>
        <Form.Control
          as="textarea"
          rows={8}
          value={form.content}
          disabled={disabled}
          required
          onChange={event => onChange({ ...form, content: event.currentTarget.value })}
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
            disabled={disabled}
            onChange={event =>
              onChange({ ...form, modelInvocable: event.currentTarget.checked })
            }
          />
        </div>
        <div className="agent-settings-actions">
          {form.editingSkillId && (
            <OLButton type="button" variant="secondary" onClick={onCancel}>
              {t('cancel')}
            </OLButton>
          )}
          <OLButton
            type="submit"
            variant="primary"
            disabled={disabled}
            isLoading={saving}
            loadingLabel={t('saving')}
          >
            {t('agent_settings_save_skill')}
          </OLButton>
        </div>
      </div>
    </Form>
  )
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
    <section className="agent-settings-section">
      <div className="agent-settings-section-header">
        <h5>{t('agent_settings_project_plugins')}</h5>
        <p>{t('agent_settings_project_plugins_description')}</p>
      </div>
      <div className="agent-settings-list">
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
      <Form
        className="agent-settings-nested-form"
        onSubmit={onPreview}
        aria-label={t('agent_settings_plugin_source_form')}
      >
        <h6>{t('agent_settings_install_plugin')}</h6>
        <div className="agent-settings-grid">
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
                onSourceChange({ ...source, value: event.currentTarget.value })
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
            variant="secondary"
            disabled={disabled || source.kind === 'uploaded_zip'}
            isLoading={busy}
            loadingLabel={t('agent_settings_previewing')}
          >
            {t('agent_settings_preview_plugin')}
          </OLButton>
        </div>
      </Form>
      {preview && (
        <PluginPreview
          t={t}
          preview={preview}
          busy={busy}
          disabled={disabled}
          onInstall={onInstall}
        />
      )}
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
    <div className="agent-settings-row">
      <div>
        <strong>{plugin.displayName || plugin.name}</strong>
        <span>{plugin.pluginId}</span>
        <p>
          {t('agent_settings_skill_count', {
            count: plugin.skillIds.length,
          })}{' '}
          · {sourceLabel(plugin.source, t)}
        </p>
      </div>
      <div className="agent-settings-row-actions">
        <span className={`agent-settings-badge ${plugin.enabled ? 'on' : 'off'}`}>
          {plugin.enabled ? t('enabled') : t('disabled')}
        </span>
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onToggle(plugin)}
        >
          {plugin.enabled ? t('disable') : t('enable')}
        </OLButton>
      </div>
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
      <div className="agent-settings-list compact">
        {preview.skills.map(skill => (
          <div className="agent-settings-row" key={skill.id}>
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
  return {
    id: form.id.trim(),
    name: form.id.trim(),
    displayName: form.displayName.trim(),
    description: form.description.trim(),
    keywords: splitList(form.keywords),
    requiredTools: form.requiredTools,
    content: form.content,
    enabled: form.enabled,
    modelInvocable: form.modelInvocable,
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
  const id = slugFromFileName(fileName)
  const title = firstMarkdownHeading(content) || id
  return {
    ...emptySkillForm(),
    id,
    displayName: title,
    description: firstNonHeadingLine(content) || title,
    content,
  }
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
  if (isGitHubUrl(value)) {
    return githubSourceFromUrl(value)
  }
  if (value.startsWith('https://')) {
    return { sourceType: 'zip_url', url: value }
  }
  if (value.startsWith('/')) {
    return { sourceType: 'local_directory', path: value }
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
