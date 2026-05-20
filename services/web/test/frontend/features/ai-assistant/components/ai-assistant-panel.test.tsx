import { expect } from 'chai'
import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
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
    screen.getByText('Start from this project')
    screen.getByRole('button', { name: /Agent Settings|Agent 设置/ })
    screen.getByRole('button', {
      name: 'Diagnose the latest compile error',
    })
    screen.getByRole('button', { name: 'Chat' })
    screen.getByRole('button', { name: 'Agent' })
    screen.getByLabelText('Model')
  })

  it('fills the composer from a suggested prompt', async function () {
    mockConfig()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Diagnose the latest compile error' })
    )

    expect(screen.getByLabelText('Ask about this project')).to.have.property(
      'value',
      'Diagnose the latest compile error'
    )
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

    await screen.findByText(/Use \\cite\{\} here\./)

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
      history: [],
    })
  })

  it('keeps chat context when switching providers', async function () {
    mockConfigWithTwoProviders()
    mockChatStream({ repeat: 2 })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'First question.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText(/Use \\cite\{\} here\./)

    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'provider-two' },
    })
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Continue with another provider.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findAllByText(/Use \\cite\{\} here\./)
    const secondCall = fetchMock.callHistory.calls(
      '/project/project123/ai/chat/stream'
    )[1]
    expect(JSON.parse(secondCall.options.body as string)).to.deep.equal({
      prompt: 'Continue with another provider.',
      providerId: 'provider-two',
      model: 'model-two',
      history: [
        { role: 'user', content: 'First question.' },
        { role: 'assistant', content: 'Use \\\\cite{} here.' },
      ],
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

  it('renders assistant Markdown while keeping user messages as text', async function () {
    mockConfig()
    mockChatStream({
      deltas: ['## Result\n\n- **Use** `\\\\cite{key}`\n\n'],
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: '**Do not render me**' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await screen.findByRole('heading', { name: 'Result', level: 2 })
    screen.getByText('Use')
    screen.getByText(/\\cite\{key\}/)
    expect(screen.getAllByText('**Do not render me**')).to.have.length(2)
  })

  it('runs agent mode and renders streamed tool events', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStream()

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')
    expect(screen.queryByText('project-agent-default')).to.equal(null)
    expect(screen.queryByText('LaTeX 编译错误诊断')).to.equal(null)
    expect(screen.queryByText('LaTeX 核心 Agent 能力包')).to.equal(null)
    screen.getByRole('button', { name: 'Start Act' })

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Explain the project structure.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    await screen.findByText('Work log')
    await screen.findByText('Tool call: project.read_file')
    screen.getByText('project.read_file')
    screen.getByText('1 event')
    await screen.findByText('Result')
    await screen.findByText('Agent answer')

    const createCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions'
    )[0]
    const turnCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/turns'
    )[0]
    expect(JSON.parse(createCall.options.body as string)).to.deep.equal({
      task: 'Explain the project structure.',
      providerId: 'provider-one',
      model: 'model-one',
    })
    expect(JSON.parse(turnCall.options.body as string)).to.deep.equal({
      prompt: 'Explain the project structure.',
      providerId: 'provider-one',
      model: 'model-one',
    })
  })

  it('continues the same agent session after switching providers', async function () {
    mockConfigWithTwoProviders()
    mockAgentConfig()
    mockAgentSession()
    mockAgentTurnStream({ repeat: 2 })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Plan the task.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')

    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'provider-two' },
    })
    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Continue on provider two.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))

    const secondTurnCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/sessions/session-one/turns'
    )[1]
    expect(JSON.parse(secondTurnCall.options.body as string)).to.deep.equal({
      prompt: 'Continue on provider two.',
      providerId: 'provider-two',
      model: 'model-two',
    })
    expect(fetchMock.callHistory.calls('/project/project123/ai/agent/sessions')).to
      .have.length(1)
  })

  it('renders agent patch review and applies approved patches', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentPlanThenActTurnStreamWithPatch()
    mockAgentStartAct()
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/apply', {
      patch: {
        ...mockPatch(),
        status: 'applied',
        appliedAt: '2026-05-16T00:00:00.000Z',
        rollbackAvailable: true,
        compileResult: {
          ok: true,
          status: 'success',
          buildId: 'build-one',
          outputFiles: [{ path: 'output.pdf', type: 'pdf', size: 123 }],
          validationProblems: [],
        },
      },
    })
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/rollback', {
      patch: {
        ...mockPatch(),
        status: 'rolled_back',
        appliedAt: '2026-05-16T00:00:00.000Z',
        rolledBackAt: '2026-05-16T00:01:00.000Z',
        rollbackAvailable: false,
        compileResult: {
          ok: true,
          status: 'success',
          buildId: 'build-two',
          outputFiles: [{ path: 'output.pdf', type: 'pdf', size: 123 }],
          validationProblems: [],
        },
      },
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Update wording.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')
    fireEvent.click(screen.getByRole('button', { name: 'Start Act' }))
    await screen.findByText('Mode changed')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await screen.findByText('Patch review')
    screen.getByText('Update wording')
    fireEvent.click(screen.getByText('Review diff'))
    screen.getByText('/main.tex')
    screen.getByText('-Old sentence.')
    screen.getByText('+New sentence.')

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await screen.findByText('applied')
    await screen.findByText('Compile: success')
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }))

    await screen.findByText('rolled back')
    await screen.findByText('Act: ready')
    const applyCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/apply'
    )[0]
    expect(JSON.parse(applyCall.options.body as string)).to.deep.equal({})
    const rollbackCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/rollback'
    )[0]
    expect(JSON.parse(rollbackCall.options.body as string)).to.deep.equal({})
  })

  it('rejects agent patches from the review panel', async function () {
    mockConfig()
    mockAgentConfig()
    mockAgentSession()
    mockAgentPlanThenActTurnStreamWithPatch()
    mockAgentStartAct()
    fetchMock.post('/project/project123/ai/agent/patches/patch-one/reject', {
      patch: {
        ...mockPatch(),
        status: 'rejected',
      },
    })

    renderWithEditorContext(<AiAssistantPanel />)

    await waitForElementToBeRemoved(() => screen.getByText('Loading AI…'))
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    await screen.findByText('Plan')

    fireEvent.change(screen.getByLabelText('Ask about this project'), {
      target: { value: 'Update wording.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }))
    await screen.findByText('Agent answer')
    fireEvent.click(screen.getByRole('button', { name: 'Start Act' }))
    await screen.findByText('Mode changed')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await screen.findByText('Patch review')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await screen.findByText('rejected')
    await screen.findByText('Act: ready')
    const rejectCall = fetchMock.callHistory.calls(
      '/project/project123/ai/agent/patches/patch-one/reject'
    )[0]
    expect(JSON.parse(rejectCall.options.body as string)).to.deep.equal({})
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

function mockConfigWithTwoProviders() {
  fetchMock.get('/project/project123/ai/config', {
    providers: [
      {
        id: 'provider-one',
        name: 'Provider One',
        models: [{ id: 'model-one', displayName: 'Model One', enabled: true }],
        defaultModel: 'model-one',
      },
      {
        id: 'provider-two',
        name: 'Provider Two',
        models: [{ id: 'model-two', displayName: 'Model Two', enabled: true }],
        defaultModel: 'model-two',
      },
    ],
  })
}

function mockChatStream(
  overrides: {
    repeat?: number
    deltas?: string[]
  } & Record<string, unknown> = {}
) {
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
  const { deltas = ['Use ', '\\\\cite{} here.'], repeat } = overrides
  const deltaLines = deltas
    .map(delta => JSON.stringify({ type: 'delta', delta }) + '\n')
    .join('')

  fetchMock.post(
    '/project/project123/ai/chat/stream',
    {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
      body:
        deltaLines +
        JSON.stringify({ type: 'done', ...response }) +
        '\n',
    },
    { repeat: repeat ?? 1 }
  )
}

function mockAgentConfig() {
  fetchMock.get('/project/project123/ai/agent/config', {
    permissionProfile: {
      id: 'project-agent-default',
      writeToolsRequireApproval: true,
      externalToolsEnabled: false,
      actRequiredForWriteTools: true,
    },
    tools: [
      {
        name: 'project.read_file',
        description: 'Read file',
        access: 'read',
        requiresApproval: false,
        category: 'project',
        riskLevel: 'low',
      },
    ],
    skills: [
      {
        id: 'latex-compile-debug',
        name: 'latex-compile-debug',
        displayName: 'LaTeX 编译错误诊断',
        description: 'Analyze compile errors',
        modelInvocable: true,
        requiredTools: ['project.read_file'],
        enabled: true,
        scope: 'builtin',
        pluginId: 'latex-core',
      },
    ],
    plugins: [
      {
        id: 'latex-core',
        name: 'latex-core',
        version: '1.0.0',
        displayName: 'LaTeX 核心 Agent 能力包',
        description: 'Built-in LaTeX tools',
        enabled: true,
        skills: ['latex-compile-debug'],
        toolPresets: ['latex-readonly'],
        scope: 'builtin',
      },
    ],
    enabledSkillIds: ['latex-compile-debug'],
    enabledPluginIds: ['latex-core'],
    instructionProfiles: [],
  })
}

function mockAgentSession() {
  fetchMock.post('/project/project123/ai/agent/sessions', {
    session: {
      id: 'session-one',
      projectId: 'project123',
      userId: 'user-one',
      status: 'planning',
      mode: 'plan',
      providerId: 'provider-one',
      model: 'model-one',
      task: 'Explain the project structure.',
      instructionSources: [],
      enabledSkillIds: [],
      enabledPluginIds: [],
      permissionProfileId: 'project-agent-default',
    },
  })
}

function mockAgentTurnStream(options: { repeat?: number } = {}) {
  fetchMock.post('/project/project123/ai/agent/sessions/session-one/turns', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: 'event-one',
          sessionId: 'session-one',
          sequence: 1,
          type: 'tool_call',
          payload: { name: 'project.read_file' },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: {
          id: 'session-one',
          projectId: 'project123',
          userId: 'user-one',
          status: 'waiting_for_act',
          mode: 'plan',
          providerId: 'provider-one',
          model: 'model-one',
          task: 'Explain the project structure.',
          instructionSources: [],
          enabledSkillIds: ['latex-compile-debug'],
          enabledPluginIds: ['latex-core'],
          permissionProfileId: 'project-agent-default',
        },
        answer: 'Agent answer',
      }) +
      '\n',
  }, { repeat: options.repeat ?? 1 })
}

function mockAgentStartAct() {
  fetchMock.post('/project/project123/ai/agent/sessions/session-one/start-act', {
    session: {
      id: 'session-one',
      projectId: 'project123',
      userId: 'user-one',
      status: 'ready_for_act',
      mode: 'act',
      providerId: 'provider-one',
      model: 'model-one',
      task: 'Update wording.',
      instructionSources: [],
      enabledSkillIds: ['latex-compile-debug'],
      enabledPluginIds: ['latex-core'],
      permissionProfileId: 'project-agent-default',
    },
  })
}

function mockAgentPlanThenActTurnStreamWithPatch() {
  let callCount = 0
  fetchMock.post(
    '/project/project123/ai/agent/sessions/session-one/turns',
    () => {
      callCount += 1
      return callCount === 1 ? mockAgentPlanResponse() : mockAgentPatchResponse()
    },
    { repeat: 2 }
  )
}

function mockAgentPlanResponse() {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: 'event-one',
          sessionId: 'session-one',
          sequence: 1,
          type: 'tool_call',
          payload: { name: 'project.read_file' },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: {
          id: 'session-one',
          projectId: 'project123',
          userId: 'user-one',
          status: 'waiting_for_act',
          mode: 'plan',
          providerId: 'provider-one',
          model: 'model-one',
          task: 'Update wording.',
          instructionSources: [],
          enabledSkillIds: ['latex-compile-debug'],
          enabledPluginIds: ['latex-core'],
          permissionProfileId: 'project-agent-default',
        },
        answer: 'Agent answer',
      }) +
      '\n',
  }
}

