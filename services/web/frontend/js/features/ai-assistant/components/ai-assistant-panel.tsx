import {
  Dispatch,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import MaterialIcon from '@/shared/components/material-icon'
import usePersistedState from '@/shared/hooks/use-persisted-state'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import localStorage from '@/infrastructure/local-storage'
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
  rollbackProjectAiAgentSessionCheckpoint,
  sendProjectAiAgentTurnStream,
  startProjectAiAgentAct,
  type ProjectAiAgentConfig,
  type ProjectAiAgentEvent,
  type ProjectAiAgentPatch,
  type ProjectAiAgentPatchDiffLine,
  type ProjectAiAgentSession,
} from '@/features/ai-agent/api'
import AiMarkdown from './ai-markdown'
import {
  AI_ASSISTANT_PREFILL_EVENT,
  clearPendingAiAssistantPrefill,
  consumePendingAiAssistantPrefill,
  type AiAssistantPrefill,
} from '@/features/ai-assistant/util/agent-prefill'

type AssistantMode = 'chat' | 'agent'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  providerName?: string
  model?: string
  context?: ProjectAiChatResponse['context']
}

type ChatConversation = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

type SetChatConversations = Dispatch<SetStateAction<ChatConversation[]>>

const PROMPT_SUGGESTION_KEYS = [
  'ai_assistant_suggestion_explain',
  'ai_assistant_suggestion_compile',
  'ai_assistant_suggestion_improve',
]
const AGENT_PROMPT_SUGGESTION_KEYS = [
  'ai_assistant_agent_suggestion_review',
  'ai_assistant_agent_suggestion_compile',
  'ai_assistant_agent_suggestion_improve',
]
const AGENT_SESSION_RESTART_STATUSES = new Set(['failed', 'cancelled'])
const READABLE_AGENT_MESSAGE_KINDS = new Set(['context', 'plan'])
const AGENT_RESULT_PREVIEW_CHARS = 900
const AGENT_RESULT_PREVIEW_LINES = 12
const DEFAULT_CHAT_CONVERSATION_ID = 'chat-1'
const CHAT_TITLE_MAX_LENGTH = 58

