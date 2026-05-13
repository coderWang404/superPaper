import React, { memo } from 'react'
import { useConnectionContext } from '@/features/ide-react/context/connection-context'
import FileTreeRoot from '@/features/file-tree/components/file-tree-root'
import { useFileTreeOpenContext } from '@/features/ide-react/context/file-tree-open-context'

export const FileTree = memo(function FileTree() {
  const { isConnected, connectionState } = useConnectionContext()
  const { handleFileTreeInit, handleFileTreeSelect, handleFileTreeDelete } =
    useFileTreeOpenContext()

  return (
    <FileTreeRoot
      isConnected={isConnected || connectionState.reconnectAt !== null}
      onInit={handleFileTreeInit}
      onSelect={handleFileTreeSelect}
      onDelete={handleFileTreeDelete}
    />
  )
})