function mockAgentPatchResponse() {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
    body:
      JSON.stringify({
        type: 'event',
        event: {
          id: 'event-two',
          sessionId: 'session-one',
          sequence: 2,
          type: 'patch_created',
          payload: { patch: mockPatch() },
          createdAt: null,
        },
      }) +
      '\n' +
      JSON.stringify({
        type: 'done',
        session: {
          id: 'session-one',
          projectId: 'project123',
          userId: 'user-one',
          status: 'waiting_for_approval',
          mode: 'act',
          providerId: 'provider-one',
          model: 'model-one',
          task: 'Update wording.',
          instructionSources: [],
          enabledSkillIds: ['latex-compile-debug'],
          enabledPluginIds: ['latex-core'],
          permissionProfileId: 'project-agent-default',
        },
        answer: 'Patch ready for review.',
      }) +
      '\n',
  }
}

function mockPatch() {
  return {
    id: 'patch-one',
    sessionId: 'session-one',
    projectId: 'project123',
    createdByUserId: 'user-one',
    status: 'pending',
    baseRevision: {},
    summary: 'Update wording',
    riskLevel: 'low',
    createdAt: null,
    appliedAt: null,
    operations: [
      {
        type: 'replace_text',
        path: '/main.tex',
        docId: 'doc-main',
        oldText: 'Old sentence.',
        newText: 'New sentence.',
        baseSha256: 'a'.repeat(64),
        proposedSha256: 'b'.repeat(64),
        baseRev: 7,
        diff: {
          path: '/main.tex',
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 2,
          lines: [
            { type: 'context', content: '\\begin{document}' },
            { type: 'remove', content: 'Old sentence.' },
            { type: 'add', content: 'New sentence.' },
          ],
        },
      },
    ],
  }
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
