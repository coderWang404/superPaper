import type { FormEvent } from 'react'
import type { ProviderInput, ProviderPatchInput } from '../types'
import type { TranslationKey } from '../translations'

type ProviderCreateFormProps = {
  t: (key: TranslationKey) => string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

type ProviderPreset = {
  id: string
  label: string
  name: string
  baseURL: string
  defaultModel: string
  modelIds: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'claudeaihub-gpt55',
    label: 'ClaudeAIHub - GPT-5.5',
    name: 'ClaudeAIHub - GPT-5.5',
    baseURL: 'https://claudeaihub.cloud/v1',
    defaultModel: 'gpt-5.5',
    modelIds: 'gpt-5.5',
  },
  {
    id: 'claudeaihub-opus48',
    label: 'ClaudeAIHub - Claude Opus 4.8',
    name: 'ClaudeAIHub - Claude Opus 4.8',
    baseURL: 'https://claudeaihub.cloud/v1',
    defaultModel: 'claude-opus-4-8',
    modelIds: 'claude-opus-4-8',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelIds: 'deepseek-chat',
  },
]

export function ProviderCreateForm({ t, onSubmit }: ProviderCreateFormProps) {
  const modelIdsHelpId = 'ai-provider-model-ids-help'

  function handlePresetChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const form = event.currentTarget.form
    const preset = PROVIDER_PRESETS.find(
      candidate => candidate.id === event.currentTarget.value
    )
    if (!form || !preset) {
      return
    }
    getFormInput(form, 'name').value = preset.name
    getFormInput(form, 'baseURL').value = preset.baseURL
    getFormInput(form, 'defaultModel').value = preset.defaultModel
    getFormInput(form, 'modelIds').value = preset.modelIds
  }

  return (
    <form
      className="ai-admin-form"
      aria-label={t('addProviderForm')}
      onSubmit={onSubmit}
    >
      <div className="form-group">
        <label className="form-label" htmlFor="ai-provider-preset">
          {t('presetChannels')}
        </label>
        <select
          className="form-control"
          id="ai-provider-preset"
          onChange={handlePresetChange}
        >
          <option value="">{t('selectPreset')}</option>
          {PROVIDER_PRESETS.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <div className="ai-admin-form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="ai-provider-name">
            {t('providerName')}
          </label>
          <input
            className="form-control"
            id="ai-provider-name"
            name="name"
            type="text"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ai-provider-base-url">
            {t('baseURL')}
          </label>
          <input
            className="form-control"
            id="ai-provider-base-url"
            name="baseURL"
            type="url"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ai-provider-api-key">
            {t('apiKey')}
          </label>
          <input
            className="form-control"
            id="ai-provider-api-key"
            name="apiKey"
            type="password"
            required
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ai-provider-model-ids">
            {t('modelIds')}
          </label>
          <input
            className="form-control"
            id="ai-provider-model-ids"
            name="modelIds"
            type="text"
            placeholder="gpt-4.1, deepseek-chat"
            aria-describedby={modelIdsHelpId}
          />
          <p className="ai-admin-help-text" id={modelIdsHelpId}>
            {t('modelIdsHelp')}
          </p>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="ai-provider-default-model">
            {t('defaultModel')}
          </label>
          <input
            className="form-control"
            id="ai-provider-default-model"
            name="defaultModel"
            type="text"
          />
        </div>
      </div>
      <div className="ai-admin-form-footer">
        <label className="ai-admin-checkbox" htmlFor="ai-provider-enabled">
          <input
            id="ai-provider-enabled"
            name="enabled"
            type="checkbox"
            defaultChecked
          />
          <span>{t('enabled')}</span>
        </label>
        <button className="btn btn-primary" type="submit">
          {t('addProvider')}
        </button>
      </div>
    </form>
  )
}

export function providerInputFromForm(form: HTMLFormElement): ProviderInput {
  const metadata = providerMetadataInputFromForm(form)

  return {
    ...metadata,
    providerType: 'openai-compatible',
    apiKey: getFormInput(form, 'apiKey').value,
    enabled: getFormInput(form, 'enabled').checked,
  }
}

export function providerMetadataInputFromForm(
  form: HTMLFormElement
): ProviderPatchInput {
  const modelIds = getFormInput(form, 'modelIds')
    .value.split(/[,\n]/)
    .map(modelId => modelId.trim())
    .filter(Boolean)

  return {
    name: getFormInput(form, 'name').value,
    baseURL: getFormInput(form, 'baseURL').value,
    defaultModel: getFormInput(form, 'defaultModel').value || null,
    models: modelIds.map(modelId => ({
      id: modelId,
      displayName: modelId,
      source: 'manual',
      enabled: true,
    })),
  }
}

export function getFormInput(form: HTMLFormElement, name: string) {
  const input = form.elements.namedItem(name)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing input: ${name}`)
  }
  return input
}
