import { expect } from 'chai'
import {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react'
import fetchMock from 'fetch-mock'
import { type FC, type PropsWithChildren, useMemo, useState } from 'react'
import { EditorSelection } from '@codemirror/state'

import AiAssistantPanel from '../../../../../frontend/js/features/ai-assistant/components/ai-assistant-panel'
import { renderWithEditorContext } from '../../../helpers/render-with-context'
import {
  EditorSelectionContext,
  type useEditorSelectionContext,
} from '../../../../../frontend/js/shared/context/editor-selection-context'
import { EditorViewContext } from '../../../../../frontend/js/features/ide-react/context/editor-view-context'

describe('<AiAssistantPanel />', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    window.metaAttributesCache.set('ol-ExposedSettings', {
      ...window.metaAttributesCache.get('ol-ExposedSettings'),
      validRootDocExtensions: ['tex'],
    })
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('shows the configured default model after loading config', async function () {
    mockConfig()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    screen.getByText('Provider One')
    screen.getByText('Model One')
    screen.getByText('Using project context')
    screen.getByRole('button', { name: 'Chat' })
    screen.getByRole('button', { name: 'Agent' })
    within(screen.getByTestId('ai-assistant-composer')).getByLabelText('Model')
  })

  it('shows an empty provider state when no provider is configured', async function () {
    fetchMock.get('/project/project123/ai/config', { providers: [] })

    renderWithEditorContext(<AiAssistantPanel />)

    await screen.findByText('No AI provider configured')
    screen.getByText('A site admin needs to add an AI provider before project questions can be answered.')
  })

  it('sends prompt and current selection to the project chat endpoint', async function () {
    mockConfig()
    mockChatStream()

    renderWithEditorContext(<AiAssistantPanel />, {
      scope: {
        editor: {
          sharejs_doc: {
            doc_id: 'doc-one',
            getSnapshot: () => 'Hello selected text.',
            hasBufferedOps: () => false,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
          currentDocumentId: 'doc-one',
          openDocName: 'main.tex',
        },
      },
      providers: {
        EditorSelectionProvider: makeEditorSelectionProvider(
          EditorSelection.single(6, 19)
        ),
        EditorViewProvider: makeEditorViewProvider('Hello selected text.'),
      },
    })

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    screen.getByText('Using current selection')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'How should I cite this?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Use \\\\cite{} here.')

    const call = fetchMock.callHistory.calls(
      '/project/project123/ai/chat/stream'
    )[0]
    expect(JSON.parse(call.options.body as string)).to.deep.equal({
      prompt: 'How should I cite this?',
      providerId: 'provider-one',
      model: 'model-one',
      selection: {
        docId: 'doc-one',
        path: 'main.tex',
        text: 'selected text',
      },
    })
  })

  it('renders included context files returned by the backend', async function () {
    mockConfig()
    mockChatStream({
      context: {
        includedFiles: ['main.tex', 'refs.bib'],
        selectionIncluded: false,
        truncated: false,
      },
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Summarize the bibliography.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Context used')
    screen.getByText('main.tex')
    screen.getByText('refs.bib')
  })

  it('renders a user-facing error when chat fails', async function () {
    mockConfig()
    fetchMock.post('/project/project123/ai/chat/stream', 503)

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the current draft.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('AI request failed')
  })

  it('shows the streamed answer while the request is still active', async function () {
    mockConfig()
    fetchMock.post('/project/project123/ai/chat/stream', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        JSON.stringify({ type: 'delta', delta: 'Streaming ' }) +
        '\n' +
        JSON.stringify({ type: 'delta', delta: 'answer' }) +
        '\n' +
        JSON.stringify({
          type: 'done',
          providerId: 'provider-one',
          model: 'model-one',
          context: {
            includedFiles: ['main.tex'],
            selectionIncluded: false,
            truncated: false,
          },
        }) +
        '\n',
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Stream the answer.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByText('Streaming answer')
  })
})

function mockConfig() {
  fetchMock.get('/project/project123/ai/config', {
    providers: [
      {
        id: 'provider-one',
        name: 'Provider One',
        models: [{ id: 'model-one', displayName: 'Model One', enabled: true }],
        defaultModel: 'model-one',
      },
    ],
  })
}

function mockChatStream(overrides = {}) {
  const response = {
    providerId: 'provider-one',
    model: 'model-one',
    context: {
      includedFiles: ['main.tex'],
      selectionIncluded: true,
      truncated: false,
    },
    ...overrides,
  } as {
    providerId: string
    model: string
    context: {
      includedFiles: string[]
      selectionIncluded: boolean
      truncated: boolean
    }
  }

  fetchMock.post('/project/project123/ai/chat/stream', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({ type: 'delta', delta: 'Use ' }) +
      '\n' +
      JSON.stringify({ type: 'delta', delta: '\\\\cite{} here.' }) +
      '\n' +
      JSON.stringify({ type: 'done', ...response }) +
      '\n',
  })
}

function makeEditorSelectionProvider(editorSelection: EditorSelection) {
  const EditorSelectionProvider: FC<PropsWithChildren> = ({ children }) => {
    const [selection, setSelection] = useState<EditorSelection | undefined>(
      editorSelection
    )
    const value = useMemo<
      ReturnType<typeof useEditorSelectionContext>
    >(() => {
      return {
        editorSelection: selection,
        setEditorSelection: setSelection,
      }
    }, [selection])

    return (
      <EditorSelectionContext.Provider value={value}>
        {children}
      </EditorSelectionContext.Provider>
    )
  }

  return EditorSelectionProvider
}

function makeEditorViewProvider(content: string) {
  const EditorViewProvider: FC<PropsWithChildren> = ({ children }) => {
    const value = useMemo(() => {
      return {
        view: {
          state: {
            doc: {
              toString() {
                return content
              },
            },
            sliceDoc(from: number, to: number) {
              return content.slice(from, to)
            },
          },
        } as any,
        setView: () => {},
      }
    }, [])

    return (
      <EditorViewContext.Provider value={value}>
        {children}
      </EditorViewContext.Provider>
    )
  }

  return EditorViewProvider
}
