import React from 'react'
import { waitFor, screen } from '@testing-library/react'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import { SocketIOMock } from '@/ide/connection/SocketIoShim'
import useSocketListeners from '@/features/ide-react/hooks/use-socket-listeners'
import { useProjectContext } from '@/shared/context/project-context'
import { renderWithEditorContext } from '../../helpers/render-with-context'
import type { Socket } from '@/features/ide-react/connection/types/socket'

function NoopProvider({ children }: React.PropsWithChildren) {
  return <>{children}</>
}

function ListenerHarness() {
  useSocketListeners()
  const { project } = useProjectContext()
  return <div>{project?.rootFolder[0]?.docs[0]?.name}</div>
}

describe('filesystem change socket listener', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
    window.metaAttributesCache.set('ol-user_id', 'user-1')
    window.metaAttributesCache.set('ol-anonymous', false)
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('refreshes project metadata from the join endpoint', async function () {
    const socket = new SocketIOMock()
    fetchMock.post('/project/project123/join', {
      project: {
        _id: 'project123',
        rootFolder: [
          {
            _id: 'root-folder-id',
            name: 'rootFolder',
            docs: [{ _id: 'doc-id', name: 'updated.tex' }],
            folders: [],
            fileRefs: [],
          },
        ],
      },
      privilegeLevel: 'owner',
      isRestrictedUser: false,
      isTokenMember: false,
      isInvitedMember: false,
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
      const call = fetchMock.callHistory.calls('/project/project123/join')[0]
      expect(call.options.method.toUpperCase()).to.equal('POST')
      expect(JSON.parse(call.options.body as string)).to.deep.equal({
        userId: 'user-1',
      })
    })
  })
})
