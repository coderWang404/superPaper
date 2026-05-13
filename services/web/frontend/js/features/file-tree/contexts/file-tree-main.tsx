import { createContext, FC, useContext, useState } from 'react'

type ContextMenuCoords = { top: number; left: number }

const FileTreeMainContext = createContext<
  | {
      contextMenuCoords: ContextMenuCoords | null
      setContextMenuCoords: (value: ContextMenuCoords | null) => void
    }
  | undefined
>(undefined)

export function useFileTreeMainContext() {
  const context = useContext(FileTreeMainContext)

  if (!context) {
    throw new Error(
      'useFileTreeMainContext is only available inside FileTreeMainProvider'
    )
  }

  return context
}

export const FileTreeMainProvider: FC<
  React.PropsWithChildren
> = ({ children }) => {
  const [contextMenuCoords, setContextMenuCoords] =
    useState<ContextMenuCoords | null>(null)

  return (
    <FileTreeMainContext.Provider
      value={{
        contextMenuCoords,
        setContextMenuCoords,
      }}
    >
      {children}
    </FileTreeMainContext.Provider>
  )
}
