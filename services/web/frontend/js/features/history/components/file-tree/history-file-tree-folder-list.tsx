import classNames from 'classnames'

import HistoryFileTreeDoc from './history-file-tree-doc'
import HistoryFileTreeFolder from './history-file-tree-folder'
import { createContext, ReactNode, useCallback, useContext } from 'react'
import type { HistoryFileTree, HistoryDoc } from '../../utils/file-tree'
import { useHistoryContext } from '../../context/history-context'
import { FileDiff } from '../../services/types/file'
import { fileFinalPathname } from '../../utils/file-diff'

type HistoryFileTreeFolderListProps = {
  folders: HistoryFileTree[]
  docs: HistoryDoc[]
  rootClassName?: string
  children?: ReactNode
}

const HistoryFileTreeFolderListContext = createContext(false)

function HistoryFileTreeFolderList({
  folders,
  docs,
  rootClassName,
  children,
}: HistoryFileTreeFolderListProps) {
  const isNestedList = useContext(HistoryFileTreeFolderListContext)
  const { selection, setSelection } = useHistoryContext()

  const handleEvent = useCallback(
    (file: FileDiff) => {
      setSelection(prevSelection => {
        if (file.pathname !== prevSelection.selectedFile?.pathname) {
          return {
            ...prevSelection,
            selectedFile: file,
            previouslySelectedPathname: file.pathname,
          }
        }

        return prevSelection
      })
    },
    [setSelection]
  )

  const handleClick = useCallback(
    (file: FileDiff) => {
      handleEvent(file)
    },
    [handleEvent]
  )

  const handleKeyDown = useCallback(
    (file: FileDiff, event: React.KeyboardEvent<HTMLLIElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handleEvent(file)
      }
    },
    [handleEvent]
  )

  return (
    <HistoryFileTreeFolderListContext.Provider value>
      <ul
        className={classNames('list-unstyled', rootClassName)}
        role={isNestedList ? 'group' : 'tree'}
      >
        {folders.map(folder => (
          <HistoryFileTreeFolder
            key={folder.name}
            name={folder.name}
            folders={folder.folders}
            docs={folder.docs ?? []}
          />
        ))}
        {docs.map(doc => (
          <HistoryFileTreeDoc
            key={doc.pathname}
            name={doc.name}
            file={doc}
            selected={
              !!selection.selectedFile &&
              fileFinalPathname(selection.selectedFile) === doc.pathname
            }
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          />
        ))}
        {children}
      </ul>
    </HistoryFileTreeFolderListContext.Provider>
  )
}

export default HistoryFileTreeFolderList
