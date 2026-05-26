import React from 'react'
import { waitFor, screen } from '@testing-library/react'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import sinon from 'sinon'
import { SocketIOMock } from '@/ide/connection/SocketIoShim'
import useSocketListeners from '@/features/ide-react/hooks/use-socket-listeners'
import { useProjectContext } from '@/shared/context/project-context'
import { renderWithEditorContext } from '../../helpers/render-with-context'
import type { Socket } from '@/features/ide-react/connection/types/socket'
import { EditorManagerContext } from '@/features/ide-react/context/editor-manager-context'

function NoopProvider({ children }: React.PropsWithChildren) {
  return <>{children}</>
}

function ListenerHarness() {
  useSocketListeners()
  const { project } = useProjectContext()
  return <div>{project?.rootFolder[0]?.docs[0]?.name}</div>
}

function makeEditorManagerProvider(openDocWithId: sinon.SinonStub) {
  const EditorManagerProvider = ({ children }: React.PropsWithChildren) => (
    <EditorManagerContext.Provider
      value={
        {
          openDocWithId,
          openDoc: sinon.stub(),
          openDocs: {},
          openFileWithId: sinon.stub(),
          openInitialDoc: sinon.stub(),
          getEditorType: sinon.stub(),
          getCurrentDocValue: sinon.stub(),
          getCurrentDocumentId: sinon.stub(),
          setIgnoringExternalUpdates: sinon.stub(),
          isLoading: false,
          jumpToLine: sinon.stub(),
          debugTimers: { current: {} },
        } as any
      }
    >
      {children}
    </EditorManagerContext.Provider>
  )

  return EditorManagerProvider
}

