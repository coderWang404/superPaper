import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import RailPanelHeader from '@/features/ide-react/components/rail/rail-panel-header'
import { useRailContext } from '@/features/ide-react/context/rail-context'
import { useProjectContext } from '@/shared/context/project-context'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { useEditorSelectionContext } from '@/shared/context/editor-selection-context'
import { useEditorViewContext } from '@/features/ide-react/context/editor-view-context'
import OLButton from '@/shared/components/ol/ol-button'
import OLFormSelect from '@/shared/components/ol/ol-form-select'
import { FetchError } from '@/infrastructure/fetch-json'
import MaterialIcon from '@/shared/components/material-icon'
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
  rollbackProjectAiAgentPatch,
  sendProjectAiAgentTurnStream,
  startProjectAiAgentAct,
  type ProjectAiAgentConfig,
  type ProjectAiAgentEvent,
  type ProjectAiAgentPatch,
  type ProjectAiAgentPatchDiffLine,
  type ProjectAiAgentSession,
} from '@/features/ai-agent/api'
import AiMarkdown from './ai-markdown'

type AssistantMode = 'chat' | 'agent'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  providerName?: string
  model?: string
}

const PROMPT_SUGGESTION_KEYS = [
  'ai_assistant_suggestion_explain',
  'ai_assistant_suggestion_compile',
  'ai_assistant_suggestion_improve',
]

