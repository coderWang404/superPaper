import { FormEvent, useEffect, useMemo, useState } from 'react'
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
  ProjectAiChatResponse,
  ProjectAiConfig,
  ProjectAiProvider,
  sendProjectAiChatStream,
} from '@/features/ai-assistant/api'
import {
  applyProjectAiAgentPatch,
  createProjectAiAgentSession,
  getProjectAiAgentConfig,
  ProjectAiAgentConfig,
  ProjectAiAgentEvent,
  ProjectAiAgentPatch,
  ProjectAiAgentPatchDiffLine,
  ProjectAiAgentSession,
  rejectProjectAiAgentPatch,
  sendProjectAiAgentTurnStream,
} from '@/features/ai-agent/api'

type AssistantMode = 'chat' | 'agent'

export default function AiAssistantPanel() {
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
  const [agentConfig, setAgentConfig] = useState<ProjectAiAgentConfig | null>(
    null
  )
  const [agentSession, setAgentSession] =
    useState<ProjectAiAgentSession | null>(null)
  const [agentEvents, setAgentEvents] = useState<ProjectAiAgentEvent[]>([])
  const [agentAnswer, setAgentAnswer] = useState('')
  const [chatError, setChatError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
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

    try {
      if (mode === 'agent') {
        await runAgent(trimmedPrompt)
      } else {
        const response = await sendProjectAiChatStream(
          projectId,
          {
            prompt: trimmedPrompt,
            providerId: selectedProvider.id,
            model: selectedModel,
            selection,
          },
          delta => {
            setStreamedAnswer(currentAnswer => currentAnswer + delta)
          }
        )
        setAnswer(response)
      }
    } catch (error) {
      setChatError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function runAgent(trimmedPrompt: string) {
    setAgentEvents([])
    const sessionResponse = await createProjectAiAgentSession(projectId, {
      task: trimmedPrompt,
      providerId: selectedProvider?.id,
      model: selectedModel ?? undefined,
    })
    setAgentSession(sessionResponse.session)
    const response = await sendProjectAiAgentTurnStream(
      projectId,
      sessionResponse.session.id,
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

  return (
    <div className="ai-assistant-panel">
      <RailPanelHeader title="AI Assistant" />
      <div className="ai-assistant-panel-body">
        {!config && !configError && (
          <div className="ai-assistant-muted" role="status">
            Loading AI…
          </div>
        )}

        {configError && (
          <div className="ai-assistant-empty">
            <h5>AI configuration unavailable</h5>
            <p>{configError}</p>
          </div>
        )}

        {config?.providers.length === 0 && (
          <div className="ai-assistant-empty">
            <h5>No AI provider configured</h5>
            <p>
              A site admin needs to add an AI provider before project questions
              can be answered.
            </p>
          </div>
        )}

        {selectedProvider && selectedModel && (
          <>
            <ProviderSelector
              providers={config?.providers ?? []}
              selectedProvider={selectedProvider}
              onProviderChange={providerId => {
                const nextProvider = config?.providers.find(
                  provider => provider.id === providerId
                )
                setSelectedProviderId(providerId)
                setSelectedModel(getDefaultModel(nextProvider))
              }}
            />

            <div className="ai-assistant-mode-switch" aria-label="AI mode">
              <button
                type="button"
                className={mode === 'chat' ? 'active' : ''}
                aria-pressed={mode === 'chat'}
                onClick={() => setMode('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className={mode === 'agent' ? 'active' : ''}
                aria-pressed={mode === 'agent'}
                onClick={() => setMode('agent')}
              >
                Agent
              </button>
            </div>

            <div className="ai-assistant-context-strip">
              {selection ? 'Using current selection' : 'Using project context'}
            </div>

            {mode === 'agent' && agentConfig && (
              <AgentConfigSummary config={agentConfig} session={agentSession} />
            )}

            <div className="ai-assistant-transcript" aria-live="polite">
              {mode === 'chat' && (streamedAnswer || answer) && (
                <div className="ai-assistant-message ai-assistant-message-assistant">
                  <div className="ai-assistant-message-meta">
                    superPaper AI
                  </div>
                  <div className="ai-assistant-answer-text">
                    {streamedAnswer || answer?.answer}
                  </div>
                </div>
              )}
              {mode === 'agent' && agentEvents.length > 0 && (
                <AgentEventList events={agentEvents} projectId={projectId} />
              )}
              {mode === 'agent' && agentAnswer && (
                <div className="ai-assistant-message ai-assistant-message-assistant">
                  <div className="ai-assistant-message-meta">
                    superPaper Agent
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
                Ask about this project
              </label>
              <textarea
                id="ai-assistant-prompt"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="Ask a question about the project, current file, or selected text."
                rows={4}
              />
              <div className="ai-assistant-composer-footer">
                <ComposerModelSelector
                  selectedModel={selectedModel}
                  enabledModels={enabledModels}
                  onModelChange={setSelectedModel}
                />
                <OLButton
                  type="submit"
                  variant="primary"
                  disabled={!prompt.trim() || submitting}
                  isLoading={submitting}
                >
                  {mode === 'agent' ? 'Run' : 'Send'}
                </OLButton>
              </div>
            </form>

            {chatError && (
              <div className="ai-assistant-error">
                <h5>AI request failed</h5>
                <p>{chatError}</p>
              </div>
            )}

            {answer && (
              <div className="ai-assistant-answer">
                {answer.context.includedFiles.length > 0 && (
                  <div className="ai-assistant-context-files">
                    <h5>Context used</h5>
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

function AgentConfigSummary({
  config,
  session,
}: {
  config: ProjectAiAgentConfig
  session: ProjectAiAgentSession | null
}) {
  return (
    <div className="ai-assistant-agent-summary">
      <div>
        <span className="ai-assistant-label">Permission</span>
        <span>{config.permissionProfile.id}</span>
      </div>
      <div>
        <span className="ai-assistant-label">Tools</span>
        <span>{config.tools.length}</span>
      </div>
      <div>
        <span className="ai-assistant-label">Skills</span>
        <span>{config.skills.length}</span>
      </div>
      {session?.enabledSkillIds?.length ? (
        <div>
          <span className="ai-assistant-label">Active skills</span>
          <span>{session.enabledSkillIds.join(', ')}</span>
        </div>
      ) : null}
    </div>
  )
}

function AgentEventList({
  events,
  projectId,
}: {
  events: ProjectAiAgentEvent[]
  projectId: string
}) {
  return (
    <div className="ai-assistant-agent-events">
      {events.map(event => (
        <div className="ai-assistant-agent-event" key={event.id}>
          <div className="ai-assistant-message-meta">
            {formatAgentEventTitle(event)}
          </div>
          {event.type === 'patch_created' && isAgentPatch(event.payload.patch) ? (
            <AgentPatchReview
              initialPatch={event.payload.patch}
              projectId={projectId}
            />
          ) : (
            <div className="ai-assistant-answer-text">
              {formatAgentEventPayload(event)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function formatAgentEventTitle(event: ProjectAiAgentEvent) {
  if (event.type === 'patch_created') {
    return 'Patch review'
  }
  if (event.type === 'patch_applied') {
    return 'Patch applied'
  }
  if (event.type === 'tool_call') {
    return `Tool call: ${String(event.payload.name ?? '')}`
  }
  if (event.type === 'tool_result') {
    return `Tool result: ${String(event.payload.name ?? '')}`
  }
  if (event.type === 'error') {
    return 'Agent error'
  }
  return 'Agent message'
}

function formatAgentEventPayload(event: ProjectAiAgentEvent) {
  const payload = event.payload
  if (typeof payload.content === 'string') {
    return payload.content
  }
  if (Array.isArray(payload.enabledSkillIds)) {
    return `Skills: ${payload.enabledSkillIds.join(', ') || 'none'}`
  }
  if (typeof payload.message === 'string') {
    return payload.message
  }
  return JSON.stringify(payload, null, 2)
}

function AgentPatchReview({
  initialPatch,
  projectId,
}: {
  initialPatch: ProjectAiAgentPatch
  projectId: string
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
    } catch (rejectError) {
      setError(getErrorMessage(rejectError))
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="ai-assistant-agent-patch">
      <div className="ai-assistant-agent-patch-header">
        <span>{patch.summary || 'Proposed edit'}</span>
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
          Compile: {patch.compileResult.status}
        </div>
      )}
      <div className="ai-assistant-agent-patch-actions">
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={patch.status !== 'pending' || rejecting || applying}
          isLoading={rejecting}
          onClick={handleReject}
        >
          Reject
        </OLButton>
        <OLButton
          type="button"
          size="sm"
          variant="primary"
          disabled={patch.status !== 'pending' || applying || rejecting}
          isLoading={applying}
          onClick={handleApply}
        >
          Apply
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
  onProviderChange,
}: {
  providers: ProjectAiProvider[]
  selectedProvider: ProjectAiProvider
  onProviderChange: (providerId: string) => void
}) {
  return (
    <div className="ai-assistant-provider">
      {providers.length > 1 ? (
        <label>
          Provider
          <OLFormSelect
            value={selectedProvider.id}
            onChange={event => onProviderChange(event.target.value)}
          >
            {providers.map(provider => (
              <option value={provider.id} key={provider.id}>
                {provider.name}
              </option>
            ))}
          </OLFormSelect>
        </label>
      ) : (
        <div>
          <span className="ai-assistant-label">Provider</span>
          <span>{selectedProvider.name}</span>
        </div>
      )}
    </div>
  )
}

function ComposerModelSelector({
  selectedModel,
  enabledModels,
  onModelChange,
}: {
  selectedModel: string
  enabledModels: ProjectAiProvider['models']
  onModelChange: (model: string) => void
}) {
  return (
    <label className="ai-assistant-model-select">
      <span>Model</span>
      <OLFormSelect
        value={selectedModel}
        onChange={event => onModelChange(event.target.value)}
      >
        {enabledModels.map(model => (
          <option value={model.id} key={model.id}>
            {model.displayName}
          </option>
        ))}
      </OLFormSelect>
    </label>
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

function getErrorMessage(error: unknown) {
  if (error instanceof FetchError) {
    return error.getUserFacingMessage()
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}
