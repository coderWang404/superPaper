import { ComponentProps, FC, useRef, useState } from 'react'
import FileTreeContext from '@/features/file-tree/components/file-tree-context'

export const FileTreeProvider: FC<React.PropsWithChildren> = ({ children }) => {
  const [fileTreeContainer, setFileTreeContainer] =
    useState<HTMLDivElement | null>(null)

  const propsRef = useRef<ComponentProps<typeof FileTreeContext>>()

  if (propsRef.current === undefined) {
    propsRef.current = {
      onSelect: cy.stub(),
    }
  }

  return (
    <div ref={setFileTreeContainer}>
      {fileTreeContainer && (
        <FileTreeContext fileTreeContainer={fileTreeContainer} {...propsRef.current}>
          <>{children}</>
        </FileTreeContext>
      )}
    </div>
  )
}
