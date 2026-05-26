import { RailLayout } from '@/features/ide-react/components/rail/rail'
import { EditorProviders } from '../../../helpers/editor-providers'
import { Panel, PanelGroup } from 'react-resizable-panels'

describe('<RailLayout /> AI assistant', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
    window.metaAttributesCache.set('ol-ExposedSettings', {
      ...window.metaAttributesCache.get('ol-ExposedSettings'),
      isSuperPaper: true,
      validRootDocExtensions: ['tex'],
    })
    cy.intercept('GET', '/project/project123/ai/config', {
      providers: [],
    })
  })

  it('opens the AI assistant tab from the rail', function () {
    cy.mount(
      <EditorProviders>
        <PanelGroup direction="horizontal">
          <RailLayout />
          <Panel>Editor</Panel>
        </PanelGroup>
      </EditorProviders>
    )

    cy.findByRole('button', { name: 'More options' }).click()
    cy.findByRole('tab', { name: 'AI Assistant' })
      .find('.material-symbols')
      .should('have.text', 'smart_toy')
    cy.findByRole('tab', { name: 'Agent Settings' })
      .find('.material-symbols')
      .should('have.text', 'tune')
    cy.findByRole('tab', { name: 'AI Assistant' }).click()
    cy.findByRole('heading', { name: 'AI Assistant' })
    cy.findByText('No AI provider configured')
  })
})
