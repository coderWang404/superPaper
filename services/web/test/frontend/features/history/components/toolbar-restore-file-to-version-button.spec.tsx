import ToolbarRestoreFileToVersionButton from '../../../../../frontend/js/features/history/components/diff-view/toolbar/toolbar-restore-file-to-version-button'
import { HistoryContext } from '../../../../../frontend/js/features/history/context/history-context'
import { EditorProviders } from '../../../helpers/editor-providers'

const selection = {
  updateRange: {
    fromV: 12,
    toV: 15,
    fromVTimestamp: 1_704_067_200_000,
    toVTimestamp: 1_704_153_600_000,
  },
  comparing: false,
  files: [{ pathname: 'main.tex', editable: true }],
  selectedFile: { pathname: 'main.tex', editable: true },
  previouslySelectedPathname: 'main.tex',
}

function mountRestoreButton() {
  cy.mount(
    <EditorProviders>
      <HistoryContext.Provider
        value={
          {
            projectId: 'project123',
          } as any
        }
      >
        <ToolbarRestoreFileToVersionButton selection={selection as any} />
      </HistoryContext.Provider>
    </EditorProviders>
  )
}

describe('<ToolbarRestoreFileToVersionButton/>', function () {
  it('does not call the restore API when the confirmation is cancelled', function () {
    cy.intercept('POST', '/project/*/revert_file', {
      statusCode: 200,
      body: { id: '_root_doc_id', type: 'doc' },
    }).as('restore-file-to-version')

    mountRestoreButton()

    cy.findByRole('button', { name: 'Restore this version' }).click()
    cy.findByRole('dialog').within(() => {
      cy.findByRole('button', { name: 'Cancel' }).click()
    })

    cy.findByRole('dialog').should('not.exist')
    cy.get('@restore-file-to-version.all').should('have.length', 0)
  })

  it('calls the restore API when the confirmation is accepted', function () {
    cy.intercept('POST', '/project/*/revert_file', {
      statusCode: 200,
      body: { id: '_root_doc_id', type: 'doc' },
    }).as('restore-file-to-version')

    mountRestoreButton()

    cy.findByRole('button', { name: 'Restore this version' }).click()
    cy.findByRole('dialog').within(() => {
      cy.findByRole('button', { name: 'Restore' }).click()
    })

    cy.wait('@restore-file-to-version')
      .its('request.body')
      .should('deep.equal', { pathname: 'main.tex', version: 15 })
  })
})
