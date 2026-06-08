import PdfViewer from '../../../../frontend/js/features/pdf-preview/components/pdf-viewer'
import { DetachCompileContext } from '../../../../frontend/js/shared/context/detach-compile-context'
import { EditorProviders } from '../../helpers/editor-providers'

describe('<PdfViewer/>', function () {
  it('uses the localized PDF preview name for the native iframe title', function () {
    cy.mount(
      <EditorProviders>
        <DetachCompileContext.Provider
          value={
            {
              pdfUrl: '/build/123/output.pdf',
              pdfViewer: 'native',
              pdfFile: {},
            } as React.ComponentProps<typeof DetachCompileContext.Provider>['value']
          }
        >
          <PdfViewer />
        </DetachCompileContext.Provider>
      </EditorProviders>
    )

    cy.findByTitle('PDF preview').should('have.attr', 'title', 'PDF preview')
  })
})
