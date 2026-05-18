import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import { useProjectContext } from '@/shared/context/project-context'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { useEditorSelectionContext } from '@/shared/context/editor-selection-context'
import { useEditorViewContext } from '@/features/ide-react/context/editor-view-context'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import { FetchError } from '@/infrastructure/fetch-json'
import {
  getProjectAiConfig,
  sendProjectAiChatStream,
  type ProjectAiChatResponse,
  type ProjectAiConfig,
  type ProjectAiProvider,
} from '@/features/ai-assistant/api'
import {
  applyProjectAiAgentPatch,
  createProjectAiAgentSession,
  getProjectAiAgentConfig,
  rejectProjectAiAgentPatch,
  sendProjectAiAgentTurnStream,
  startProjectAiAgentAct,
  type ProjectAiAgentConfig,
  type ProjectAiAgentEvent,
  type ProjectAiAgentPatch,
  type ProjectAiAgentPatchDiffLine,
  type ProjectAiAgentSession,
} from '@/features/ai-agent/api'

type AssistantMode = 'chat' | 'agent'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  providerName?: string
  model?: string
}

export default function AiAssistantPanel() {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const { currentDocumentId, openDocName } = useEditorOpenDocContext()
  const { editorSelection } = useEditorSelectionContext()
  const { view } = useEditorViewContext()
  const [config, setConfig] = useState<ProjectAiConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  )
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [answer, setAnswer] = useState<ProjectAiChatResponse | null>(null)
  const [streamedAnswer, setStreamedAnswer] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [agentConfig, setAgentConfig] = useState<ProjectAiAgentConfig | null>(
    null
  )
  const [agentSession, setAgentSession] =
    useState<ProjectAiAgentSession | null>(null)
  const [agentEvents, setAgentEvents] = useState<ProjectAiAgentEvent[]>([])
  const [agentAnswer, setAgentAnswer] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startingAct, setStartingAct] = useState(false)
  const [mode, setMode] = useState<AssistantMode>('chat')

  useEffect(() => {
    let cancelled = false

    setConfigError(null)
    getProjectAiConfig(projectId)
      .then(nextConfig => {
        if (cancelled) {
          return
        }
        setConfig(nextConfig)
        const provider = nextConfig.providers[0]
        const model = getDefaultModel(provider)
        setSelectedProviderId(provider?.id ?? null)
        setSelectedModel(model)
      })
      .catch(error => {
        if (cancelled) {
          return
        }
        setConfigError(getErrorMessage(error))
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (mode !== 'agent' || agentConfig || configError) {
      return
    }

    let cancelled = false
    getProjectAiAgentConfig(projectId)
      .then(nextConfig => {
        if (!cancelled) {
          setAgentConfig(nextConfig)
        }
      })
      .catch(error => {
        if (!cancelled) {
          setConfigError(getErrorMessage(error))
        }
      })

    return () => {
      cancelled = true
    }
  }, [agentConfig, configError, mode, projectId])

  useEffect(() => {
    const handleAgentConfigChanged = () => {
      setAgentConfig(null)
    }
    window.addEventListener(
      'superpaper:ai-agent-config-changed',
      handleAgentConfigChanged
    )
    return () => {
      window.removeEventListener(
        'superpaper:ai-agent-config-changed',
        handleAgentConfigChanged
      )
    }
  }, [])

  const selectedProvider = useMemo(() => {
    return (
      config?.providers.find(provider => provider.id === selectedProviderId) ??
      config?.providers[0] ??
      null
    )
  }, [config, selectedProviderId])

  const enabledModels = useMemo(() => {
    return selectedProvider?.models.filter(model => model.enabled) ?? []
  }, [selectedProvider])

  const selection = useMemo(() => {
    const range = editorSelection?.main

    if (!range || range.empty || !view || !currentDocumentId || !openDocName) {
      return undefined
    }

    const text = view.state.sliceDoc(range.from, range.to)

    if (!text.trim()) {
      return undefined
    }

    return {
      docId: currentDocumentId,
      path: openDocName,
      text,
    }
  }, [currentDocumentId, editorSelection, openDocName, view])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || !selectedProvider || !selectedModel) {
      return
    }

    setSubmitting(true)
    setChatError(null)
    setAnswer(null)
    setStreamedAnswer('')
    setAgentAnswer('')
    if (mode === 'chat') {
      const history = chatMessages.map(message => ({
        role: message.role,
        content: message.content,
      }))
      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmedPrompt,
        providerName: selectedProvider.name,
        model: selectedModel,
      }
      setChatMessages(currentMessages => [
        ...currentMessages,
        userMessage,
      ])

      try {
        let streamedText = ''
        const response = await sendProjectAiChatStream(
          projectId,
          {
            prompt: trimmedPrompt,
            providerId: selectedProvider.id,
            model: selectedModel,
            selection,
            history,
          },
          delta => {
            streamedText += delta
            setStreamedAnswer(currentAnswer => currentAnswer + delta)
          }
        )
        setAnswer(response)
        setChatMessages(currentMessages => [
          ...currentMessages,
          {
            role: 'assistant',
            content: response.answer || streamedText,
            providerName: selectedProvider.name,
            model: response.model,
          },
        ])
        setStreamedAnswer('')
      } catch (error) {
        setChatMessages(currentMessages =>
          currentMessages.filter(message => message !== userMessage)
        )
        setChatError(getErrorMessage(error))
      }
      setSubmitting(false)
      return
    }

    try {
      await runAgent(trimmedPrompt)
    } catch (error) {
      setChatError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function runAgent(trimmedPrompt: string) {
    const session =
      agentSession ??
      (
        await createProjectAiAgentSession(projectId, {
          task: trimmedPrompt,
          providerId: selectedProvider?.id,
          model: selectedModel ?? undefined,
        })
      ).session

    if (!agentSession) {
      setAgentEvents([])
    }
    setAgentSession(session)
    const response = await sendProjectAiAgentTurnStream(
      projectId,
      session.id,
      {
        prompt: trimmedPrompt,
        providerId: selectedProvider?.id,
        model: selectedModel ?? undefined,
        selection,
      },
      event => {
        setAgentEvents(currentEvents => [...currentEvents, event])
      }
    )
    setAgentSession(response.session)
    setAgentAnswer(response.answer)
  }

  async function handleStartAct() {
    if (!agentSession) {
      return
    }

    setStartingAct(true)
    setChatError(null)
    try {
      const response = await startProjectAiAgentAct(projectId, agentSession.id)
      setAgentSession(response.session)
      setAgentEvents(currentEvents => [
        ...currentEvents,
        {
          id: `local-mode-${Date.now()}`,
          sessionId: response.session.id,
          sequence: Number.MAX_SAFE_INTEGER,
          type: 'mode_changed',
          payload: { from: 'plan', to: 'act' },
          createdAt: null,
        },
      ])
    } catch (error) {
      setChatError(getErrorMessage(error))
    } finally {
      setStartingAct(false)
    }
  }

  return (
    <div className="ai-assistant-panel">
      <RailPanelHeader title={t('ai_assistant')} />
      <div className="ai-assistant-panel-body">
        {!config && !configError && (
          <div className="ai-assistant-muted" role="status">
            {t('ai_assistant_loading')}
          </div>
        )}

        {configError && (
          <div className="ai-assistant-empty">
            <h5>{t('ai_assistant_config_unavailable')}</h5>
            <p>{configError}</p>
          </div>
        )}

        {config?.providers.length === 0 && (
          <div className="ai-assistant-empty">
            <h5>{t('ai_assistant_no_provider_configured')}</h5>
            <p>{t('ai_assistant_no_provider_description')}</p>
          </div>
        )}

        {selectedProvider && selectedModel && (
          <>
            <ProviderSelector
              providers={config?.providers ?? []}
              selectedProvider={selectedProvider}
              t={t}
              onProviderChange={providerId => {
                const nextProvider = config?.providers.find(
                  provider => provider.id === providerId
                )
                setSelectedProviderId(providerId)
                setSelectedModel(getDefaultModel(nextProvider))
              }}
            />

            <div
              className="ai-assistant-mode-switch"
              aria-label={t('ai_assistant_mode')}
            >
              <button
                type="button"
                className={mode === 'chat' ? 'active' : ''}
                aria-pressed={mode === 'chat'}
                onClick={() => setMode('chat')}
              >
                {t('chat')}
              </button>
              <button
                type="button"
                className={mode === 'agent' ? 'active' : ''}
                aria-pressed={mode === 'agent'}
                onClick={() => setMode('agent')}
              >
                {t('ai_assistant_agent_mode')}
              </button>
            </div>

            <div className="ai-assistant-context-strip">
              {selection
                ? t('ai_assistant_using_current_selection')
                : t('ai_assistant_using_project_context')}
            </div>

            {mode === 'agent' && agentConfig && (
              <AgentRunControls
                session={agentSession}
                t={t}
                onStartAct={handleStartAct}
                startingAct={startingAct}
              />
            )}

            <div className="ai-assistant-transcript" aria-live="polite">
              {mode === 'chat' &&
                chatMessages.map((message, index) => (
                  <ChatTranscriptMessage
                    message={message}
                    t={t}
                    key={`${message.role}-${index}`}
                  />
                ))}
              {mode === 'chat' && streamedAnswer && (
                <div className="ai-assistant-message ai-assistant-message-assistant">
                  <div className="ai-assistant-message-meta">
                    {t('ai_assistant_response_meta', {
                      provider: selectedProvider.name,
                      model: selectedModel,
                    })}
                  </div>
                  <div className="ai-assistant-answer-text">
                    {streamedAnswer}
                  </div>
                </div>
              )}
              {mode === 'agent' && agentEvents.length > 0 && (
                <AgentEventList
                  events={agentEvents}
                  projectId={projectId}
                  t={t}
                  onSessionStatusChange={status => {
                    setAgentSession(currentSession =>
                      currentSession
                        ? { ...currentSession, status }
                        : currentSession
                    )
                  }}
                />
              )}
              {mode === 'agent' && agentAnswer && (
                <div className="ai-assistant-message ai-assistant-message-assistant">
                  <div className="ai-assistant-message-meta">
                    {t('ai_assistant_agent_name')}
                  </div>
                  <div className="ai-assistant-answer-text">{agentAnswer}</div>
                </div>
              )}
            </div>

            <form
              className="ai-assistant-composer"
              data-testid="ai-assistant-composer"
              onSubmit={handleSubmit}
            >
              <label htmlFor="ai-assistant-prompt">
                {t('ai_assistant_prompt_label')}
              </label>
              <textarea
                id="ai-assistant-prompt"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder={t('ai_assistant_prompt_placeholder')}
                rows={4}
              />
              <div className="ai-assistant-composer-footer">
                <ComposerModelSelector
                  selectedModel={selectedModel}
                  enabledModels={enabledModels}
                  t={t}
                  onModelChange={setSelectedModel}
                />
                <OLButton
                  type="submit"
                  variant="primary"
                  disabled={!prompt.trim() || submitting}
                  isLoading={submitting}
                  loadingLabel={t('ai_assistant_sending')}
                >
                  {mode === 'agent'
                    ? agentSubmitLabel(agentSession, t)
                    : t('send')}
                </OLButton>
              </div>
            </form>

            {chatError && (
              <div className="ai-assistant-error">
                <h5>{t('ai_assistant_request_failed')}</h5>
                <p>{chatError}</p>
              </div>
            )}

            {answer && (
              <div className="ai-assistant-answer">
                {answer.context.includedFiles.length > 0 && (
                  <div className="ai-assistant-context-files">
                    <h5>{t('ai_assistant_context_used')}</h5>
                    <ul>
                      {answer.context.includedFiles.map(file => (
                        <li key={file}>{file}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ChatTranscriptMessage({
  message,
  t,
}: {
  message: ChatMessage
  t: TFunction
}) {
  return (
    <div
      className={`ai-assistant-message ai-assistant-message-${message.role}`}
    >
      <div className="ai-assistant-message-meta">
        {message.role === 'user'
          ? t('you')
          : t('ai_assistant_response_meta', {
              provider: message.providerName || '',
              model: message.model || '',
            })}
      </div>
      <div className="ai-assistant-answer-text">{message.content}</div>
    </div>
  )
}

function AgentRunControls({
  session,
  t,
  onStartAct,
  startingAct,
}: {
  session: ProjectAiAgentSession | null
  t: TFunction
  onStartAct: () => void
  startingAct: boolean
}) {
  const canStartAct =
    session?.mode === 'plan' &&
    ['waiting_for_act', 'completed'].includes(session.status)

  return (
    <div className="ai-assistant-agent-controls">
      <span>{session ? formatAgentMode(session, t) : t('ai_assistant_plan')}</span>
      <OLButton
        type="button"
        size="sm"
        variant="secondary"
        disabled={!canStartAct || startingAct}
        isLoading={startingAct}
        loadingLabel={t('ai_assistant_starting')}
        onClick={onStartAct}
      >
        {t('ai_assistant_start_act')}
      </OLButton>
    </div>
  )
}

function AgentEventList({
  events,
  projectId,
  t,
  onSessionStatusChange,
}: {
  events: ProjectAiAgentEvent[]
  projectId: string
  t: TFunction
  onSessionStatusChange: (status: ProjectAiAgentSession['status']) => void
}) {
  return (
    <div className="ai-assistant-agent-events">
      {events.map((event, index) => (
        <div
          className="ai-assistant-agent-event"
          key={`${event.id}-${event.sequence}-${index}`}
        >
          <div className="ai-assistant-message-meta">
            {formatAgentEventTitle(event, t)}
          </div>
          {event.type === 'patch_created' && isAgentPatch(event.payload.patch) ? (
            <AgentPatchReview
              initialPatch={event.payload.patch}
              projectId={projectId}
              t={t}
              onSessionStatusChange={onSessionStatusChange}
            />
          ) : (
            <div className="ai-assistant-answer-text">
              {formatAgentEventPayload(event, t)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function formatAgentEventTitle(event: ProjectAiAgentEvent, t: TFunction) {
  if (event.type === 'patch_created') {
    return t('ai_assistant_patch_review')
  }
  if (event.type === 'patch_applied') {
    return t('ai_assistant_patch_applied')
  }
  if (event.type === 'tool_call') {
    return t('ai_assistant_tool_call', {
      name: String(event.payload.name ?? ''),
    })
  }
  if (event.type === 'tool_result') {
    return t('ai_assistant_tool_result', {
      name: String(event.payload.name ?? ''),
    })
  }
  if (event.type === 'mode_changed') {
    return t('ai_assistant_mode_changed')
  }
  if (event.type === 'permission_denied') {
    return t('ai_assistant_permission_denied', {
      name: String(event.payload.name ?? ''),
    })
  }
  if (event.type === 'error') {
    return t('ai_assistant_agent_error')
  }
  return t('ai_assistant_agent_message')
}

function formatAgentEventPayload(event: ProjectAiAgentEvent, t: TFunction) {
  const payload = event.payload
  if (typeof payload.content === 'string') {
    return payload.content
  }
  if (Array.isArray(payload.enabledSkillIds)) {
    return t('ai_assistant_skills_summary', {
      skills: payload.enabledSkillIds.join(', ') || t('ai_assistant_none'),
    })
  }
  if (typeof payload.message === 'string') {
    return payload.message
  }
  if (typeof payload.reason === 'string') {
    return payload.reason
  }
  if (typeof payload.from === 'string' && typeof payload.to === 'string') {
    return `${payload.from} -> ${payload.to}`
  }
  return JSON.stringify(payload, null, 2)
}

function AgentPatchReview({
  initialPatch,
  projectId,
  t,
  onSessionStatusChange,
}: {
  initialPatch: ProjectAiAgentPatch
  projectId: string
  t: TFunction
  onSessionStatusChange: (status: ProjectAiAgentSession['status']) => void
}) {
  const [patch, setPatch] = useState(initialPatch)
  const [applying, setApplying] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApply() {
    setApplying(true)
    setError(null)
    try {
      const response = await applyProjectAiAgentPatch(projectId, patch.id)
      setPatch(response.patch)
      onSessionStatusChange('completed')
    } catch (applyError) {
      setError(getErrorMessage(applyError))
    } finally {
      setApplying(false)
    }
  }

  async function handleReject() {
    setRejecting(true)
    setError(null)
    try {
      const response = await rejectProjectAiAgentPatch(projectId, patch.id)
      setPatch(response.patch)
      onSessionStatusChange('completed')
    } catch (rejectError) {
      setError(getErrorMessage(rejectError))
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="ai-assistant-agent-patch">
      <div className="ai-assistant-agent-patch-header">
        <span>{patch.summary || t('ai_assistant_proposed_edit')}</span>
        <span className={`ai-assistant-agent-patch-status ${patch.status}`}>
          {patch.status}
        </span>
      </div>
      {patch.operations.map(operation => (
        <div className="ai-assistant-agent-patch-file" key={operation.path}>
          <div className="ai-assistant-agent-patch-path">{operation.path}</div>
          <pre className="ai-assistant-agent-patch-diff">
            {operation.diff.lines.map((line, index) => (
              <DiffLine line={line} key={`${operation.path}-${index}`} />
            ))}
          </pre>
        </div>
      ))}
      {error && <div className="ai-assistant-agent-patch-error">{error}</div>}
      {patch.compileResult && (
        <div className="ai-assistant-agent-compile-result">
          {t('ai_assistant_compile_status', {
            status: patch.compileResult.status,
          })}
        </div>
      )}
      <div className="ai-assistant-agent-patch-actions">
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={patch.status !== 'pending' || rejecting || applying}
          isLoading={rejecting}
          loadingLabel={t('ai_assistant_rejecting')}
          onClick={handleReject}
        >
          {t('reject')}
        </OLButton>
        <OLButton
          type="button"
          size="sm"
          variant="primary"
          disabled={patch.status !== 'pending' || applying || rejecting}
          isLoading={applying}
          loadingLabel={t('ai_assistant_applying')}
          onClick={handleApply}
        >
          {t('ai_assistant_apply_patch')}
        </OLButton>
      </div>
    </div>
  )
}

function DiffLine({ line }: { line: ProjectAiAgentPatchDiffLine }) {
  const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
  return (
    <span className={`ai-assistant-agent-patch-line ${line.type}`}>
      {prefix}
      {line.content}
      {'\n'}
    </span>
  )
}

function isAgentPatch(value: unknown): value is ProjectAiAgentPatch {
  if (!value || typeof value !== 'object') {
    return false
  }
  const patch = value as Partial<ProjectAiAgentPatch>
  return (
    typeof patch.id === 'string' &&
    typeof patch.status === 'string' &&
    Array.isArray(patch.operations)
  )
}

function ProviderSelector({
  providers,
  selectedProvider,
  t,
  onProviderChange,
}: {
  providers: ProjectAiProvider[]
  selectedProvider: ProjectAiProvider
  t: TFunction
  onProviderChange: (providerId: string) => void
}) {
  return (
    <div className="ai-assistant-provider">
      {providers.length > 1 ? (
        <div>
          <span className="ai-assistant-label">{t('ai_assistant_provider')}</span>
          <OLFormSelect
            aria-label={t('ai_assistant_provider')}
            value={selectedProvider.id}
            onChange={event => onProviderChange(event.target.value)}
          >
            {providers.map(provider => (
              <option value={provider.id} key={provider.id}>
                {provider.name}
              </option>
            ))}
          </OLFormSelect>
        </div>
      ) : (
        <div>
          <span className="ai-assistant-label">{t('ai_assistant_provider')}</span>
          <span>{selectedProvider.name}</span>
        </div>
      )}
    </div>
  )
}

function ComposerModelSelector({
  selectedModel,
  enabledModels,
  t,
  onModelChange,
}: {
  selectedModel: string
  enabledModels: ProjectAiProvider['models']
  t: TFunction
  onModelChange: (model: string) => void
}) {
  return (
    <div className="ai-assistant-model-select">
      <OLFormSelect
        aria-label={t('ai_assistant_model')}
        value={selectedModel}
        onChange={event => onModelChange(event.target.value)}
      >
        {enabledModels.map(model => (
          <option value={model.id} key={model.id}>
            {model.displayName}
          </option>
        ))}
      </OLFormSelect>
    </div>
  )
}

function getDefaultModel(provider?: ProjectAiProvider | null) {
  if (!provider) {
    return null
  }

  const enabledModels = provider.models.filter(model => model.enabled)
  return (
    provider.defaultModel ??
    enabledModels[0]?.id ??
    provider.models[0]?.id ??
    null
  )
}

function agentSubmitLabel(session: ProjectAiAgentSession | null, t: TFunction) {
  if (!session) {
    return t('ai_assistant_plan')
  }
  if (session.mode === 'act') {
    return t('ai_assistant_run')
  }
  return t('ai_assistant_plan')
}

function formatAgentMode(session: ProjectAiAgentSession, t: TFunction) {
  if (session.mode === 'act') {
    return session.status === 'waiting_for_approval'
      ? t('ai_assistant_act_review')
      : t('ai_assistant_act_ready')
  }
  if (session.status === 'waiting_for_act') {
    return t('ai_assistant_plan_ready')
  }
  return t('ai_assistant_plan')
}

function getErrorMessage(error: unknown) {
  if (error instanceof FetchError) {
    return error.getUserFacingMessage()
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}
