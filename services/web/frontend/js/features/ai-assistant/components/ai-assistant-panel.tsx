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
  sendProjectAiChat,
} from '@/features/ai-assistant/api'

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
  const [chatError, setChatError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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

    try {
      const response = await sendProjectAiChat(projectId, {
        prompt: trimmedPrompt,
        providerId: selectedProvider.id,
        model: selectedModel,
        selection,
      })
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
              selectedModel={selectedModel}
              enabledModels={enabledModels}
              onProviderChange={providerId => {
                const nextProvider = config?.providers.find(
                  provider => provider.id === providerId
                )
                setSelectedProviderId(providerId)
                setSelectedModel(getDefaultModel(nextProvider))
              }}
              onModelChange={setSelectedModel}
            />

            <div className="ai-assistant-context-strip">
              {selection ? 'Using current selection' : 'Using project context'}
            </div>

            <form className="ai-assistant-form" onSubmit={handleSubmit}>
              <label htmlFor="ai-assistant-prompt">
                Ask about this project
              </label>
              <textarea
                id="ai-assistant-prompt"
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="Ask a question about the project, current file, or selected text."
                rows={5}
              />
              <OLButton
                type="submit"
                variant="primary"
                disabled={!prompt.trim() || submitting}
                isLoading={submitting}
              >
                Ask
              </OLButton>
            </form>

            {chatError && (
              <div className="ai-assistant-error">
                <h5>AI request failed</h5>
                <p>{chatError}</p>
              </div>
            )}

            {answer && (
              <div className="ai-assistant-answer">
                <h5>Answer</h5>
                <div className="ai-assistant-answer-text">{answer.answer}</div>
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
  selectedModel,
  enabledModels,
  onProviderChange,
  onModelChange,
}: {
  providers: ProjectAiProvider[]
  selectedProvider: ProjectAiProvider
  selectedModel: string
  enabledModels: ProjectAiProvider['models']
  onProviderChange: (providerId: string) => void
  onModelChange: (model: string) => void
}) {
  const selectedModelDisplayName =
    enabledModels.find(model => model.id === selectedModel)?.displayName ??
    selectedModel

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

      {enabledModels.length > 1 ? (
        <label>
          Model
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
      ) : (
        <div>
          <span className="ai-assistant-label">Model</span>
          <span>{selectedModelDisplayName}</span>
        </div>
      )}
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

function getErrorMessage(error: unknown) {
  if (error instanceof FetchError) {
    return error.getUserFacingMessage()
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}
