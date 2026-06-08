import { fireEvent, screen } from '@testing-library/react'
import { expect } from 'chai'
import { SidebarFilter } from '../../../../../../frontend/js/features/project-list/components/sidebar/sidebar-filters'
import {
  renderWithProjectListContext,
  resetProjectListContextFetch,
} from '../../helpers/render-with-context'

describe('<SidebarFilter />', function () {
  beforeEach(function () {
    global.localStorage.clear()
  })

  afterEach(function () {
    global.localStorage.clear()
    resetProjectListContextFetch()
  })

  it('exposes the active filter state semantically', function () {
    renderWithProjectListContext(
      <ul>
        <SidebarFilter filter="all" text="All projects" />
        <SidebarFilter filter="owned" text="Your projects" />
      </ul>
    )

    const allProjectsButton = screen.getByRole('button', {
      name: 'All projects',
    })
    const yourProjectsButton = screen.getByRole('button', {
      name: 'Your projects',
    })

    expect(allProjectsButton.getAttribute('aria-current')).to.equal('page')
    expect(yourProjectsButton.getAttribute('aria-current')).to.be.null

    fireEvent.click(yourProjectsButton)

    expect(allProjectsButton.getAttribute('aria-current')).to.be.null
    expect(yourProjectsButton.getAttribute('aria-current')).to.equal('page')
  })
})