export default function AiAssistantPanel() {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const { currentDocumentId, openDocName } = useEditorOpenDocContext()
  const { editorSelection } = useEditorSelectionContext()
  const { view } = useEditorViewContext()
  const storagePrefix = useMemo(
    () => `superpaper.ai-assistant.${projectId}`,
    [projectId]
  )
  const [config, setConfig] = useState<ProjectAiConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [prompt, setPrompt] = usePersistedState<string>(
    `${storagePrefix}.prompt`,
    ''
  )
  const [selectedProviderId, setSelectedProviderId] = usePersistedState<
    string | null
  >(`${storagePrefix}.provider`, null)
  const [selectedModel, setSelectedModel] = usePersistedState<string | null>(
    `${storagePrefix}.model`,
    null
  )
  const [streamedAnswer, setStreamedAnswer] = useState('')
  const initialChatConversations = useMemo(
    () => getInitialChatConversations(storagePrefix),
    [storagePrefix]
  )
  const [chatConversations, setChatConversations] = usePersistedState<
    ChatConversation[]
  >(
    `${storagePrefix}.chat-conversations`,
    initialChatConversations
  )
  const [activeChatConversationId, setActiveChatConversationId] =
    usePersistedState<string | null>(
      `${storagePrefix}.active-chat-conversation`,
      initialChatConversations[0]?.id ?? DEFAULT_CHAT_CONVERSATION_ID
    )
  const normalizedChatConversations = useMemo(
    () => normalizeChatConversations(chatConversations),
    [chatConversations]
  )
  const activeChatConversation =
    normalizedChatConversations.find(
      conversation => conversation.id === activeChatConversationId
    ) ??
    normalizedChatConversations[0] ??
    createEmptyChatConversation(DEFAULT_CHAT_CONVERSATION_ID)
  const chatMessages = activeChatConversation.messages
  const activeChatConversationTitle = getChatConversationDisplayTitle(
    activeChatConversation,
    t
  )
  const [agentConfig, setAgentConfig] = useState<ProjectAiAgentConfig | null>(
    null
  )
  const [agentSession, setAgentSession] =
    usePersistedState<ProjectAiAgentSession | null>(
      `${storagePrefix}.agent-session`,
      null
    )
  const [agentEvents, setAgentEvents] = usePersistedState<
    ProjectAiAgentEvent[]
  >(`${storagePrefix}.agent-events`, [])
  const [agentAnswer, setAgentAnswer] = usePersistedState<string>(
    `${storagePrefix}.agent-answer`,
    ''
  )
  const [chatError, setChatError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [startingAct, setStartingAct] = useState(false)
  const [mode, setMode] = usePersistedState<AssistantMode>(
    `${storagePrefix}.mode`,
    'chat'
  )

  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamedAnswer, agentEvents, agentAnswer])

  useEffect(() => {
    function applyPrefill(prefill: AiAssistantPrefill | null) {
      if (!prefill || prefill.projectId !== projectId) {
        return
      }

      setMode(prefill.mode)
      setPrompt(prefill.prompt)
      clearPendingAiAssistantPrefill(projectId)
      window.setTimeout(() => {
        document.getElementById('ai-assistant-prompt')?.focus()
      }, 0)
    }

    applyPrefill(consumePendingAiAssistantPrefill(projectId))

    const handlePrefill = (event: Event) => {
      applyPrefill((event as CustomEvent<AiAssistantPrefill>).detail)
    }

    window.addEventListener(AI_ASSISTANT_PREFILL_EVENT, handlePrefill)
    return () => {
      window.removeEventListener(AI_ASSISTANT_PREFILL_EVENT, handlePrefill)
    }
  }, [projectId, setMode, setPrompt])

  useEffect(() => {
    if (normalizedChatConversations.length === 0) {
      const conversation = createEmptyChatConversation(
        DEFAULT_CHAT_CONVERSATION_ID
      )
      setChatConversations([conversation])
      setActiveChatConversationId(conversation.id)
      return
    }

    if (
      !activeChatConversationId ||
      !normalizedChatConversations.some(
        conversation => conversation.id === activeChatConversationId
      )
    ) {
      setActiveChatConversationId(normalizedChatConversations[0].id)
    }
  }, [
    activeChatConversationId,
    normalizedChatConversations,
    setActiveChatConversationId,
    setChatConversations,
  ])

  useEffect(() => {
    let cancelled = false

    setConfigError(null)
    getProjectAiConfig(projectId)
      .then(nextConfig => {
        if (cancelled) {
          return
        }
        setConfig(nextConfig)
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
    if (!config) {
      return
    }
    const provider =
      config.providers.find(provider => provider.id === selectedProviderId) ??
      config.providers[0]
    const providerId = provider?.id ?? null
    const model = isEnabledModel(provider, selectedModel)
      ? selectedModel
      : getDefaultModel(provider)

    if (providerId !== selectedProviderId) {
      setSelectedProviderId(providerId)
    }
    if (model !== selectedModel) {
      setSelectedModel(model)
    }
  }, [
    config,
    selectedModel,
    selectedProviderId,
    setSelectedModel,
    setSelectedProviderId,
  ])

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
    setStreamedAnswer('')
    setAgentAnswer('')
    if (mode === 'chat') {
      const targetConversationId = activeChatConversation.id
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
      updateChatConversation(
        targetConversationId,
        conversation =>
          refreshChatConversation(conversation, [
            ...conversation.messages,
            userMessage,
          ]),
        setChatConversations
      )

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
        updateChatConversation(
          targetConversationId,
          conversation =>
            refreshChatConversation(conversation, [
              ...conversation.messages,
              {
                role: 'assistant',
                content: response.answer || streamedText,
                providerName: selectedProvider.name,
                model: response.model,
                context: response.context,
              },
            ]),
          setChatConversations
        )
        setStreamedAnswer('')
        setPrompt('')
      } catch (error) {
        updateChatConversation(
          targetConversationId,
          conversation =>
            refreshChatConversation(
              conversation,
              conversation.messages.filter(message => message !== userMessage)
            ),
          setChatConversations
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
    const shouldStartNewSession = shouldStartNewAgentSession(agentSession)
    const session = shouldStartNewSession
      ? (
          await createProjectAiAgentSession(projectId, {
            task: trimmedPrompt,
            providerId: selectedProvider?.id,
            model: selectedModel ?? undefined,
          })
        ).session
      : agentSession

    if (shouldStartNewSession) {
      setAgentEvents([])
      setAgentAnswer('')
    }
    if (!session) {
      throw new Error('Agent session unavailable')
    }
    setAgentSession(session)
    try {
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
      if (response.session.mode === 'act') {
        setPrompt('')
      }
    } catch (error) {
      setAgentSession(currentSession =>
        currentSession?.id === session.id
          ? { ...currentSession, status: 'failed' }
          : currentSession
      )
      throw error
    }
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

  async function handleRollbackAgentCheckpoint(commitHash: string) {
    if (!agentSession) {
      return
    }

    setChatError(null)
    try {
      const response = await rollbackProjectAiAgentSessionCheckpoint(
        projectId,
        agentSession.id,
        commitHash
      )
      setAgentSession(response.session)
      setAgentEvents(currentEvents => [...currentEvents, response.event])
    } catch (error) {
      setChatError(getErrorMessage(error))
    }
  }

  function handleNewChat() {
    const conversation = createEmptyChatConversation(
      getNextChatConversationId(normalizedChatConversations)
    )
    setChatConversations(currentConversations => [
      ...normalizeChatConversations(currentConversations),
      conversation,
    ])
    setActiveChatConversationId(conversation.id)
    setStreamedAnswer('')
    setChatError(null)
  }

  function handleSelectChatConversation(conversationId: string) {
    setActiveChatConversationId(conversationId)
    setStreamedAnswer('')
    setChatError(null)
  }

  function handleClearChat() {
    updateChatConversation(
      activeChatConversation.id,
      conversation => refreshChatConversation(conversation, []),
      setChatConversations
    )
    setStreamedAnswer('')
    setChatError(null)
  }

  function handleApplyAssistantMessage(message: ChatMessage) {
    if (!view) {
      return
    }
    const insert = getInsertableAssistantContent(message.content)
    if (!insert) {
      return
    }
    const { from, to } = getEditorInsertRange(view, editorSelection)
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      scrollIntoView: true,
    })
    view.focus()
  }

  const showChatWelcome =
    mode === 'chat' && chatMessages.length === 0 && !streamedAnswer
  const showAgentWelcome =
    mode === 'agent' && agentEvents.length === 0 && !agentAnswer

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
                agentConfig={agentConfig}
                session={agentSession}
                t={t}
                onStartAct={handleStartAct}
                startingAct={startingAct}
              />
            )}

            {mode === 'chat' && (
              <ChatConversationToolbar
                activeConversationId={activeChatConversation.id}
                activeConversationTitle={activeChatConversationTitle}
                conversations={normalizedChatConversations}
                hasMessages={chatMessages.length > 0 || Boolean(streamedAnswer)}
                t={t}
                onClearChat={handleClearChat}
                onNewChat={handleNewChat}
                onSelectConversation={handleSelectChatConversation}
              />
            )}

            <div
              className="ai-assistant-transcript ai-assistant-transcript-readable"
              data-scroll-owner="panel"
              aria-live="polite"
            >
              {mode === 'chat' &&
                chatMessages.map((message, index) => (
                  <ChatTranscriptMessage
                    message={message}
                    t={t}
                    onApplyToEditor={
                      message.role === 'assistant' && view
                        ? () => handleApplyAssistantMessage(message)
                        : undefined
                    }
                    key={`${activeChatConversation.id}-${message.role}-${index}`}
                  />
                ))}
              {mode === 'chat' && streamedAnswer && (
                <div className="ai-assistant-message ai-assistant-message-assistant ai-assistant-message-document">
                  <div className="ai-assistant-message-header">
                    <div className="ai-assistant-message-meta">
                      {t('ai_assistant_response_meta', {
                        provider: selectedProvider.name,
                        model: selectedModel,
                      })}
                    </div>
                    <div
                      className="ai-assistant-streaming-status"
                      role="status"
                      aria-label={t('ai_assistant_streaming_response')}
                    >
                      <span aria-hidden="true" />
                      {t('ai_assistant_streaming_response')}
                    </div>
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
                  session={agentSession}
                  t={t}
                  onCheckpointRollback={handleRollbackAgentCheckpoint}
                  onSessionStatusChange={status => {
                    setAgentSession(currentSession =>
                      currentSession
                        ? { ...currentSession, status }
                        : currentSession
                    )
                  }}
                />
              )}
              {(showChatWelcome || showAgentWelcome) && (
                <div className="ai-assistant-welcome">
                  <h5>
                    {t(
                      mode === 'agent'
                        ? 'ai_assistant_agent_welcome_title'
                        : 'ai_assistant_welcome_title'
                    )}
                  </h5>
                  <p>
                    {t(
                      mode === 'agent'
                        ? 'ai_assistant_agent_welcome_description'
                        : 'ai_assistant_welcome_description'
                    )}
                  </p>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>

            {chatError && (
              <div className="ai-assistant-error">
                <h5>{t('ai_assistant_request_failed')}</h5>
                <p>{chatError}</p>
              </div>
            )}
          </>
        )}
      </div>

      {selectedProvider && selectedModel && (showChatWelcome || showAgentWelcome) && (
        <div className="ai-assistant-prompt-suggestion-bar">
          <PromptSuggestions mode={mode} t={t} onSelect={setPrompt} />
        </div>
      )}

      {selectedProvider && selectedModel && (
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
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (prompt.trim() && !submitting) handleSubmit(e as any)
              }
            }}
            placeholder={t(
              mode === 'agent'
                ? 'ai_assistant_agent_prompt_placeholder'
                : 'ai_assistant_prompt_placeholder'
            )}
            rows={4}
          />
          <div className="ai-assistant-composer-footer">
            <span className="ai-assistant-keyboard-hint">⌘↵ to send</span>
            <span className="ai-assistant-current-model">
              {selectedProvider.name} · {selectedModelName}
            </span>
            <OLButton
              type="submit"
              variant="primary"
              disabled={!prompt.trim() || submitting || (mode === 'agent' && !agentConfig)}
              isLoading={submitting}
              loadingLabel={t('ai_assistant_sending')}
            >
              {mode === 'agent'
                ? agentSubmitLabel(agentSession, t)
                : t('send')}
            </OLButton>
          </div>
        </form>
      )}
    </div>
  )
}

