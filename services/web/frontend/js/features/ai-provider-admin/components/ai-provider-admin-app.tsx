import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useReducer } from 'react'
import {
  AiProviderAdminRequestError,
  createProvider,
  deleteProvider,
  listProviders,
  safeUserMessageFromError,
  syncModels,
  testProvider,
  updateProvider,
} from '../api'
import {
  createAdminTranslator,
  getAdminLanguage,
} from '../translations'
import type { AiProvider, ProviderResponse, SafeApiError } from '../types'
import {
  initialProviderAdminState,
  providerAdminReducer,
} from '../state'
import { ProviderOverview } from './provider-overview'
import { ProviderFeedback } from './provider-feedback'
import {
  getFormInput,
  ProviderCreateForm,
  providerInputFromForm,
} from './provider-create-form'
import { ProviderTable } from './provider-table'

export function AiProviderAdminApp({ csrfToken }: { csrfToken: string }) {
  const [state, dispatch] = useReducer(
    providerAdminReducer,
    initialProviderAdminState
  )
  const language = useMemo(() => getAdminLanguage(), [])
  const t = useMemo(() => createAdminTranslator(language), [language])

  const showError = useCallback(
    (error: unknown) => {
      dispatch({
        type: 'feedback:error',
        error: safeErrorFromUnknown(error, t('requestFailed')),
      })
    },
    [t]
  )

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'load:start' })

    listProviders(csrfToken)
      .then(response => {
        if (!cancelled) {
          dispatch({
            type: 'load:success',
            providers: Array.isArray(response.providers)
              ? response.providers
              : [],
          })
        }
      })
      .catch(error => {
        if (!cancelled) {
          dispatch({
            type: 'load:error',
            error: safeErrorFromUnknown(error, t('requestFailed')),
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [csrfToken, t])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget

    try {
      const response = await createProvider(csrfToken, providerInputFromForm(form))
      const provider = requireProvider(response, t('requestFailed'))
      dispatch({ type: 'provider:add', provider })
      dispatch({ type: 'feedback:status', statusMessage: 'providerAdded' })
      form.reset()
      getFormInput(form, 'enabled').checked = true
      getFormInput(form, 'apiKey').value = ''
    } catch (error) {
      showError(error)
    }
  }

  async function handleSyncModels(providerId: string) {
    dispatch({ type: 'action:start', activeAction: `sync:${providerId}` })

    try {
      const response = await syncModels(csrfToken, providerId)
      dispatch({
        type: 'provider:replace',
        provider: requireProvider(response, t('requestFailed')),
      })
      dispatch({ type: 'feedback:status', statusMessage: 'modelsSynced' })
    } catch (error) {
      showError(error)
    } finally {
      dispatch({ type: 'action:finish' })
    }
  }

  async function handleTestProvider(providerId: string) {
    dispatch({ type: 'action:start', activeAction: `test:${providerId}` })

    try {
      const response = await testProvider(csrfToken, providerId)
      dispatch({ type: 'provider:replace', provider: response.provider })
      dispatch({
        type: 'feedback:status',
        statusMessage: response.ok
          ? 'providerTestPassed'
          : 'providerTestFailed',
      })
    } catch (error) {
      showError(error)
    } finally {
      dispatch({ type: 'action:finish' })
    }
  }

  async function handleToggleProvider(provider: AiProvider) {
    dispatch({ type: 'action:start', activeAction: `toggle:${provider.id}` })

    try {
      const response = await updateProvider(csrfToken, provider.id, {
        enabled: !provider.enabled,
      })
      const updatedProvider = requireProvider(response, t('requestFailed'))
      dispatch({ type: 'provider:replace', provider: updatedProvider })
      dispatch({
        type: 'feedback:status',
        statusMessage: updatedProvider.enabled
          ? 'providerEnabled'
          : 'providerDisabled',
      })
    } catch (error) {
      showError(error)
    } finally {
      dispatch({ type: 'action:finish' })
    }
  }

  async function handleReplaceKey(
    event: FormEvent<HTMLFormElement>,
    providerId: string
  ) {
    event.preventDefault()
    const form = event.currentTarget
    const apiKeyInput = getFormInput(form, 'replacementApiKey')
    if (!apiKeyInput.value.trim()) {
      return
    }

    dispatch({
      type: 'action:start',
      activeAction: `replace-key:${providerId}`,
    })

    try {
      const response = await updateProvider(csrfToken, providerId, {
        apiKey: apiKeyInput.value,
      })
      dispatch({
        type: 'provider:replace',
        provider: requireProvider(response, t('requestFailed')),
      })
      dispatch({ type: 'feedback:status', statusMessage: 'apiKeyReplaced' })
      dispatch({ type: 'replace-key:collapse' })
      apiKeyInput.value = ''
    } catch (error) {
      showError(error)
    } finally {
      dispatch({ type: 'action:finish' })
    }
  }

  async function handleDeleteProvider(provider: AiProvider) {
    if (!window.confirm(`${t('confirmDelete')} ${provider.name}?`)) {
      return
    }

    try {
      await deleteProvider(csrfToken, provider.id)
      dispatch({ type: 'provider:remove', providerId: provider.id })
      dispatch({ type: 'feedback:status', statusMessage: 'providerDeleted' })
    } catch (error) {
      showError(error)
    }
  }

  return (
    <div className="ai-provider-admin">
      <ProviderOverview providers={state.providers} t={t} />
      <ProviderFeedback
        loading={state.loading}
        statusMessage={state.statusMessage}
        error={state.error}
        t={t}
      />
      <div className="ai-admin-section">
        <div className="ai-admin-section-header">
          <div>
            <h4>{t('providers')}</h4>
            <p>{t('providersDescription')}</p>
          </div>
        </div>
        <ProviderTable
          providers={state.providers}
          loading={state.loading}
          activeAction={state.activeAction}
          expandedKeyProviderId={state.expandedKeyProviderId}
          t={t}
          onSyncModels={providerId => {
            handleSyncModels(providerId).catch(showError)
          }}
          onTestProvider={providerId => {
            handleTestProvider(providerId).catch(showError)
          }}
          onToggleProvider={provider => {
            handleToggleProvider(provider).catch(showError)
          }}
          onShowReplaceKey={providerId => {
            dispatch({ type: 'replace-key:expand', providerId })
          }}
          onCancelReplaceKey={() => {
            dispatch({ type: 'replace-key:collapse' })
          }}
          onReplaceKey={(event, providerId) => {
            handleReplaceKey(event, providerId).catch(showError)
          }}
          onDeleteProvider={provider => {
            handleDeleteProvider(provider).catch(showError)
          }}
        />
      </div>
      <div className="ai-admin-section">
        <div className="ai-admin-section-header">
          <div>
            <h4>{t('addProvider')}</h4>
            <p>{t('addProviderDescription')}</p>
          </div>
        </div>
        <ProviderCreateForm t={t} onSubmit={handleCreate} />
      </div>
    </div>
  )
}

function requireProvider(response: ProviderResponse, fallbackMessage: string) {
  if (!response.provider?.id) {
    throw new AiProviderAdminRequestError(fallbackMessage, {
      message: fallbackMessage,
    })
  }
  return response.provider
}

function safeErrorFromUnknown(error: unknown, fallback: string): SafeApiError {
  if (error instanceof AiProviderAdminRequestError && error.safeError) {
    return error.safeError
  }
  return { message: safeUserMessageFromError(error, fallback) }
}
