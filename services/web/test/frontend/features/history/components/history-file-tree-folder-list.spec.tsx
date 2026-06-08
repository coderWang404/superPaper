import { useState } from 'react'
import HistoryFileTreeFolderList from '../../../../../frontend/js/features/history/components/file-tree/history-file-tree-folder-list'
import { HistoryContext } from '../../../../../frontend/js/features/history/context/history-context'
import { EditorProviders } from '../../../helpers/editor-providers'

function HistoryFileTreeHarness({
  children,
}: {
  children: React.ReactNode
}) {
  const [selection, setSelection] = useState({
    updateRange: null,
    comparing: false,
    files: [],
    previouslySelectedPathname: null,
    selectedFile: null,
  })

  return (
    <HistoryContext.Provider
      value={
        {
          selection,
          setSelection,
        } as any
      }
    >
      {children}
    </HistoryContext.Provider>
  )
}

describe('<HistoryFileTreeFolderList/>', function () {
  it('uses one tree role at the root and group roles for nested folders', function () {
    cy.mount(
      <EditorProviders>
        <HistoryFileTreeHarness>
          <HistoryFileTreeFolderList
            rootClassName="history-file-tree-list"
            folders={[
              {
                name: 'chapters',
                folders: [],
                docs: [
                  {
                    name: 'intro.tex',
                    pathname: 'chapters/intro.tex',
                    editable: true,
                  },
                ],
              },
            ]}
            docs={[]}
          />
        </HistoryFileTreeHarness>
      </EditorProviders>
    )

    cy.findAllByRole('tree').should('have.length', 1)
    cy.findByRole('treeitem', { name: 'chapters' }).click()
    cy.findAllByRole('tree').should('have.length', 1)
    cy.findAllByRole('group').should('have.length', 1)
    cy.findByRole('group').within(() => {
      cy.findByRole('treeitem', { name: 'intro.tex' })
    })
  })
})