function PromptSuggestions({
  mode,
  t,
  onSelect,
}: {
  mode: AssistantMode
  t: TFunction
  onSelect: (prompt: string) => void
}) {
  const keys = mode === 'agent' ? AGENT_PROMPT_SUGGESTION_KEYS : PROMPT_SUGGESTION_KEYS

  return (
    <div className="ai-assistant-suggestions">
      {keys.map(key => (
        <button type="button" key={key} onClick={() => onSelect(t(key))}>
          {t(key)}
        </button>
      ))}
    </div>
  )
}

function ChatConversationToolbar({
  conversations,
  activeConversationId,
  activeConversationTitle,
  hasMessages,
  t,
  onSelectConversation,
  onNewChat,
  onClearChat,
}: {
  conversations: ChatConversation[]
  activeConversationId: string
  activeConversationTitle: string
  hasMessages: boolean
  t: TFunction
  onSelectConversation: (conversationId: string) => void
  onNewChat: () => void
  onClearChat: () => void
}) {
  return (
    <div className="ai-assistant-transcript-toolbar">
      <div className="ai-assistant-chat-conversation-select">
        <span className="ai-assistant-label">
          {t('ai_assistant_chat_history')}
        </span>
        <OLFormSelect
          aria-label={t('ai_assistant_conversation')}
          value={activeConversationId}
          onChange={event => onSelectConversation(event.target.value)}
        >
          {conversations.map(conversation => (
            <option value={conversation.id} key={conversation.id}>
              {getChatConversationDisplayTitle(conversation, t)}
            </option>
          ))}
        </OLFormSelect>
        <span className="ai-assistant-active-conversation">
          {t('ai_assistant_active_conversation', {
            title: activeConversationTitle,
          })}
        </span>
      </div>
      <div className="ai-assistant-transcript-toolbar-actions">
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={onNewChat}
        >
          <MaterialIcon type="add" />
          {t('ai_assistant_new_chat')}
        </OLButton>
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={!hasMessages}
          onClick={onClearChat}
        >
          {t('ai_assistant_clear_chat')}
        </OLButton>
      </div>
    </div>
  )
}

function getInitialChatConversations(storagePrefix: string) {
  const storedConversations = normalizeChatConversations(
    localStorage.getItem(`${storagePrefix}.chat-conversations`)
  )

  if (storedConversations.length > 0) {
    return storedConversations
  }

  const legacyMessages = normalizeChatMessages(
    localStorage.getItem(`${storagePrefix}.chat-messages`)
  )

  if (legacyMessages.length > 0) {
    return [
      refreshChatConversation(
        createEmptyChatConversation(DEFAULT_CHAT_CONVERSATION_ID),
        legacyMessages
      ),
    ]
  }

  return [createEmptyChatConversation(DEFAULT_CHAT_CONVERSATION_ID)]
}

function createEmptyChatConversation(id: string): ChatConversation {
  const timestamp = Date.now()
  return {
    id,
    title: '',
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function normalizeChatConversations(value: unknown): ChatConversation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((conversation, index) => {
    if (!conversation || typeof conversation !== 'object') {
      return []
    }

    const candidate = conversation as Partial<ChatConversation>
    const messages = normalizeChatMessages(candidate.messages)
    const fallbackId = `chat-${index + 1}`
    const id =
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : fallbackId
    const timestamp = Date.now()

    return [
      {
        id,
        title:
          typeof candidate.title === 'string'
            ? candidate.title
            : getChatConversationTitle(messages),
        messages,
        createdAt:
          typeof candidate.createdAt === 'number'
            ? candidate.createdAt
            : timestamp,
        updatedAt:
          typeof candidate.updatedAt === 'number'
            ? candidate.updatedAt
            : timestamp,
      },
    ]
  })
}

function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap(message => {
    if (!message || typeof message !== 'object') {
      return []
    }

    const candidate = message as Partial<ChatMessage>
    if (
      (candidate.role !== 'user' && candidate.role !== 'assistant') ||
      typeof candidate.content !== 'string'
    ) {
      return []
    }

    return [
      {
        role: candidate.role,
        content: candidate.content,
        providerName: candidate.providerName,
        model: candidate.model,
        context: candidate.context,
      },
    ]
  })
}

function refreshChatConversation(
  conversation: ChatConversation,
  messages: ChatMessage[]
): ChatConversation {
  return {
    ...conversation,
    title: getChatConversationTitle(messages),
    messages,
    updatedAt: Date.now(),
  }
}

function updateChatConversation(
  conversationId: string,
  updater: (conversation: ChatConversation) => ChatConversation,
  setChatConversations: SetChatConversations
) {
  setChatConversations(currentConversations => {
    const conversations = normalizeChatConversations(currentConversations)
    const targetConversation =
      conversations.find(conversation => conversation.id === conversationId) ??
      createEmptyChatConversation(conversationId)
    const updatedConversation = updater(targetConversation)
    const found = conversations.some(
      conversation => conversation.id === conversationId
    )

    if (!found) {
      return [...conversations, updatedConversation]
    }

    return conversations.map(conversation =>
      conversation.id === conversationId ? updatedConversation : conversation
    )
  })
}

function getNextChatConversationId(conversations: ChatConversation[]) {
  const usedIds = new Set(conversations.map(conversation => conversation.id))
  let index = conversations.length + 1

  while (usedIds.has(`chat-${index}`)) {
    index += 1
  }

  return `chat-${index}`
}

function getChatConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find(message => message.role === 'user')
  const title = firstUserMessage?.content.trim().replace(/\s+/g, ' ') ?? ''

  if (!title) {
    return ''
  }

  if (title.length <= CHAT_TITLE_MAX_LENGTH) {
    return title
  }

  return `${title.slice(0, CHAT_TITLE_MAX_LENGTH - 3).trim()}...`
}

function getChatConversationDisplayTitle(
  conversation: ChatConversation,
  t: TFunction
) {
  return conversation.title || t('ai_assistant_untitled_conversation')
}

