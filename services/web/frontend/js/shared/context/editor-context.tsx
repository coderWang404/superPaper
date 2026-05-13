import {
  createContext,
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import useBrowserWindow from '../hooks/use-browser-window'
import { useProjectContext } from './project-context'
import { useDetachContext } from './detach-context'
import getMeta from '../../utils/meta'
import { useUserContext } from './user-context'
import { saveProjectSettings } from '@/features/editor-left-menu/utils/api'
import { useModalsContext } from '@/features/ide-react/context/modals-context'

export const EditorContext = createContext<
  | {
      renameProject: (newName: string) => void
      isProjectOwner: boolean
      isRestrictedTokenMember?: boolean
      isPendingEditor: boolean
    }
  | undefined
>(undefined)

export const EditorProvider: FC<React.PropsWithChildren> = ({ children }) => {
  const { id: userId } = useUserContext()
  const { role } = useDetachContext()
  const { showGenericMessageModal } = useModalsContext()

  const {
    projectId,
    project,
    name: projectName,
    updateProject,
  } = useProjectContext()
  const { owner, members } = project || {}

  const isPendingEditor = useMemo(
    () =>
      Boolean(
        members?.some(
          member =>
            member._id === userId &&
            (member.pendingEditor || member.pendingReviewer)
        )
      ),
    [members, userId]
  )

  const renameProject = useCallback(
    (newName: string) => {
      const oldName = projectName
      if (newName !== oldName) {
        updateProject({ name: newName })
        saveProjectSettings(projectId, { name: newName }).catch(
          (response: any) => {
            updateProject({ name: oldName })
            const { data, status } = response

            showGenericMessageModal(
              'Error renaming project',
              status === 400 ? data : 'Please try again in a moment'
            )
          }
        )
      }
    },
    [projectName, updateProject, projectId, showGenericMessageModal]
  )

  const { setTitle } = useBrowserWindow()
  useEffect(() => {
    const parts = []

    if (role === 'detached') {
      parts.push('[PDF]')
    }

    if (projectName) {
      parts.push(projectName)
      parts.push('-')
    }

    parts.push('Online LaTeX Editor')
    parts.push(getMeta('ol-ExposedSettings').appName)

    const title = parts.join(' ')

    setTitle(title)
  }, [projectName, setTitle, role])

  const value = useMemo(
    () => ({
      renameProject,
      isProjectOwner: owner?._id === userId,
      isRestrictedTokenMember: getMeta('ol-isRestrictedTokenMember'),
      isPendingEditor,
    }),
    [owner, userId, renameProject, isPendingEditor]
  )

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  )
}

export function useEditorContext() {
  const context = useContext(EditorContext)

  if (!context) {
    throw new Error('useEditorContext is only available inside EditorProvider')
  }

  return context
}
