import type { FormEvent } from 'react'
import type { AiProvider } from '../types'
import type { TranslationKey } from '../translations'
import { getFormInput } from './provider-create-form'

type ProviderTableProps = {
  providers: AiProvider[]
  loading: boolean
  activeAction: string | null
  expandedKeyProviderId: string | null
  t: (key: TranslationKey) => string
  onSyncModels: (providerId: string) => void
  onTestProvider: (providerId: string) => void
  onToggleProvider: (provider: AiProvider) => void
  onShowReplaceKey: (providerId: string) => void
  onCancelReplaceKey: () => void
  onReplaceKey: (
    event: FormEvent<HTMLFormElement>,
    providerId: string
  ) => void
  onDeleteProvider: (provider: AiProvider) => void
}

export function ProviderTable({
  providers,
  loading,
  activeAction,
  expandedKeyProviderId,
  t,
  onSyncModels,
  onTestProvider,
  onToggleProvider,
  onShowReplaceKey,
  onCancelReplaceKey,
  onReplaceKey,
  onDeleteProvider,
}: ProviderTableProps) {
  if (loading) {
    return null
  }

  if (providers.length === 0) {
    return <p className="text-muted">{t('noProviders')}</p>
  }

  return (
    <div className="ai-admin-table-wrap">
      <table className="table table-striped ai-admin-table">
        <thead>
          <tr>
            <th>{t('name')}</th>
            <th>{t('baseURL')}</th>
            <th>{t('models')}</th>
            <th>{t('default')}</th>
            <th>{t('health')}</th>
            <th>{t('enabled')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {providers.map(provider => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              activeAction={activeAction}
              expandedKeyProviderId={expandedKeyProviderId}
              t={t}
              onSyncModels={onSyncModels}
              onTestProvider={onTestProvider}
              onToggleProvider={onToggleProvider}
              onShowReplaceKey={onShowReplaceKey}
              onCancelReplaceKey={onCancelReplaceKey}
              onReplaceKey={onReplaceKey}
              onDeleteProvider={onDeleteProvider}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProviderRow({
  provider,
  activeAction,
  expandedKeyProviderId,
  t,
  onSyncModels,
  onTestProvider,
  onToggleProvider,
  onShowReplaceKey,
  onCancelReplaceKey,
  onReplaceKey,
  onDeleteProvider,
}: Omit<ProviderTableProps, 'providers' | 'loading'> & {
  provider: AiProvider
}) {
  const models =
    provider.models.map(model => model.id).join(', ') || t('noModels')
  const isSyncing = activeAction === `sync:${provider.id}`
  const isTesting = activeAction === `test:${provider.id}`
  const isReplacingKey = activeAction === `replace-key:${provider.id}`
  const isReplaceKeyExpanded = expandedKeyProviderId === provider.id

  return (
    <tr>
      <td>
        <strong>{provider.name}</strong>
        <div className="ai-admin-row-subtitle">
          {provider.hasApiKey ? t('apiKeyStored') : t('noApiKeyStored')}
        </div>
        {isReplaceKeyExpanded ? (
          <ReplaceKeyForm
            provider={provider}
            activeAction={activeAction}
            isReplacingKey={isReplacingKey}
            t={t}
            onCancelReplaceKey={onCancelReplaceKey}
            onReplaceKey={onReplaceKey}
          />
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-xs ai-provider-admin-replace-key-toggle"
            aria-label={`${t('replaceProviderKeyFor')} ${provider.name}`}
            disabled={Boolean(activeAction)}
            onClick={() => onShowReplaceKey(provider.id)}
          >
            {t('replaceKey')}
          </button>
        )}
      </td>
      <td>{provider.baseURL}</td>
      <td>{models}</td>
      <td>{provider.defaultModel || t('none')}</td>
      <td>
        <StatusBadge
          label={healthLabel(provider.healthStatus, t)}
          tone={provider.healthStatus}
        />
      </td>
      <td>
        <StatusBadge
          label={provider.enabled ? t('enabled') : t('disabled')}
          tone={provider.enabled ? 'enabled' : 'disabled'}
        />
      </td>
      <td>
        <div className="ai-admin-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={`${t('syncModels')} for ${provider.name}`}
            disabled={Boolean(activeAction)}
            onClick={() => onSyncModels(provider.id)}
          >
            {t(isSyncing ? 'syncingModels' : 'syncModels')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={`${t('test')} ${provider.name}`}
            disabled={Boolean(activeAction)}
            onClick={() => onTestProvider(provider.id)}
          >
            {t(isTesting ? 'testingProvider' : 'test')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={`${provider.enabled ? t('disable') : t('enable')} ${
              provider.name
            }`}
            disabled={Boolean(activeAction)}
            onClick={() => onToggleProvider(provider)}
          >
            {provider.enabled ? t('disable') : t('enable')}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            aria-label={`${t('delete')} ${provider.name}`}
            disabled={Boolean(activeAction)}
            onClick={() => onDeleteProvider(provider)}
          >
            {t('delete')}
          </button>
        </div>
      </td>
    </tr>
  )
}

function ReplaceKeyForm({
  provider,
  activeAction,
  isReplacingKey,
  t,
  onCancelReplaceKey,
  onReplaceKey,
}: {
  provider: AiProvider
  activeAction: string | null
  isReplacingKey: boolean
  t: (key: TranslationKey) => string
  onCancelReplaceKey: () => void
  onReplaceKey: (
    event: FormEvent<HTMLFormElement>,
    providerId: string
  ) => void
}) {
  const inputId = `ai-provider-replacement-key-${safeId(provider.id)}`

  return (
    <form
      className="ai-provider-admin-replace-key"
      aria-label={`${t('replaceProviderKeyFor')} ${provider.name}`}
      onSubmit={event => onReplaceKey(event, provider.id)}
    >
      <label className="sr-only" htmlFor={inputId}>
        {t('newApiKeyFor')} {provider.name}
      </label>
      <input
        className="form-control input-sm"
        id={inputId}
        name="replacementApiKey"
        type="password"
        autoComplete="off"
        required
        placeholder={t('newApiKey')}
      />
      <button
        className="btn btn-secondary btn-xs"
        type="submit"
        disabled={Boolean(activeAction)}
      >
        {t(isReplacingKey ? 'replaceKeyBusy' : 'replaceKey')}
      </button>
      <button
        className="btn btn-link btn-xs"
        type="button"
        disabled={Boolean(activeAction)}
        onClick={() => {
          const form = document.getElementById(inputId)?.closest('form')
          if (form instanceof HTMLFormElement) {
            getFormInput(form, 'replacementApiKey').value = ''
          }
          onCancelReplaceKey()
        }}
      >
        {t('cancel')}
      </button>
    </form>
  )
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`ai-admin-status ai-admin-status-${safeId(tone)}`}>
      {label}
    </span>
  )
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

function safeId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
}