function ChatTranscriptMessage({
  message,
  t,
  onApplyToEditor,
}: {
  message: ChatMessage
  t: TFunction
  onApplyToEditor?: () => void
}) {
  const isAssistant = message.role === 'assistant'

  return (
    <div
      className={[
        'ai-assistant-message',
        `ai-assistant-message-${message.role}`,
        isAssistant ? 'ai-assistant-message-document' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="ai-assistant-message-header">
        <div className="ai-assistant-message-meta">
          {message.role === 'user'
            ? t('you')
            : t('ai_assistant_response_meta', {
                provider: message.providerName || '',
                model: message.model || '',
              })}
        </div>
        {isAssistant && (
          <AssistantMessageActions
            content={message.content}
            t={t}
            onApplyToEditor={onApplyToEditor}
          />
        )}
      </div>
      {isAssistant ? (
        <AiMarkdown content={message.content} />
      ) : (
        <div className="ai-assistant-answer-text">{message.content}</div>
      )}
      {isAssistant && message.context?.includedFiles.length ? (
        <ChatContextFiles context={message.context} t={t} />
      ) : null}
    </div>
  )
}

function AssistantMessageActions({
  content,
  t,
  onApplyToEditor,
}: {
  content: string
  t: TFunction
  onApplyToEditor?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const canCopy =
    typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText)

  function handleCopy() {
    if (!canCopy) {
      return
    }
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  if (!canCopy && !onApplyToEditor) {
    return null
  }

  return (
    <div className="ai-assistant-message-actions">
      {canCopy && (
        <OLButton
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('copy_response')}
          onClick={handleCopy}
        >
          <MaterialIcon type={copied ? 'check' : 'content_copy'} unfilled />
          {copied ? t('copied') : t('copy_response')}
        </OLButton>
      )}
      {onApplyToEditor && (
        <OLButton
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('ai_assistant_insert_into_editor')}
          onClick={onApplyToEditor}
        >
          <MaterialIcon type="input" />
          {t('ai_assistant_insert_into_editor')}
        </OLButton>
      )}
    </div>
  )
}

function ChatContextFiles({
  context,
  t,
}: {
  context: ProjectAiChatResponse['context']
  t: TFunction
}) {
  return (
    <div className="ai-assistant-context-files">
      <h5>{t('ai_assistant_context_used')}</h5>
      <ul>
        {context.includedFiles.map(file => (
          <li key={file}>{file}</li>
        ))}
      </ul>
    </div>
  )
}

function AgentRunControls({
  agentConfig,
  session,
  t,
  onStartAct,
  startingAct,
}: {
  agentConfig: ProjectAiAgentConfig
  session: ProjectAiAgentSession | null
  t: TFunction
  onStartAct: () => void
  startingAct: boolean
}) {
  const canStartAct =
    session?.mode === 'plan' &&
    ['waiting_for_act', 'completed'].includes(session.status)
  const startActHint = getStartActHint(session, t)
  const progressSteps = getAgentProgressSteps(session, t)
  const capabilityItems = getAgentCapabilityItems(agentConfig, t)

  return (
    <div className="ai-assistant-agent-controls">
      <AgentStatusOverview session={session} t={t} />
      <div
        className="ai-assistant-agent-capabilities"
        aria-label={t('ai_assistant_agent_capabilities')}
      >
        {capabilityItems.map(item => (
          <span
            className={`ai-assistant-agent-capability ${item.tone}`}
            key={item.key}
          >
            <span className="ai-assistant-agent-capability-dot" />
            {item.label}
          </span>
        ))}
      </div>
      <div className="ai-assistant-agent-controls-main">
        <span>
          {session ? formatAgentMode(session, t) : t('ai_assistant_plan')}
        </span>
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
      <ol
        aria-label={t('ai_assistant_agent_progress')}
        className="ai-assistant-agent-progress"
      >
        {progressSteps.map((step, index) => (
          <li
            className={`ai-assistant-agent-progress-step ${step.state}`}
            key={step.key}
          >
            <span className="ai-assistant-agent-progress-index">
              {index + 1}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      {!canStartAct && (
        <p className="ai-assistant-agent-controls-hint">{startActHint}</p>
      )}
    </div>
  )
}

function AgentStatusOverview({
  session,
  t,
}: {
  session: ProjectAiAgentSession | null
  t: TFunction
}) {
  const statusTone = getAgentStatusTone(session)

  return (
    <div className="ai-assistant-agent-status-overview">
      <div className="ai-assistant-agent-status-header">
        <span>{t('ai_assistant_agent_current_run')}</span>
        <span className={`ai-assistant-agent-status-chip ${statusTone}`}>
          <span className="ai-assistant-agent-status-dot" />
          {getAgentStatusLabel(session, t)}
        </span>
      </div>
      {session?.task && (
        <div className="ai-assistant-agent-status-task">
          <span>{t('ai_assistant_agent_task')}</span>
          <strong>{session.task}</strong>
        </div>
      )}
    </div>
  )
}

function AgentEventList({
  events,
  projectId,
  session,
  t,
  onCheckpointRollback,
  onSessionStatusChange,
}: {
  events: ProjectAiAgentEvent[]
  projectId: string
  session: ProjectAiAgentSession | null
  t: TFunction
  onCheckpointRollback: (commitHash: string) => Promise<void>
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
    event =>
      !patchEventIds.has(event.id) &&
      !isFinalAgentMessage(event) &&
      isReadableAgentWorklogEvent(event)
  )
  const runSummary = buildAgentRunSummary(worklogEvents)
  const worklogGroups = buildAgentWorklogGroups(worklogEvents)

  return (
    <div className="ai-assistant-agent-stack">
      {runSummary && (
        <AgentRunSummary
          summary={runSummary}
          session={session}
          t={t}
          onRollbackBefore={
            runSummary.before
              ? () => onCheckpointRollback(runSummary.before!.commitHash)
              : undefined
          }
        />
      )}
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
        <details className="ai-assistant-agent-events" open={!runSummary}>
          <summary className="ai-assistant-agent-events-summary">
            <span className="ai-assistant-agent-events-title">
              <span>
                {runSummary
                  ? t('ai_assistant_agent_worklog_detailed')
                  : t('ai_assistant_agent_worklog')}
              </span>
              {runSummary && (
                <span className="ai-assistant-agent-events-purpose">
                  {t('ai_assistant_agent_worklog_audit_trail')}
                </span>
              )}
            </span>
            <span className="ai-assistant-agent-events-count">
              {t('ai_assistant_agent_worklog_count', {
                count: worklogEvents.length,
              })}
            </span>
            <MaterialIcon type="expand_more" />
          </summary>
          {runSummary && (
            <p className="ai-assistant-agent-events-hint">
              {t('ai_assistant_agent_worklog_secondary_hint')}
            </p>
          )}
          <div className="ai-assistant-agent-events-body">
            {worklogGroups.map(group => (
              <section
                className={`ai-assistant-agent-event-group ${group.key}`}
                key={group.key}
              >
                <div className="ai-assistant-agent-event-group-header">
                  <span className="ai-assistant-agent-event-group-title">
                    {t(group.labelKey)}
                  </span>
                  <span className="ai-assistant-agent-event-group-count">
                    {t('ai_assistant_agent_worklog_group_count', {
                      count: group.events.length,
                    })}
                  </span>
                </div>
                <div className="ai-assistant-agent-event-group-body">
                  {group.events.map((event, index) => (
                    <AgentWorklogEventItem
                      event={event}
                      eventKey={`${event.id}-${event.sequence}-${index}`}
                      key={`${event.id}-${event.sequence}-${index}`}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function AgentWorklogEventItem({
  event,
  eventKey,
  t,
}: {
  event: ProjectAiAgentEvent
  eventKey: string
  t: TFunction
}) {
  const isFinalMessage = isFinalAgentMessage(event)
  const checkpoint = getAgentCheckpoint(event)
  const workspaceDiff = getAgentWorkspaceDiff(event)

  if (checkpoint) {
    return (
      <AgentCheckpointCard checkpoint={checkpoint} key={eventKey} t={t} />
    )
  }

  if (workspaceDiff) {
    return (
      <AgentWorkspaceDiffCard summary={workspaceDiff} key={eventKey} t={t} />
    )
  }

  return (
    <details className="ai-assistant-agent-event" key={eventKey}>
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
        {shouldRenderAgentEventAsMarkdown(event) && !isFinalMessage ? (
          <AiMarkdown content={formatAgentEventPayload(event, t)} />
        ) : (
          <div className="ai-assistant-answer-text">
            {formatAgentEventPayload(event, t)}
          </div>
        )}
      </div>
    </details>
  )
}

function AgentResult({ answer, t }: { answer: string; t: TFunction }) {
  const [expanded, setExpanded] = useState(false)
  const resultId = useId()
  const longResult = isLongAgentAnswer(answer)
  const visibleAnswer =
    longResult && !expanded ? getAgentAnswerPreview(answer) : answer

  return (
    <div className="ai-assistant-agent-result">
      <div className="ai-assistant-agent-result-header">
        <div className="ai-assistant-message-meta">
          {t('ai_assistant_agent_result')}
        </div>
        {longResult && (
          <OLButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setExpanded(currentExpanded => !currentExpanded)}
          >
            {expanded
              ? t('ai_assistant_collapse_result')
              : t('ai_assistant_show_full_result')}
          </OLButton>
        )}
      </div>
      <div
        id={resultId}
        className={`ai-assistant-agent-result-body ${
          longResult && !expanded ? 'collapsed' : ''
        }`}
      >
        <AiMarkdown content={visibleAnswer} />
      </div>
    </div>
  )
}

function isLongAgentAnswer(answer: string) {
  return (
    answer.length > AGENT_RESULT_PREVIEW_CHARS ||
    answer.split('\n').length > AGENT_RESULT_PREVIEW_LINES
  )
}

function getAgentAnswerPreview(answer: string) {
  const lines = answer.split('\n')
  const linePreview = lines.slice(0, AGENT_RESULT_PREVIEW_LINES).join('\n')

  if (linePreview.length <= AGENT_RESULT_PREVIEW_CHARS) {
    return linePreview.trim()
  }

  return `${linePreview.slice(0, AGENT_RESULT_PREVIEW_CHARS).trim()}...`
}
function AgentRunSummary({
  summary,
  session,
  t,
  onRollbackBefore,
}: {
  summary: AgentRunSummaryData
  session: ProjectAiAgentSession | null
  t: TFunction
  onRollbackBefore?: () => Promise<void>









}) {
  const [floating, setFloating] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const metrics = summary.diff
    ? [
        {
          className: 'files',
          label: formatWorkspaceFileCount(summary.diff.filesChanged, t),
        },
        {
          className: 'additions',
          label: formatWorkspaceAdditionCount(summary.diff.additions, t),
        },
        {
          className: 'deletions',
          label: formatWorkspaceDeletionCount(summary.diff.deletions, t),
        },
      ]
    : []
  const className = [
    'ai-assistant-agent-run-summary',
    floating ? 'floating' : '',
    dragState ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (!dragState) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      setPosition({
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY,
      })
    }
    const handleMouseUp = () => setDragState(null)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState])

  const handleToggleFloating = () => {
    setFloating(currentFloating => {
      if (currentFloating) {
        setPosition({ x: 0, y: 0 })
        setDragState(null)
      }
      return !currentFloating
    })
  }

  const handleDragStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!floating) {
      return
    }
    event.preventDefault()
    setDragState({
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    })
  }

  const handleRollbackBefore = async () => {
    if (!onRollbackBefore) {
      return
    }
    setRollingBack(true)
    try {
      await onRollbackBefore()
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <section
      aria-label={t('ai_assistant_run_summary')}
      className={className}
      style={
        floating
          ? { transform: `translate(${position.x}px, ${position.y}px)` }
          : undefined
      }
    >
      <div className="ai-assistant-agent-run-summary-header">
        <span className="ai-assistant-agent-run-summary-title">
          {t('ai_assistant_run_summary')}
        </span>
        <div className="ai-assistant-agent-run-summary-actions">
          {summary.diff && (
            <span className="ai-assistant-agent-run-summary-badge">
              {formatWorkspaceFileCount(summary.diff.filesChanged, t)}
            </span>
          )}
          {summary.before && onRollbackBefore && (
            <OLIconButton
              accessibilityLabel={t('ai_assistant_rollback_to_before')}
              icon="undo"
              isLoading={rollingBack}
              loadingLabel={t('ai_assistant_rolling_back')}
              onClick={handleRollbackBefore}
              size="sm"
              type="button"
              variant="secondary"
            />
          )}
          {floating && (
            <button
              aria-label={t('ai_assistant_drag_run_summary')}
              className="ai-assistant-agent-run-summary-drag"
              onMouseDown={handleDragStart}
              title={t('ai_assistant_drag_run_summary')}
              type="button"
            >
              <MaterialIcon type="drag_indicator" />
            </button>
          )}
          <OLIconButton
            accessibilityLabel={
              floating
                ? t('ai_assistant_dock_run_summary')
                : t('ai_assistant_float_run_summary')
            }
            icon={floating ? 'vertical_align_bottom' : 'picture_in_picture_alt'}
            onClick={handleToggleFloating}
            size="sm"
            type="button"
            variant="secondary"
          />
        </div>
      </div>
      <div className="ai-assistant-agent-run-summary-overview">
        <div>
          <span className="ai-assistant-agent-run-summary-eyebrow">
            {t('ai_assistant_run_summary_status')}
          </span>
          <strong>{getAgentStatusLabel(session, t)}</strong>
        </div>
        <p>{t('ai_assistant_run_summary_guidance')}</p>
      </div>
      <div className="ai-assistant-agent-run-summary-commits">
        {summary.before && (
          <div className="ai-assistant-agent-run-summary-commit">
            <span className="ai-assistant-agent-run-summary-label">
              {t('ai_assistant_before_commit')}
            </span>
            <code title={summary.before.commitHash}>
              {summary.before.shortCommitHash}
            </code>
          </div>
        )}
        {summary.after && (
          <div className="ai-assistant-agent-run-summary-commit">
            <span className="ai-assistant-agent-run-summary-label">
              {t('ai_assistant_after_commit')}
            </span>
            <code title={summary.after.commitHash}>
              {summary.after.shortCommitHash}
            </code>
          </div>
        )}
      </div>
      {summary.diff && (
        <div
          className="ai-assistant-agent-run-summary-metrics"
          aria-label={t('ai_assistant_run_summary_impact')}
        >
          <span className="ai-assistant-agent-run-summary-impact-label">
            {t('ai_assistant_run_summary_impact')}
          </span>
          {metrics.map(metric => (
            <span
              className={`ai-assistant-agent-run-summary-metric ai-assistant-agent-run-summary-stat ${metric.className}`}
              key={metric.className}
            >
              {metric.label}
            </span>
          ))}
        </div>
      )}
      {summary.diff?.paths.length ? (
        <div className="ai-assistant-agent-run-summary-files">
          <span className="ai-assistant-agent-run-summary-section-label">
            {t('ai_assistant_changed_files')}
          </span>
          <ul>
            {summary.diff.paths.slice(0, 4).map(path => (
              <li className="ai-assistant-agent-run-summary-path" key={path}>
                {path}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="ai-assistant-agent-run-summary-next-step">
        <span className="ai-assistant-agent-run-summary-section-label">
          {t('ai_assistant_next_step')}
        </span>
        <p>{t('ai_assistant_run_summary_next_step')}</p>
      </div>
    </section>
  )
}

function AgentCheckpointCard({
  checkpoint,
  t,
}: {
  checkpoint: AgentCheckpointSummary
  t: TFunction
}) {
  return (
    <div className="ai-assistant-agent-artifact-card ai-assistant-agent-checkpoint-card">
      <div className="ai-assistant-agent-artifact-header">
        <span className="ai-assistant-agent-artifact-title">
          {t('ai_assistant_checkpoint')}
        </span>
        <span className="ai-assistant-agent-artifact-badge">
          {formatCheckpointPhase(checkpoint.phase, t)}
        </span>
      </div>
      <div className="ai-assistant-agent-artifact-body">
        <span className="ai-assistant-agent-artifact-label">
          {t('ai_assistant_commit_hash')}
        </span>
        <code title={checkpoint.commitHash}>{checkpoint.shortCommitHash}</code>
      </div>
    </div>
  )
}

function AgentWorkspaceDiffCard({
  summary,
  t,
}: {
  summary: WorkspaceDiffSummary
  t: TFunction
}) {
  return (
    <div className="ai-assistant-agent-artifact-card ai-assistant-agent-workspace-diff-card">
      <div className="ai-assistant-agent-artifact-header">
        <span className="ai-assistant-agent-artifact-title">
          {t('ai_assistant_workspace_diff')}
        </span>
        <span className="ai-assistant-agent-artifact-badge">
          {formatWorkspaceFileCount(summary.filesChanged, t)}
        </span>
      </div>
      <div className="ai-assistant-agent-artifact-metrics">
        <span className="additions">
          {formatWorkspaceAdditionCount(summary.additions, t)}
        </span>
        <span className="deletions">
          {formatWorkspaceDeletionCount(summary.deletions, t)}
        </span>
      </div>
      {summary.paths.length > 0 && (
        <ul className="ai-assistant-agent-artifact-paths">
          {summary.paths.map(path => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatAgentEventTitle(event: ProjectAiAgentEvent, t: TFunction) {
  if (event.type === 'message') {
    if (isClineRuntimeContextEvent(event)) {
      return t('ai_assistant_cline_runtime')
    }
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
  if (event.type === 'checkpoint_created') {
    return t('ai_assistant_checkpoint')
  }
  if (event.type === 'checkpoint_restored') {
    return t('ai_assistant_checkpoint_restored')
  }
  if (event.type === 'workspace_diff') {
    return t('ai_assistant_workspace_diff')
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
  if (event.type === 'checkpoint_created') {
    const checkpoint = getAgentCheckpoint(event)
    if (checkpoint) {
      return `${formatCheckpointPhase(checkpoint.phase, t)} · ${checkpoint.shortCommitHash}`
    }
  }
  if (event.type === 'checkpoint_restored') {
    const commitHash =
      typeof event.payload.commitHash === 'string' ? event.payload.commitHash : ''
    return commitHash ? formatCommitHash(commitHash) : ''
  }
  if (event.type === 'workspace_diff') {
    const summary = getAgentWorkspaceDiff(event)
    if (summary) {
      return summarizeWorkspaceDiff(summary, t)
    }
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
    if (isClineRuntimeContextEvent(event)) {
      return formatClineRuntimeContextSnippet(payload, t)
    }
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
  if (isClineRuntimeContextEvent(event)) {
    return formatClineRuntimeContextPayload(payload, t)
  }
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
  if (event.type === 'checkpoint_created') {
    const checkpoint = getAgentCheckpoint(event)
    if (checkpoint) {
      return `${formatCheckpointPhase(checkpoint.phase, t)} · ${checkpoint.shortCommitHash}`
    }
  }
  if (event.type === 'checkpoint_restored') {
    const commitHash =
      typeof payload.commitHash === 'string' ? payload.commitHash : ''
    const changedPaths = Array.isArray(payload.changedPaths)
      ? payload.changedPaths.join(', ')
      : ''
    return t('ai_assistant_checkpoint_restored_detail', {
      commit: commitHash ? formatCommitHash(commitHash) : t('ai_assistant_none'),
      paths: changedPaths || t('ai_assistant_none'),
    })
  }
  if (event.type === 'workspace_diff') {
    const summary = getAgentWorkspaceDiff(event)
    if (summary) {
      return summarizeWorkspaceDiff(summary, t)
    }
  }
  return JSON.stringify(payload, null, 2)
}

function isClineRuntimeContextEvent(event: ProjectAiAgentEvent) {
  return (
    event.type === 'message' &&
    event.payload.kind === 'context' &&
    Boolean(event.payload.toolPolicySummary)
  )
}

function formatClineRuntimeContextSnippet(
  payload: Record<string, unknown>,
  t: TFunction
) {
  const policy = getToolPolicySummary(payload)
  const directWrites = policy.directWorkspaceWrites
  const externalTools = policy.externalToolsEnabled

  return [
    directWrites ? t('ai_assistant_direct_writes_enabled') : '',
    t('ai_assistant_external_tools_summary', {
      state: formatRuntimeState(externalTools, t),
    }),
  ]
    .filter(Boolean)
    .join(' · ')
}

function formatClineRuntimeContextPayload(
  payload: Record<string, unknown>,
  t: TFunction
) {
  const policy = getToolPolicySummary(payload)
  const enabledSkillIds = formatStringList(payload.enabledSkillIds, t)
  const enabledPluginIds = formatStringList(payload.enabledPluginIds, t)
  const content =
    typeof payload.content === 'string' && payload.content.trim()
      ? payload.content.trim()
      : t('ai_assistant_cline_runtime')

  return [
    content,
    t('ai_assistant_skills_summary', { skills: enabledSkillIds }),
    t('ai_assistant_plugins_summary', { plugins: enabledPluginIds }),
    t('ai_assistant_shell_summary', {
      state: formatRuntimeState(policy.shellEnabled, t),
    }),
    t('ai_assistant_external_tools_summary', {
      state: formatRuntimeState(policy.externalToolsEnabled, t),
    }),
    t('ai_assistant_mcp_summary', {
      state: formatRuntimeState(policy.mcpEnabled, t),
    }),
    t('ai_assistant_subagents_summary', {
      state: formatRuntimeState(policy.spawnAgentEnabled, t),
    }),
  ].join('\n')
}

function getToolPolicySummary(payload: Record<string, unknown>) {
  const summary = payload.toolPolicySummary
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return {}
  }
  return summary as Record<string, unknown>
}

function formatStringList(value: unknown, t: TFunction) {
  if (!Array.isArray(value)) {
    return t('ai_assistant_none')
  }
  const strings = value.filter(
    (item): item is string => typeof item === 'string' && Boolean(item)
  )
  return strings.join(', ') || t('ai_assistant_none')
}

function formatRuntimeState(value: unknown, t: TFunction) {
  return String(t(value === true ? 'enabled' : 'disabled')).toLowerCase()
}

type AgentWorklogGroupKey = 'context' | 'tools' | 'workspace' | 'updates'

type AgentWorklogGroup = {
  key: AgentWorklogGroupKey
  labelKey: string
  events: ProjectAiAgentEvent[]
}

const AGENT_WORKLOG_GROUPS: Array<
  Omit<AgentWorklogGroup, 'events'>
> = [
  {
    key: 'context',
    labelKey: 'ai_assistant_agent_worklog_group_context',
  },
  {
    key: 'tools',
    labelKey: 'ai_assistant_agent_worklog_group_tools',
  },
  {
    key: 'workspace',
    labelKey: 'ai_assistant_agent_worklog_group_workspace',
  },
  {
    key: 'updates',
    labelKey: 'ai_assistant_agent_worklog_group_updates',
  },
]

function buildAgentWorklogGroups(
  events: ProjectAiAgentEvent[]
): AgentWorklogGroup[] {
  const groupedEvents: Record<AgentWorklogGroupKey, ProjectAiAgentEvent[]> = {
    context: [],
    tools: [],
    workspace: [],
    updates: [],
  }

  for (const event of events) {
    groupedEvents[getAgentWorklogGroupKey(event)].push(event)
  }

  return AGENT_WORKLOG_GROUPS.map(group => ({
    ...group,
    events: groupedEvents[group.key],
  })).filter(group => group.events.length > 0)
}

function getAgentWorklogGroupKey(
  event: ProjectAiAgentEvent
): AgentWorklogGroupKey {
  if (
    event.type === 'checkpoint_created' ||
    event.type === 'checkpoint_restored' ||
    event.type === 'workspace_diff' ||
    event.type === 'patch_applied' ||
    event.type === 'patch_rolled_back'
  ) {
    return 'workspace'
  }

  if (
    event.type === 'tool_call' ||
    event.type === 'tool_result' ||
    event.type === 'permission_denied'
  ) {
    return 'tools'
  }

  if (event.type === 'mode_changed') {
    return 'context'
  }

  if (event.type === 'message') {
    const kind =
      typeof event.payload.kind === 'string' ? event.payload.kind : ''
    if (isClineRuntimeContextEvent(event) || kind === 'context' || kind === 'plan') {
      return 'context'
    }
  }

  return 'updates'
}

type AgentCheckpointSummary = {
  phase: string
  commitHash: string
  shortCommitHash: string
}

type WorkspaceDiffSummary = {
  diff: string
  paths: string[]
  filesChanged: number
  additions: number
  deletions: number
}

type AgentRunSummaryData = {
  before: AgentCheckpointSummary | null
  after: AgentCheckpointSummary | null
  diff: WorkspaceDiffSummary | null
}

function buildAgentRunSummary(
  events: ProjectAiAgentEvent[]
): AgentRunSummaryData | null {
  const checkpoints = events
    .map(getAgentCheckpoint)
    .filter(
      (checkpoint): checkpoint is AgentCheckpointSummary => checkpoint !== null
    )
  const diffs = events
    .map(getAgentWorkspaceDiff)
    .filter((summary): summary is WorkspaceDiffSummary => summary !== null)

  if (checkpoints.length === 0 && diffs.length === 0) {
    return null
  }

  const before =
    checkpoints.find(checkpoint => checkpoint.phase === 'before') ??
    checkpoints[0] ??
    null
  const after =
    [...checkpoints]
      .reverse()
      .find(checkpoint => checkpoint.phase === 'after') ??
    checkpoints[checkpoints.length - 1] ??
    null

  return {
    before,
    after,
    diff: summarizeWorkspaceDiffs(diffs),
  }
}

function getAgentCheckpoint(
  event: ProjectAiAgentEvent
): AgentCheckpointSummary | null {
  if (event.type !== 'checkpoint_created') {
    return null
  }
  const payload = event.payload
  const commitHash =
    typeof payload.commitHash === 'string'
      ? payload.commitHash
      : typeof payload.hash === 'string'
        ? payload.hash
        : ''
  if (!commitHash) {
    return null
  }
  const phase = typeof payload.phase === 'string' ? payload.phase : 'checkpoint'
  return {
    phase,
    commitHash,
    shortCommitHash: formatCommitHash(commitHash),
  }
}

function getAgentWorkspaceDiff(
  event: ProjectAiAgentEvent
): WorkspaceDiffSummary | null {
  if (event.type !== 'workspace_diff') {
    return null
  }
  const diff = extractWorkspaceDiffText(event.payload.diff)
  if (!diff) {
    return null
  }
  const parsed = parseWorkspaceDiff(diff)
  if (!parsed) {
    return null
  }
  return parsed
}

function extractWorkspaceDiffText(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value && typeof value === 'object') {
    const diff = (value as Record<string, unknown>).diff
    if (typeof diff === 'string') {
      return diff.trim()
    }
  }
  return ''
}

function parseWorkspaceDiff(diff: string): WorkspaceDiffSummary | null {
  const lines = diff.split(/\r?\n/)
  const paths: string[] = []
  let additions = 0
  let deletions = 0

  for (const line of lines) {
    const path = parseWorkspaceDiffPath(line)
    if (path) {
      paths.push(path)
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue
    }
    if (line.startsWith('+')) {
      additions += 1
      continue
    }
    if (line.startsWith('-')) {
      deletions += 1
    }
  }

  const uniquePaths = dedupeStrings(paths)
  return {
    diff,
    paths: uniquePaths,
    filesChanged: uniquePaths.length,
    additions,
    deletions,
  }
}

function summarizeWorkspaceDiffs(summaries: WorkspaceDiffSummary[]) {
  if (summaries.length === 0) {
    return null
  }
  const paths = dedupeStrings(summaries.flatMap(summary => summary.paths))
  const fileCountFromDiffs = summaries.reduce(
    (sum, summary) => sum + summary.filesChanged,
    0
  )

  return {
    diff: summaries.map(summary => summary.diff).join('\n'),
    paths,
    filesChanged: paths.length || fileCountFromDiffs,
    additions: summaries.reduce((sum, summary) => sum + summary.additions, 0),
    deletions: summaries.reduce((sum, summary) => sum + summary.deletions, 0),
  }
}

function parseWorkspaceDiffPath(line: string) {
  if (!line.startsWith('diff --git ')) {
    return null
  }
  const match = line.match(/^diff --git a\/(.+) b\/(.+)$/)
  if (!match) {
    return null
  }
  return normalizeWorkspacePath(match[2] || match[1])
}

function normalizeWorkspacePath(path: string) {
  const cleaned = path.replace(/^["']|["']$/g, '').replace(/^b\//, '')
  if (!cleaned) {
    return null
  }
  if (cleaned === '/dev/null') {
    return null
  }
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function formatCommitHash(commitHash: string) {
  return commitHash.slice(0, 8)
}

function formatWorkspaceFileCount(count: number, t: TFunction) {
  return t('ai_assistant_workspace_files_changed', { count })
}

function formatWorkspaceAdditionCount(count: number, t: TFunction) {
  return t('ai_assistant_workspace_additions', { count })
}

function formatWorkspaceDeletionCount(count: number, t: TFunction) {
  return t('ai_assistant_workspace_deletions', { count })
}

function formatCheckpointPhase(phase: string, t: TFunction) {
  if (phase === 'before') {
    return t('ai_assistant_before_commit')
  }
  if (phase === 'after') {
    return t('ai_assistant_after_commit')
  }
  return phase
}

function summarizeWorkspaceDiff(summary: WorkspaceDiffSummary, t: TFunction) {
  const parts = [
    formatWorkspaceFileCount(summary.filesChanged, t),
    formatWorkspaceAdditionCount(summary.additions, t),
    formatWorkspaceDeletionCount(summary.deletions, t),
  ]
  return parts.join(', ')
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

function isReadableAgentWorklogEvent(event: ProjectAiAgentEvent) {
  if (event.type !== 'message') {
    return true
  }

  const kind =
    typeof event.payload.kind === 'string' ? event.payload.kind : null
  if (kind && READABLE_AGENT_MESSAGE_KINDS.has(kind)) {
    return true
  }

  return false
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

function formatPatchStatus(
  status: ProjectAiAgentPatch['status'],
  t: TFunction
) {
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

function isEnabledModel(
  provider: ProjectAiProvider | undefined,
  modelId: string | null
) {
  if (!provider || !modelId) {
    return false
  }
  return provider.models.some(model => model.id === modelId && model.enabled)
}

function getStartActHint(
  session: ProjectAiAgentSession | null,
  t: TFunction
) {
  if (!session) {
    return t('ai_assistant_start_act_hint_no_plan')
  }
  if (session.status === 'planning') {
    return t('ai_assistant_start_act_hint_planning')
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    return t('ai_assistant_start_act_hint_failed')
  }
  if (session.mode === 'act' && session.status === 'completed') {
    return t('ai_assistant_start_act_hint_completed')
  }
  if (session.mode === 'act') {
    return t('ai_assistant_start_act_hint_act')
  }
  return t('ai_assistant_start_act_hint_no_plan')
}

type AgentStatusTone = 'idle' | 'running' | 'ready' | 'review' | 'done' | 'error'

function getAgentStatusLabel(
  session: ProjectAiAgentSession | null,
  t: TFunction
) {
  if (!session) {
    return t('ai_assistant_agent_status_no_session')
  }
  if (session.status === 'planning') {
    return t('ai_assistant_agent_status_planning')
  }
  if (session.status === 'waiting_for_act') {
    return t('ai_assistant_agent_status_plan_ready')
  }
  if (session.status === 'waiting_for_approval') {
    return t('ai_assistant_agent_status_review')
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    return t('ai_assistant_agent_status_failed')
  }
  if (session.status === 'completed') {
    return session.mode === 'act'
      ? t('ai_assistant_agent_status_completed')
      : t('ai_assistant_agent_status_plan_ready')
  }
  if (session.mode === 'act') {
    return t('ai_assistant_agent_status_act_ready')
  }
  return t('ai_assistant_agent_status_planning')
}

function getAgentStatusTone(
  session: ProjectAiAgentSession | null
): AgentStatusTone {
  if (!session) {
    return 'idle'
  }
  if (session.status === 'planning') {
    return 'running'
  }
  if (session.status === 'waiting_for_approval') {
    return 'review'
  }
  if (session.status === 'failed' || session.status === 'cancelled') {
    return 'error'
  }
  if (session.status === 'completed' && session.mode === 'act') {
    return 'done'
  }
  return 'ready'
}

type AgentCapabilityItem = {
  key: string
  label: string
  tone: 'neutral' | 'safe' | 'warning'
}

function getAgentCapabilityItems(
  agentConfig: ProjectAiAgentConfig,
  t: TFunction
): AgentCapabilityItem[] {
  const enabledSkillCount =
    agentConfig.enabledSkillIds?.length ??
    agentConfig.skills.filter(skill => skill.enabled).length
  const externalToolsEnabled =
    agentConfig.permissionProfile.externalToolsEnabled === true

  return [
    {
      key: 'direct-edits',
      label: t('ai_assistant_agent_capability_direct_edits'),
      tone: 'safe',
    },
    {
      key: 'checkpoint-rollback',
      label: t('ai_assistant_agent_capability_checkpoint_rollback'),
      tone: 'safe',
    },
    {
      key: 'external-tools',
      label: externalToolsEnabled
        ? t('ai_assistant_agent_capability_external_tools_on')
        : t('ai_assistant_agent_capability_external_tools_off'),
      tone: externalToolsEnabled ? 'warning' : 'neutral',
    },
    {
      key: 'skills',
      label: t('ai_assistant_agent_capability_skills', {
        count: enabledSkillCount,
      }),
      tone: 'neutral',
    },
  ]
}

type AgentProgressStep = {
  key: 'plan' | 'start-act' | 'run-review'
  label: string
  state: 'done' | 'active' | 'pending'
}

function getAgentProgressSteps(
  session: ProjectAiAgentSession | null,
  t: TFunction
): AgentProgressStep[] {
  const needsPlan =
    !session ||
    session.status === 'planning' ||
    session.status === 'failed' ||
    session.status === 'cancelled'
  const canStartAct =
    session?.mode === 'plan' &&
    ['waiting_for_act', 'completed'].includes(session.status)
  const isActMode = session?.mode === 'act'
  const actCompleted = isActMode && session?.status === 'completed'

  return [
    {
      key: 'plan',
      label: t('ai_assistant_plan'),
      state: needsPlan ? 'active' : 'done',
    },
    {
      key: 'start-act',
      label: t('ai_assistant_start_act'),
      state: isActMode ? 'done' : canStartAct ? 'active' : 'pending',
    },
    {
      key: 'run-review',
      label: t('ai_assistant_agent_step_run_review'),
      state: actCompleted ? 'done' : isActMode ? 'active' : 'pending',
    },
  ]
}

function getInsertableAssistantContent(content: string) {
  const codeBlocks = [...content.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)]
  const preferredBlock =
    codeBlocks.find(match =>
      /^(tex|latex|bib|bibtex)$/i.test(match[1].trim())
    ) ?? codeBlocks[0]

  return (preferredBlock?.[2] ?? content).trim()
}

type EditorSelectionLike = {
  main?: {
    from: number
    to: number
  }
}

function getEditorInsertRange(
  view: NonNullable<ReturnType<typeof useEditorViewContext>['view']>,
  editorSelection: EditorSelectionLike | undefined
) {
  const range = editorSelection?.main ?? view.state.selection?.main
  if (range) {
    return { from: range.from, to: range.to }
  }
  const docLength = view.state.doc.length
  return { from: docLength, to: docLength }
}

function shouldStartNewAgentSession(session: ProjectAiAgentSession | null) {
  return !session || AGENT_SESSION_RESTART_STATUSES.has(session.status)
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
    if (session.status === 'completed') {
      return t('ai_assistant_act_completed')
    }
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
