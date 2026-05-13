import { fireEvent, render, screen } from '@testing-library/react'
import WelcomeMessageComponent from '../../../../../frontend/js/features/project-list/components/welcome-message'
import { expect } from 'chai'
import getMeta from '@/utils/meta'
import { SplitTestProvider } from '@/shared/context/split-test-context'

const WelcomeMessage = () => {
  return (
    <SplitTestProvider>
      <WelcomeMessageComponent />
    </SplitTestProvider>
  )
}

describe('<WelcomeMessage />', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-splitTestVariants', {
      'import-docx': 'enabled',
    })

    Object.assign(getMeta('ol-ExposedSettings'), {
      isSuperPaper: true,
      wikiEnabled: true,
      templatesEnabled: true,
      enablePandocConversions: true,
    })
  })

  it('renders welcome page correctly', function () {
    render(<WelcomeMessage />)

    screen.getByText('Welcome to superPaper')
    screen.getByText('Create a new project')
    screen.getByText('Learn LaTeX with a tutorial')
    screen.getByText('Browse templates')
  })

  it('shows correct dropdown when clicking create a new project', function () {
    render(<WelcomeMessage />)

    const button = screen.getByRole('button', {
      name: 'Create a new project',
    })

    fireEvent.click(button)

    screen.getByText('Blank project')
    screen.getByText('Example project')
    screen.getByText('Upload project')
    screen.getByText('Import Word document')
    screen.getByText('Import from GitHub')
  })

  it('does not show the import from Word document when the feature is disabled', function () {
    getMeta('ol-ExposedSettings').enablePandocConversions = false
    render(<WelcomeMessage />)

    const button = screen.getByRole('button', {
      name: 'Create a new project',
    })

    fireEvent.click(button)

    screen.getByText('Blank project')
    expect(screen.queryByText('Import Word document')).to.not.exist
  })

  it('shows correct link for latex tutorial menu', function () {
    render(<WelcomeMessage />)

    const link = screen.getByRole('link', {
      name: 'Learn LaTeX with a tutorial',
    })

    expect(link.getAttribute('href')).to.equal(
      '/learn/latex/Learn_LaTeX_in_30_minutes'
    )
  })

  it('shows correct link for browse templates menu', function () {
    render(<WelcomeMessage />)

    const link = screen.getByRole('link', {
      name: 'Browse templates',
    })

    expect(link.getAttribute('href')).to.equal('/templates')
  })

  describe('when not in SaaS', function () {
    beforeEach(function () {
      getMeta('ol-ExposedSettings').isSuperPaper = false
    })

    it('renders welcome page correctly', function () {
      render(<WelcomeMessage />)

      screen.getByText('Welcome to superPaper')
      screen.getByText('Create a new project')
      screen.getByText('Learn LaTeX with a tutorial')
      screen.getByText('Browse templates')
    })

    it("doesn't display github in the dropdown when clicking create a new project", function () {
      render(<WelcomeMessage />)

      const button = screen.getByRole('button', {
        name: 'Create a new project',
      })

      fireEvent.click(button)

      screen.getByText('Blank project')
      screen.getByText('Example project')
      screen.getByText('Upload project')
      expect(screen.queryByText('Import from GitHub')).to.not.exist
    })

    it('does not render the tutorial link when the learn wiki is not configured', function () {
      getMeta('ol-ExposedSettings').wikiEnabled = false
      render(<WelcomeMessage />)

      expect(screen.queryByText('Learn LaTeX with a tutorial')).to.not.exist
    })

    it('does not render the templates link when templates are not configured', function () {
      getMeta('ol-ExposedSettings').templatesEnabled = false
      render(<WelcomeMessage />)

      expect(screen.queryByText('Browse templates')).to.not.exist
    })
  })
})