describe('filesystem change socket listener', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
    window.metaAttributesCache.set('ol-user_id', 'user-1')
    window.metaAttributesCache.set('ol-anonymous', false)
    window.metaAttributesCache.set('ol-ExposedSettings', {
      ...window.metaAttributesCache.get('ol-ExposedSettings'),
      validRootDocExtensions: ['tex'],
    })
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('refreshes the project file tree from the browser file-tree endpoint', async function () {
    const socket = new SocketIOMock()
    fetchMock.get('/project/project123/file-tree', {
      project_id: 'project123',
      rootFolder: [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [{ _id: 'doc-id', name: 'updated.tex' }],
          folders: [],
          fileRefs: [],
        },
      ],
    })

    renderWithEditorContext(<ListenerHarness />, {
      socket: socket as any as Socket,
      providers: {
        LocalCompileProvider: NoopProvider,
        DetachCompileProvider: NoopProvider,
      },
    })

    expect(screen.getByText('main.tex')).to.exist

    socket.emitToClient('project:filesystem:changed', {
      projectId: 'project123',
      changedPaths: ['/updated.tex'],
    })

    await screen.findByText('updated.tex')
    await waitFor(() => {
      const call = fetchMock.callHistory.calls(
        '/project/project123/file-tree'
      )[0]
      expect(call.options.method.toUpperCase()).to.equal('GET')
      expect(fetchMock.callHistory.calls('/project/project123/join')).to.have
        .length(0)
    })
  })

  it('reopens the current editor document when a filesystem change touches it', async function () {
    const socket = new SocketIOMock()
    const openDocWithId = sinon.stub().resolves()
    fetchMock.get('/project/project123/file-tree', {
      project_id: 'project123',
      rootFolder: [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [{ _id: '_root_doc_id', name: 'main.tex' }],
          folders: [],
          fileRefs: [],
        },
      ],
    })

    renderWithEditorContext(<ListenerHarness />, {
      socket: socket as any as Socket,
      scope: {
        editor: {
          currentDocumentId: '_root_doc_id',
          openDocName: 'main.tex',
          sharejs_doc: {
            doc_id: '_root_doc_id',
            getSnapshot: () => 'old content',
            hasBufferedOps: () => false,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
        },
      },
      providers: {
        EditorManagerProvider: makeEditorManagerProvider(openDocWithId),
        LocalCompileProvider: NoopProvider,
        DetachCompileProvider: NoopProvider,
      },
    })

    socket.emitToClient('project:filesystem:changed', {
      projectId: 'project123',
      changedPaths: ['/main.tex'],
    })

    await waitFor(() => {
      expect(openDocWithId).to.have.been.calledOnceWith('_root_doc_id', {
        forceReopen: true,
      })
    })
  })

  it('does not reopen the current editor document when it has buffered ops', async function () {
    const socket = new SocketIOMock()
    const openDocWithId = sinon.stub().resolves()
    fetchMock.get('/project/project123/file-tree', {
      project_id: 'project123',
      rootFolder: [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [{ _id: '_root_doc_id', name: 'main.tex' }],
          folders: [],
          fileRefs: [],
        },
      ],
    })

    renderWithEditorContext(<ListenerHarness />, {
      socket: socket as any as Socket,
      scope: {
        editor: {
          currentDocumentId: '_root_doc_id',
          openDocName: 'main.tex',
          sharejs_doc: {
            doc_id: '_root_doc_id',
            getSnapshot: () => 'local draft',
            hasBufferedOps: () => true,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
        },
      },
      providers: {
        EditorManagerProvider: makeEditorManagerProvider(openDocWithId),
        LocalCompileProvider: NoopProvider,
        DetachCompileProvider: NoopProvider,
      },
    })

    socket.emitToClient('project:filesystem:changed', {
      projectId: 'project123',
      changedPaths: ['/main.tex'],
    })

    await waitFor(() => {
      expect(fetchMock.callHistory.calls('/project/project123/file-tree')).to
        .have.length(1)
    })
    expect(openDocWithId).not.to.have.been.called
  })

  it('does not reopen the current editor document when it was deleted from the refreshed tree', async function () {
    const socket = new SocketIOMock()
    const openDocWithId = sinon.stub().resolves()
    fetchMock.get('/project/project123/file-tree', {
      project_id: 'project123',
      rootFolder: [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [],
          folders: [],
          fileRefs: [],
        },
      ],
    })

    renderWithEditorContext(<ListenerHarness />, {
      socket: socket as any as Socket,
      scope: {
        editor: {
          currentDocumentId: '_root_doc_id',
          openDocName: 'main.tex',
          sharejs_doc: {
            doc_id: '_root_doc_id',
            getSnapshot: () => 'old content',
            hasBufferedOps: () => false,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
        },
      },
      providers: {
        EditorManagerProvider: makeEditorManagerProvider(openDocWithId),
        LocalCompileProvider: NoopProvider,
        DetachCompileProvider: NoopProvider,
      },
    })

    socket.emitToClient('project:filesystem:changed', {
      projectId: 'project123',
      changedPaths: ['/main.tex'],
    })

    await waitFor(() => {
      expect(fetchMock.callHistory.calls('/project/project123/file-tree')).to
        .have.length(1)
    })
    expect(openDocWithId).not.to.have.been.called
  })

  it('reopens the current editor document when it was renamed but keeps the same doc id', async function () {
    const socket = new SocketIOMock()
    const openDocWithId = sinon.stub().resolves()
    fetchMock.get('/project/project123/file-tree', {
      project_id: 'project123',
      rootFolder: [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [{ _id: '_root_doc_id', name: 'renamed.tex' }],
          folders: [],
          fileRefs: [],
        },
      ],
    })

    renderWithEditorContext(<ListenerHarness />, {
      socket: socket as any as Socket,
      scope: {
        editor: {
          currentDocumentId: '_root_doc_id',
          openDocName: 'main.tex',
          sharejs_doc: {
            doc_id: '_root_doc_id',
            getSnapshot: () => 'old content',
            hasBufferedOps: () => false,
            on: () => {},
            off: () => {},
            leaveAndCleanUpPromise: async () => {},
          },
        },
      },
      providers: {
        EditorManagerProvider: makeEditorManagerProvider(openDocWithId),
        LocalCompileProvider: NoopProvider,
        DetachCompileProvider: NoopProvider,
      },
    })

    socket.emitToClient('project:filesystem:changed', {
      projectId: 'project123',
      changedPaths: ['/main.tex', '/renamed.tex'],
    })

    await waitFor(() => {
      expect(openDocWithId).to.have.been.calledOnceWith('_root_doc_id', {
        forceReopen: true,
      })
    })
  })
})
