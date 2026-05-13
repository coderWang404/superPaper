import { EditorProviders } from '../../helpers/editor-providers'
import { SplitTestProvider } from '@/shared/context/split-test-context'
import { useActiveOverallTheme } from '@/shared/hooks/use-active-overall-theme'

const TestComponent = ({ overallTheme }: { overallTheme: string }) => {
  return (
    <SplitTestProvider>
      <EditorProviders
        userSettings={{
          overallTheme,
        }}
      >
        <TestComponentInner />
      </EditorProviders>
    </SplitTestProvider>
  )
}

const TestComponentInner = () => {
  const overallTheme = useActiveOverallTheme()
  return <div data-testid="overall-theme">{overallTheme}</div>
}

describe('useActiveOverallTheme', function () {
  it('Is dark in default mode', function () {
    cy.mount(<TestComponent overallTheme="" />)
    cy.findByTestId('overall-theme').should('have.text', 'dark')
  })

  it('Is light when in light mode', function () {
    cy.mount(<TestComponent overallTheme="light-" />)
    cy.findByTestId('overall-theme').should('have.text', 'light')
  })

  describe('when overall theme is system', function () {
    function stubMediaQuery(prefersDark: boolean) {
      cy.window().then(win => {
        cy.stub(win, 'matchMedia')
          .withArgs('(prefers-color-scheme: dark)')
          .returns({
            matches: prefersDark,
            addEventListener: () => {},
            removeEventListener: () => {},
          } as any)
      })
    }

    it('is dark when browser prefers dark', function () {
      stubMediaQuery(true)
      cy.mount(<TestComponent overallTheme="system" />)
      cy.findByTestId('overall-theme').should('have.text', 'dark')
    })

    it('is light when browser prefers light', function () {
      stubMediaQuery(false)
      cy.mount(<TestComponent overallTheme="system" />)
      cy.findByTestId('overall-theme').should('have.text', 'light')
    })
  })
})
