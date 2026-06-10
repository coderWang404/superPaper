import RestoreProject from '../../../../../frontend/js/features/history/components/change-list/dropdown/menu-item/restore-project'
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

function mountRestoreProject() {
  window.metaAttributesCache.set('ol-splitTestVariants', {
    'revert-file': 'enabled',
    'revert-project': 'enabled',
  })

  cy.mount(
    <EditorProviders>
      <HistoryContext.Provider
        value={
          {
            projectId: 'project123',
            selection,
          } as any
        }
      >
        <RestoreProject
          projectId="project123"
          version={15}
          closeDropdown={cy.stub().as('close-dropdown')}
          endTimestamp={1_704_153_600_000}
        />
      </HistoryContext.Provider>
    </EditorProviders>
  )
}

describe('<RestoreProject/>', function () {
  it('does not call the restore API when the confirmation is cancelled', function () {
    cy.intercept('POST', '/project/*/revert-project', {
      statusCode: 200,
      body: [{ id: '_root_doc_id', type: 'doc', path: 'main.tex' }],
    }).as('restore-project')

    mountRestoreProject()

    cy.findByRole('menuitem', { name: 'Restore project to this version' }).click()
    cy.findByRole('dialog').within(() => {
      cy.findByRole('button', { name: 'Cancel' }).click()
    })

    cy.findByRole('dialog').should('not.exist')
    cy.get('@restore-project.all').should('have.length', 0)
  })

  it('calls the restore API when the confirmation is accepted', function () {
    cy.intercept('POST', '/project/*/revert-project', {
      statusCode: 200,
      body: [{ id: '_root_doc_id', type: 'doc', path: 'main.tex' }],
    }).as('restore-project')

    mountRestoreProject()

    cy.findByRole('menuitem', { name: 'Restore project to this version' }).click()
    cy.findByRole('dialog').within(() => {
      cy.findByRole('button', { name: 'Restore' }).click()
    })

    cy.wait('@restore-project')
      .its('request.body')
      .should('deep.equal', { version: 15 })
  })
})
