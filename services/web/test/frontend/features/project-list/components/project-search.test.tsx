import sinon from 'sinon'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect } from 'chai'
import SearchForm from '../../../../../frontend/js/features/project-list/components/search-form'
import * as eventTracking from '@/infrastructure/event-tracking'
import fetchMock from 'fetch-mock'
import { Filter } from '../../../../../frontend/js/features/project-list/context/project-list-context'
import { Tag } from '../../../../../app/src/Features/Tags/types'
import {
  copyableProject,
  projectsData,
} from '../fixtures/projects-data'
import { renderWithProjectListContext } from '../helpers/render-with-context'
import {
  useProjectListContext,
} from '../../../../../frontend/js/features/project-list/context/project-list-context'
import ProjectListTable from '../../../../../frontend/js/features/project-list/components/table/project-list-table'

function makeSearchProject(id: string, name: string) {
  return {
    ...copyableProject,
    id,
    name,
    archived: false,
    trashed: false,
  }
}

function mockProjectPageResponses(
  responses: Array<{ projects: typeof projectsData; totalSize: number }>
) {
  fetchMock.post('express:/api/project', () => {
    const response = responses.shift()
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function getProjectApiRequestBodies() {
  return fetchMock.callHistory
    .calls()
    .filter(call => call.url.endsWith('/api/project'))
    .map(call => JSON.parse(call.options.body as string))
}

function SearchHarness() {
  const { searchText, setSearchText, filter, tags, selectedTagId } =
    useProjectListContext()
  const selectedTag = tags.find(tag => tag._id === selectedTagId)

  return (
    <>
      <SearchForm
        inputValue={searchText}
        setInputValue={setSearchText}
        filter={filter}
        selectedTag={selectedTag}
      />
      <ProjectListTable />
    </>
  )
}

describe('Project list search form', function () {
  let sendMBSpy: sinon.SinonSpy

  beforeEach(function () {
    sendMBSpy = sinon.spy(eventTracking, 'sendMB')
    fetchMock.removeRoutes().clearHistory()
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    sendMBSpy.restore()
    sinon.restore()
  })

  it('renders the search form', function () {
    const filter: Filter = 'all'
    const selectedTag = undefined
    render(
      <SearchForm
        inputValue=""
        setInputValue={() => {}}
        filter={filter}
        selectedTag={selectedTag}
      />
    )
    screen.getByRole('search')
    screen.getByRole('textbox', { name: /search in all projects/i })
  })

  it('calls clear text when clear button is clicked', function () {
    const filter: Filter = 'all'
    const selectedTag = undefined
    const setInputValueMock = sinon.stub()
    render(
      <SearchForm
        inputValue="abc"
        setInputValue={setInputValueMock}
        filter={filter}
        selectedTag={selectedTag}
      />
    )

    const input = screen.getByRole<HTMLInputElement>('textbox', {
      name: /search in all projects/i,
    })

    expect(input.value).to.equal('abc')

    const clearBtn = screen.getByRole('button', { name: 'clear search' })
    fireEvent.click(clearBtn)

    expect(setInputValueMock).to.be.calledWith('')
  })

  it('changes text', function () {
    const setInputValueMock = sinon.stub()

    const filter: Filter = 'all'
    const selectedTag = undefined

    render(
      <SearchForm
        inputValue=""
        setInputValue={setInputValueMock}
        filter={filter}
        selectedTag={selectedTag}
      />
    )
    const input = screen.getByRole('textbox', {
      name: /search in all projects/i,
    })
    const value = 'abc'

    fireEvent.change(input, { target: { value } })

    expect(sendMBSpy).to.have.been.calledOnce
    expect(sendMBSpy).to.have.been.calledWith('project-list-page-interaction', {
      action: 'search',
      page: '/',
      isSmallDevice: true,
    })
    expect(setInputValueMock).to.be.calledWith(value)
  })

  type TestCase = {
    filter: Filter
    selectedTag: Tag | undefined
    expectedText: string
  }

  const placeholderTestCases: Array<TestCase> = [
    // Filter, without tag
    {
      filter: 'all',
      selectedTag: undefined,
      expectedText: 'search in all projects',
    },
    {
      filter: 'owned',
      selectedTag: undefined,
      expectedText: 'search in your projects',
    },
    {
      filter: 'shared',
      selectedTag: undefined,
      expectedText: 'search in projects shared with you',
    },
    {
      filter: 'archived',
      selectedTag: undefined,
      expectedText: 'search in archived projects',
    },
    {
      filter: 'trashed',
      selectedTag: undefined,
      expectedText: 'search in trashed projects',
    },
    // Tags
    {
      filter: 'all',
      selectedTag: { _id: '', user_id: '', name: 'sometag' },
      expectedText: 'search sometag',
    },
    {
      filter: 'shared',
      selectedTag: { _id: '', user_id: '', name: 'othertag' },
      expectedText: 'search othertag',
    },
  ]

  for (const testCase of placeholderTestCases) {
    it(`renders placeholder text for filter:${testCase.filter}, tag:${testCase?.selectedTag?.name}`, function () {
      render(
        <SearchForm
          inputValue=""
          setInputValue={() => {}}
          filter={testCase.filter}
          selectedTag={testCase.selectedTag}
        />
      )
      screen.getByRole('search')
      screen.getByRole('textbox', {
        name: new RegExp(testCase.expectedText, 'i'),
      })
    })
  }

  it('debounces search requests and resets to the first page when search is cleared', async function () {
    const initialProjects = [
      makeSearchProject('first-1', 'Initial Project 1'),
      makeSearchProject('first-2', 'Initial Project 2'),
    ]
    const searchProjects = [makeSearchProject('search-1', 'Alpha Result')]
    const resetProjects = [
      makeSearchProject('reset-1', 'Reset Project 1'),
      makeSearchProject('reset-2', 'Reset Project 2'),
    ]
    mockProjectPageResponses([
      { projects: initialProjects, totalSize: 40 },
      { projects: searchProjects, totalSize: 1 },
      { projects: resetProjects, totalSize: 40 },
    ])

    renderWithProjectListContext(<SearchHarness />, { mockProjectApi: false })

    await screen.findByText('Initial Project 1')
    const input = screen.getByRole('textbox', {
      name: /search in all projects/i,
    })

    let clock = sinon.useFakeTimers()
    fireEvent.change(input, { target: { value: 'alpha' } })
    expect(getProjectApiRequestBodies()).to.have.length(1)

    clock.tick(299)
    expect(getProjectApiRequestBodies()).to.have.length(1)

    clock.tick(1)
    await fetchMock.callHistory.flush(true)
    clock.restore()
    await waitFor(() => expect(getProjectApiRequestBodies()).to.have.length(2))
    await screen.findByText('Alpha Result')

    clock = sinon.useFakeTimers()
    fireEvent.change(input, { target: { value: '' } })
    clock.tick(300)
    await fetchMock.callHistory.flush(true)
    clock.restore()
    await waitFor(() => expect(getProjectApiRequestBodies()).to.have.length(3))
    await screen.findByText('Reset Project 1')

    expect(getProjectApiRequestBodies()[1]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false, search: 'alpha' },
      page: { size: 20, offset: 0 },
    })
    expect(getProjectApiRequestBodies()[2]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false },
      page: { size: 20, offset: 0 },
    })
  })
})
