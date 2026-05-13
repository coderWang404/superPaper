import { FileTreeMainProvider } from '../contexts/file-tree-main'
import { FileTreeActionableProvider } from '../contexts/file-tree-actionable'
import { FileTreeSelectableProvider } from '../contexts/file-tree-selectable'
import { FileTreeDraggableProvider } from '../contexts/file-tree-draggable'
import { FC } from 'react'

// renders all the contexts needed for the file tree:
// FileTreeMain: generic store
// FileTreeActionable: global UI state for actions (rename, delete, etc.)
// FileTreeMutable: provides entities mutation operations
// FileTreeSelectable: handles selection and multi-selection
const FileTreeContext: FC<
  React.PropsWithChildren<{
    onSelect: () => void
    fileTreeContainer?: HTMLDivElement
  }>
> = ({ onSelect, fileTreeContainer, children }) => {
  return (
    <FileTreeMainProvider>
      <FileTreeSelectableProvider onSelect={onSelect}>
        <FileTreeActionableProvider>
          <FileTreeDraggableProvider fileTreeContainer={fileTreeContainer}>
            {children}
          </FileTreeDraggableProvider>
        </FileTreeActionableProvider>
      </FileTreeSelectableProvider>
    </FileTreeMainProvider>
  )
}

export default FileTreeContext
