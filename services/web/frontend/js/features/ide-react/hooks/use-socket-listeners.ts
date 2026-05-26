import { useTranslation } from 'react-i18next'
import useSocketListener from '@/features/ide-react/hooks/use-socket-listener'
import {
  listProjectInvites,
  listProjectMembers,
} from '@/features/share-project-modal/utils/api'
import { useProjectContext } from '@/shared/context/project-context'
import { useConnectionContext } from '@/features/ide-react/context/connection-context'
import { useIdeReactContext } from '@/features/ide-react/context/ide-react-context'
import { useModalsContext } from '@/features/ide-react/context/modals-context'
import { getJSON } from '@/infrastructure/fetch-json'
import { debugConsole } from '@/utils/debugging'
import { useCallback } from 'react'
import { PublicAccessLevel } from '../../../../../types/public-access-level'
import { useLocation } from '@/shared/hooks/use-location'
import { useEditorOpenDocContext } from '@/features/ide-react/context/editor-open-doc-context'
import { useEditorManagerContext } from '@/features/ide-react/context/editor-manager-context'
import { pathInFolder } from '@/features/file-tree/util/path'
import type { Folder } from '../../../../../types/folder'

function normalizeProjectPath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

function currentOpenDocWasChanged({
  rootFolder,
  currentDocumentId,
  changedPaths,
}: {
  rootFolder: Folder[] | undefined
  currentDocumentId: string | null
  changedPaths: string[] | undefined
}) {
  if (!currentDocumentId || !changedPaths?.length || !rootFolder?.[0]) {
    return false
  }

  const currentDocPath = pathInFolder(rootFolder[0], currentDocumentId)
  if (!currentDocPath) {
    return false
  }

  const normalizedCurrentDocPath = normalizeProjectPath(currentDocPath)
  return changedPaths
    .map(normalizeProjectPath)
    .includes(normalizedCurrentDocPath)
}

function useSocketListeners() {
  const { t } = useTranslation()
  const { socket } = useConnectionContext()
  const { showGenericMessageModal } = useModalsContext()
  const { permissionsLevel } = useIdeReactContext()
  const { projectId, updateProject } = useProjectContext()
  const { currentDocumentId, currentDocument } = useEditorOpenDocContext()
  const { openDocWithId } = useEditorManagerContext()
  const location = useLocation()

  useSocketListener(
    socket,
    'project:access:revoked',
    useCallback(() => {
      showGenericMessageModal(
        t('removed_from_project'),
        t(
          'you_have_been_removed_from_this_project_and_will_be_redirected_to_project_dashboard'
        )
      )

      // redirect to project page before reconnect timer runs out and reloads the page
      const timer = window.setTimeout(() => {
        location.assign('/project')
      }, 5000)

      return () => {
        window.clearTimeout(timer)
      }
    }, [showGenericMessageModal, t, location])
  )

  useSocketListener(
    socket,
    'project:publicAccessLevel:changed',
    useCallback(
      (data: { newAccessLevel?: PublicAccessLevel }) => {
        if (data.newAccessLevel) {
          updateProject({ publicAccessLevel: data.newAccessLevel })
        }
      },
      [updateProject]
    )
  )

  useSocketListener(
    socket,
    'project:collaboratorAccessLevel:changed',
    useCallback(() => {
      listProjectMembers(projectId)
        .then(({ members }) => {
          if (members) {
            updateProject({ members })
          }
        })
        .catch(err => {
          debugConsole.error('Error fetching members for project', err)
        })
    }, [projectId, updateProject])
  )

  useSocketListener(
    socket,
    'project:membership:changed',
    useCallback(
      (data: { members?: boolean; invites?: boolean }) => {
        if (data.members) {
          listProjectMembers(projectId)
            .then(({ members }) => {
              if (members) {
                updateProject({ members })
              }
            })
            .catch(err => {
              debugConsole.error('Error fetching members for project', err)
            })
        }

        if (data.invites && permissionsLevel === 'owner') {
          listProjectInvites(projectId)
            .then(({ invites }) => {
              if (invites) {
                updateProject({ invites })
              }
            })
            .catch(err => {
              debugConsole.error('Error fetching invites for project', err)
            })
        }
      },
      [projectId, updateProject, permissionsLevel]
    )
  )

  useSocketListener(
    socket,
    'project:filesystem:changed',
    useCallback(
      (payload?: { changedPaths?: string[] }) => {
        getJSON(`/project/${projectId}/file-tree`)
          .then(({ rootFolder }: any) => {
            updateProject({ rootFolder })
            if (
              currentOpenDocWasChanged({
                rootFolder,
                currentDocumentId,
                changedPaths: payload?.changedPaths,
              }) &&
              !currentDocument?.hasBufferedOps()
            ) {
              openDocWithId(currentDocumentId, { forceReopen: true }).catch(
                err => {
                  debugConsole.error(
                    'Error reopening document after filesystem change',
                    err
                  )
                }
              )
            }
          })
          .catch(err => {
            debugConsole.error(
              'Error refreshing project after filesystem change',
              err
            )
          })
      },
      [
        currentDocument,
        currentDocumentId,
        openDocWithId,
        projectId,
        updateProject,
      ]
    )
  )

  useSocketListener(
    socket,
    'mainBibliographyDocUpdated',
    useCallback(
      (payload: string) => {
        updateProject({ mainBibliographyDocId: payload })
      },
      [updateProject]
    )
  )

  useSocketListener(
    socket,
    'projectNameUpdated',
    useCallback(
      (payload: string) => {
        updateProject({ name: payload })
      },
      [updateProject]
    )
  )
}

export default useSocketListeners
