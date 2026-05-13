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

    try {
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
    } catch (error) {
      setChatError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
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

            {mode === 'agent' && (
              <div className="ai-assistant-agent-placeholder">
                <h5>Agent mode</h5>
                <p>
                  File-editing tools will appear here in the next development
                  phase. Chat mode is active today.
                </p>
              </div>
            )}

            <div className="ai-assistant-transcript" aria-live="polite">
              {(streamedAnswer || answer) && (
                <div className="ai-assistant-message ai-assistant-message-assistant">
                  <div className="ai-assistant-message-meta">
                    superPaper AI
                  </div>
                  <div className="ai-assistant-answer-text">
                    {streamedAnswer || answer?.answer}
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
                Ask about this project
              </label>
              <textarea
                id="ai-assistant-prompt"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="Ask a question about the project, current file, or selected text."
                rows={4}
                disabled={mode !== 'chat'}
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
                  disabled={!prompt.trim() || submitting || mode !== 'chat'}
                  isLoading={submitting}
                >
                  Send
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