export default function AiAssistantPanel() {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const { openTab } = useRailContext()
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
  const selectedModelName =
    enabledModels.find(model => model.id === selectedModel)?.displayName ||
    selectedModel

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
            <div className="ai-assistant-workbench-bar">
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
              <button
                type="button"
                className="ai-assistant-settings-link"
                onClick={() => openTab('agent-settings')}
              >
                {t('agent_settings')}
              </button>
            </div>

            <div className="ai-assistant-provider-card">
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
              <ComposerModelSelector
                selectedModel={selectedModel}
                enabledModels={enabledModels}
                t={t}
                onModelChange={setSelectedModel}
              />
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
                  <AiMarkdown content={streamedAnswer} streaming />
                </div>
              )}
              {mode === 'agent' && agentAnswer && (
                <AgentResult answer={agentAnswer} t={t} />
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
              {chatMessages.length === 0 &&
                agentEvents.length === 0 &&
                !streamedAnswer &&
                !agentAnswer && (
                  <div className="ai-assistant-welcome">
                    <h5>{t('ai_assistant_welcome_title')}</h5>
                    <p>{t('ai_assistant_welcome_description')}</p>
                    <div className="ai-assistant-suggestions">
                      {PROMPT_SUGGESTION_KEYS.map(key => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => setPrompt(t(key))}
                        >
                          {t(key)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <form
              className="ai-assistant-composer"
              data-testid="ai-assistant-composer"
              onSubmit={handleSubmit}
            >
              <label htmlFor="ai-assistant-prompt">
                <span>{t('ai_assistant_prompt_label')}</span>
                <em id="ai-assistant-prompt-context">
                  {selection
                    ? t('ai_assistant_using_current_selection')
                    : t('ai_assistant_using_project_context')}
                </em>
              </label>
              <textarea
                id="ai-assistant-prompt"
                aria-label={t('ai_assistant_prompt_label')}
                aria-describedby="ai-assistant-prompt-context"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder={t('ai_assistant_prompt_placeholder')}
                rows={4}
              />
              <div className="ai-assistant-composer-footer">
                <span className="ai-assistant-current-model">
                  {selectedProvider.name} · {selectedModelName}
                </span>
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
      {message.role === 'assistant' ? (
        <AiMarkdown content={message.content} />
      ) : (
        <div className="ai-assistant-answer-text">{message.content}</div>
      )}
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
  const patchEvents = events.flatMap(event => {
    if (event.type !== 'patch_created' || !isAgentPatch(event.payload.patch)) {
      return []
    }
    return [{ event, patch: event.payload.patch }]
  })
  const patchEventIds = new Set(patchEvents.map(({ event }) => event.id))
  const worklogEvents = events.filter(
    event => !patchEventIds.has(event.id) && !isFinalAgentMessage(event)
  )

  return (
    <div className="ai-assistant-agent-stack">
      {patchEvents.map(({ event, patch }, index) => (
        <div
          className="ai-assistant-agent-patch-card"
          key={`${event.id}-${event.sequence}-${index}`}
        >
          <div className="ai-assistant-agent-event-summary static">
            <span className="ai-assistant-agent-event-title">
              {formatAgentEventTitle(event, t)}
            </span>
            <span className="ai-assistant-agent-event-snippet">
              {formatAgentEventSnippet(event, t)}
            </span>
          </div>
          <AgentPatchReview
            initialPatch={patch}
            projectId={projectId}
            t={t}
            onSessionStatusChange={onSessionStatusChange}
          />
        </div>
      ))}
      {worklogEvents.length > 0 && (
        <details className="ai-assistant-agent-events" open>
          <summary className="ai-assistant-agent-events-summary">
            <span>{t('ai_assistant_agent_worklog')}</span>
            <span className="ai-assistant-agent-events-count">
              {t('ai_assistant_agent_worklog_count', {
                count: worklogEvents.length,
              })}
            </span>
            <MaterialIcon type="expand_more" />
          </summary>
          <div className="ai-assistant-agent-events-body">
            {worklogEvents.map((event, index) => {
              const isFinalMessage = isFinalAgentMessage(event)
              return (
                <details
                  className="ai-assistant-agent-event"
                  key={`${event.id}-${event.sequence}-${index}`}
                >
                  <summary className="ai-assistant-agent-event-summary">
                    <span className="ai-assistant-agent-event-title">
                      {formatAgentEventTitle(event, t)}
                    </span>
                    <span className="ai-assistant-agent-event-snippet">
                      {formatAgentEventSnippet(event, t)}
                    </span>
                    <MaterialIcon type="expand_more" />
                  </summary>
                  <div className="ai-assistant-agent-event-body">
                    {shouldRenderAgentEventAsMarkdown(event) &&
                    !isFinalMessage ? (
                      <AiMarkdown content={formatAgentEventPayload(event, t)} />
                    ) : (
                      <div className="ai-assistant-answer-text">
                        {formatAgentEventPayload(event, t)}
                      </div>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}

function AgentResult({ answer, t }: { answer: string; t: TFunction }) {
  return (
    <div className="ai-assistant-agent-result">
      <div className="ai-assistant-message-meta">
        {t('ai_assistant_agent_result')}
      </div>
      <AiMarkdown content={answer} />
    </div>
  )
}

function formatAgentEventTitle(event: ProjectAiAgentEvent, t: TFunction) {
  if (event.type === 'message') {
    if (event.payload.kind === 'plan') {
      return t('ai_assistant_agent_plan')
    }
    if (event.payload.kind === 'final') {
      return t('ai_assistant_agent_result')
    }
    if (event.payload.kind === 'context') {
      return t('ai_assistant_agent_context')
    }
  }
  if (event.type === 'patch_created') {
    return t('ai_assistant_patch_review')
  }
  if (event.type === 'patch_applied') {
    return t('ai_assistant_patch_applied')
  }
  if (event.type === 'patch_rolled_back') {
    return t('ai_assistant_patch_rolled_back')
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

function formatAgentEventSnippet(event: ProjectAiAgentEvent, t: TFunction) {
  if (event.type === 'tool_call') {
    const payload = event.payload
    const name = String(payload.name ?? '')
    const input = formatToolInputSummary(payload.input)
    return input ? `${name}${input}` : name
  }
  if (event.type === 'tool_result') {
    const payload = event.payload
    const name = String(payload.name ?? '')
    const result = summarizeAgentToolResult(payload)
    return result ? `${name} - ${result}` : name
  }
  if (event.type === 'patch_created' && isAgentPatch(event.payload.patch)) {
    const patch = event.payload.patch
    return patch.summary || t('ai_assistant_proposed_edit')
  }
  if (event.type === 'mode_changed') {
    return formatAgentEventPayload(event, t)
  }
  if (event.type === 'permission_denied') {
    return formatAgentEventPayload(event, t)
  }
  if (event.type === 'error') {
    return formatAgentEventPayload(event, t)
  }
  if (event.type === 'message') {
    const payload = event.payload
    if (payload.role === 'assistant' && typeof payload.content === 'string') {
      return summarizeText(payload.content)
    }
    if (payload.role === 'system' && typeof payload.kind === 'string') {
      return payload.kind
    }
  }
  return formatAgentEventPayload(event, t)
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

function formatToolInputSummary(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ''
  }
  const entries = Object.entries(input as Record<string, unknown>)
  if (!entries.length) {
    return ''
  }
  const first = entries
    .slice(0, 2)
    .map(([key, value]) => `${key}=${formatPreviewValue(value)}`)
    .join(', ')
  return first ? ` - ${first}` : ''
}

function summarizeAgentToolResult(payload: Record<string, unknown>) {
  if (payload.ok === false) {
    const error = payload.error
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string' && message.trim()) {
        return message
      }
    }
    return 'failed'
  }
  const result = payload.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return 'ok'
  }
  if ('patchId' in result && typeof result.patchId === 'string') {
    const summary = (result as Record<string, unknown>).summary
    return summary && typeof summary === 'string'
      ? `patch ${result.patchId} - ${summary}`
      : `patch ${result.patchId}`
  }
  return Object.entries(result as Record<string, unknown>)
    .slice(0, 2)
    .map(([key, value]) => `${key}=${formatPreviewValue(value)}`)
    .join(', ')
}

function formatPreviewValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 28 ? `${trimmed.slice(0, 25)}...` : trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `${value.length} items`
  }
  if (value && typeof value === 'object') {
    return '{...}'
  }
  return String(value ?? '')
}

function summarizeText(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return ''
  }
  return cleaned.length > 96 ? `${cleaned.slice(0, 93)}...` : cleaned
}

function shouldRenderAgentEventAsMarkdown(event: ProjectAiAgentEvent) {
  return (
    event.type === 'message' &&
    event.payload.role === 'assistant' &&
    typeof event.payload.content === 'string'
  )
}

function isFinalAgentMessage(event: ProjectAiAgentEvent) {
  return (
    event.type === 'message' &&
    event.payload.role === 'assistant' &&
    event.payload.kind === 'final' &&
    typeof event.payload.content === 'string'
  )
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
  const [rollingBack, setRollingBack] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = applying || rejecting || rollingBack

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

  async function handleRollback() {
    setRollingBack(true)
    setError(null)
    try {
      const response = await rollbackProjectAiAgentPatch(projectId, patch.id)
      setPatch(response.patch)
      onSessionStatusChange('completed')
    } catch (rollbackError) {
      setError(getErrorMessage(rollbackError))
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="ai-assistant-agent-patch">
      <div className="ai-assistant-agent-patch-header">
        <span>{patch.summary || t('ai_assistant_proposed_edit')}</span>
        <span
          className={`ai-assistant-agent-patch-status ${patchStatusClassName(
            patch.status
          )}`}
        >
          {formatPatchStatus(patch.status, t)}
        </span>
      </div>
      <details className="ai-assistant-agent-patch-details">
        <summary className="ai-assistant-agent-patch-summary">
          {t('ai_assistant_patch_details')}
          <MaterialIcon type="expand_more" />
        </summary>
        <div className="ai-assistant-agent-patch-body">
          {patch.operations.map(operation => (
            <div className="ai-assistant-agent-patch-file" key={operation.path}>
              <div className="ai-assistant-agent-patch-path">
                {operation.path}
              </div>
              <pre className="ai-assistant-agent-patch-diff">
                {operation.diff.lines.map((line, index) => (
                  <DiffLine line={line} key={`${operation.path}-${index}`} />
                ))}
              </pre>
            </div>
          ))}
        </div>
      </details>
      {error && <div className="ai-assistant-agent-patch-error">{error}</div>}
      {patch.compileResult && (
        <div className="ai-assistant-agent-compile-result">
          {t('ai_assistant_compile_status', {
            status: patch.compileResult.status,
          })}
        </div>
      )}
      <div className="ai-assistant-agent-patch-actions">
        {patch.status === 'pending' && (
          <>
            <OLButton
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
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
              disabled={busy}
              isLoading={applying}
              loadingLabel={t('ai_assistant_applying')}
              onClick={handleApply}
            >
              {t('ai_assistant_apply_patch')}
            </OLButton>
          </>
        )}
        {patch.status === 'applied' && patch.rollbackAvailable && (
          <OLButton
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            isLoading={rollingBack}
            loadingLabel={t('ai_assistant_rolling_back')}
            onClick={handleRollback}
          >
            {t('ai_assistant_rollback_patch')}
          </OLButton>
        )}
      </div>
    </div>
  )
}

function patchStatusClassName(status: ProjectAiAgentPatch['status']) {
  return status.replaceAll('_', '-')
}

function formatPatchStatus(status: ProjectAiAgentPatch['status'], t: TFunction) {
  if (status === 'rolled_back') {
    return t('ai_assistant_patch_status_rolled_back')
  }
  if (status === 'applied') {
    return t('ai_assistant_patch_status_applied')
  }
  if (status === 'rejected') {
    return t('ai_assistant_patch_status_rejected')
  }
  if (status === 'conflicted') {
    return t('ai_assistant_patch_status_conflicted')
  }
  return status
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
      <span className="ai-assistant-label">{t('ai_assistant_provider')}</span>
      {providers.length > 1 ? (
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
      ) : (
        <strong>{selectedProvider.name}</strong>
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
      <span className="ai-assistant-label">{t('ai_assistant_model')}</span>
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
