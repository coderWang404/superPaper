import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import LoadMore from '../../../../../frontend/js/features/project-list/components/load-more'
import {
  projectsData,
  makeLongProjectList,
  currentProjects,
  copyableProject,
} from '../fixtures/projects-data'
import { GetProjectsResponseBody } from '../../../../../types/project/dashboard/api'
import { renderWithProjectListContext } from '../helpers/render-with-context'
import ProjectListTable from '../../../../../frontend/js/features/project-list/components/table/project-list-table'

function makePagedProjects(offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const projectNumber = offset + index + 1
    return {
      ...copyableProject,
      id: `paged-project-${projectNumber}`,
      name: `Paged Project ${projectNumber}`,
      lastUpdated: new Date(projectNumber).toISOString(),
      archived: false,
      trashed: false,
    }
  })
}

function mockProjectPageResponses(
  responses: Array<
    {
      projects: ReturnType<typeof makePagedProjects>
      totalSize: number
    } & Partial<GetProjectsResponseBody>
  >
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

describe('<LoadMore />', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('renders on a project list longer than 40', async function () {
    const { fullList, currentList } = makeLongProjectList(55)

    renderWithProjectListContext(<LoadMore />, {
      projects: fullList,
    })

    await screen.findByRole('button', {
      name: /Show 20 more projects/i,
    })

    await screen.findByText(`Showing 20 out of ${currentList.length} projects.`)

    await screen.findByRole('button', {
      name: /Show all projects/i,
    })
  })

  it('renders on a project list longer than 20 and shorter than 40', async function () {
    const { fullList, currentList } = makeLongProjectList(30)

    renderWithProjectListContext(<LoadMore />, { projects: fullList })

    await screen.findByRole('button', {
      name: new RegExp(`Show ${currentList.length - 20} more projects`, 'i'),
    })

    await screen.findByText(`Showing 20 out of ${currentList.length} projects.`)

    await screen.findByRole('button', {
      name: /Show all projects/i,
    })
  })

  it('renders on a project list shorter than 20', async function () {
    renderWithProjectListContext(<LoadMore />, { projects: projectsData })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show all' })).to.not.exist
      screen.getByText(
        `Showing ${currentProjects.length} out of ${currentProjects.length} projects.`
      )
    })
  })

  it('change text when pressing the "Show 20 more" once for project list longer than 40', async function () {
    const { fullList, currentList } = makeLongProjectList(55)

    renderWithProjectListContext(<LoadMore />, { projects: fullList })

    await waitFor(() => {
      const showMoreBtn = screen.getByRole('button', {
        name: /Show 20 more projects/i,
      })
      fireEvent.click(showMoreBtn)
    })

    await waitFor(() => {
      screen.getByRole('button', {
        name: `Show ${currentList.length - 20 - 20} more projects`,
      })
      screen.getByText(`Showing 40 out of ${currentList.length} projects.`)
    })
  })

  it('change text when pressing the "Show 20 more" once for project list longer than 20 and shorter than 40', async function () {
    const { fullList, currentList } = makeLongProjectList(30)

    renderWithProjectListContext(<LoadMore />, { projects: fullList })

    await waitFor(() => {
      const showMoreBtn = screen.getByRole('button', {
        name: /Show 7 more projects/i,
      })
      fireEvent.click(showMoreBtn)
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Show/ })).to.not.exist
      screen.getByText(
        `Showing ${currentList.length} out of ${currentList.length} projects.`
      )
    })
  })

  it('requests the next page and appends projects when loading more', async function () {
    const firstPage = makePagedProjects(0, 20)
    const secondPage = makePagedProjects(20, 5)
    mockProjectPageResponses([
      { projects: firstPage, totalSize: 25 },
      { projects: secondPage, totalSize: 25 },
    ])

    renderWithProjectListContext(
      <>
        <ProjectListTable />
        <LoadMore />
      </>,
      { mockProjectApi: false }
    )

    await screen.findByText('Paged Project 1')
    const loadMoreButton = await screen.findByRole('button', {
      name: /Show 5 more projects/i,
    })

    fireEvent.click(loadMoreButton)

    await screen.findByText('Paged Project 25')
    screen.getByText('Showing 25 out of 25 projects.')

    const requestBodies = getProjectApiRequestBodies()
    expect(requestBodies[0]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false },
      page: { size: 20, offset: 0 },
    })
    expect(requestBodies[1]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false },
      page: { size: 5, offset: 20 },
    })
  })

  it('uses the server nextOffset when loading more', async function () {
    const firstPage = makePagedProjects(0, 10)
    const secondPage = makePagedProjects(20, 10)
    mockProjectPageResponses([
      {
        projects: firstPage,
        totalSize: 30,
        page: { size: 20, offset: 0, nextOffset: 20 },
      },
      {
        projects: secondPage,
        totalSize: 30,
        page: { size: 20, offset: 20, nextOffset: null },
      },
    ])

    renderWithProjectListContext(
      <>
        <ProjectListTable />
        <LoadMore />
      </>,
      { mockProjectApi: false }
    )

    await screen.findByText('Paged Project 1')
    fireEvent.click(
      await screen.findByRole('button', { name: /Show 20 more projects/i })
    )

    await screen.findByText('Paged Project 30')

    const requestBodies = getProjectApiRequestBodies()
    expect(requestBodies[1]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false },
      page: { size: 20, offset: 20 },
    })
  })

  it('keeps existing rows visible and shows loading rows while fetching the next page', async function () {
    const firstPage = makePagedProjects(0, 20)
    const secondPage = makePagedProjects(20, 5)
    let resolveSecondPage: () => void = () => {}
    fetchMock.post('express:/api/project', () => {
      const calls = fetchMock.callHistory.calls('/api/project')
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({ projects: firstPage, totalSize: 25 }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      return new Promise<Response>(resolve => {
        resolveSecondPage = () => {
          resolve(
            new Response(
              JSON.stringify({ projects: secondPage, totalSize: 25 }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          )
        }
      })
    })

    renderWithProjectListContext(
      <>
        <ProjectListTable />
        <LoadMore />
      </>,
      { mockProjectApi: false }
    )

    await screen.findByText('Paged Project 1')
    const loadMoreButton = await screen.findByRole('button', {
      name: /Show 5 more projects/i,
    })

    fireEvent.click(loadMoreButton)

    await screen.findByRole('status', { name: 'Loading more projects' })
    screen.getByText('Paged Project 1')
    expect(loadMoreButton).to.have.property('disabled', true)
    expect(screen.getAllByTestId('project-list-loading-row')).to.have.length(3)

    resolveSecondPage()

    await screen.findByText('Paged Project 25')
    expect(screen.queryByRole('status', { name: 'Loading more projects' })).to
      .equal(null)
    expect(screen.queryByTestId('project-list-loading-row')).to.equal(null)
  })

  it('loads every remaining server page when showing all projects', async function () {
    const firstPage = makePagedProjects(0, 20)
    const secondPage = makePagedProjects(20, 100)
    const thirdPage = makePagedProjects(120, 20)
    mockProjectPageResponses([
      { projects: firstPage, totalSize: 140 },
      { projects: secondPage, totalSize: 140 },
      { projects: thirdPage, totalSize: 140 },
    ])

    renderWithProjectListContext(
      <>
        <ProjectListTable />
        <LoadMore />
      </>,
      { mockProjectApi: false }
    )

    await screen.findByText('Paged Project 1')
    fireEvent.click(
      await screen.findByRole('button', { name: /Show all projects/i })
    )

    await screen.findByText('Paged Project 140')
    screen.getByText('Showing 140 out of 140 projects.')

    const requestBodies = getProjectApiRequestBodies()
    expect(requestBodies[1]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false },
      page: { size: 100, offset: 20 },
    })
    expect(requestBodies[2]).to.deep.equal({
      sort: { by: 'lastUpdated', order: 'desc' },
      filters: { archived: false, trashed: false },
      page: { size: 20, offset: 120 },
    })
  })

  it('uses each server nextOffset when showing all projects', async function () {
    const firstPage = makePagedProjects(0, 10)
    const secondPage = makePagedProjects(20, 10)
    const thirdPage = makePagedProjects(40, 5)
    mockProjectPageResponses([
      {
        projects: firstPage,
        totalSize: 45,
        page: { size: 20, offset: 0, nextOffset: 20 },
      },
      {
        projects: secondPage,
        totalSize: 45,
        page: { size: 20, offset: 20, nextOffset: 40 },
      },
      {
        projects: thirdPage,
        totalSize: 45,
        page: { size: 20, offset: 40, nextOffset: null },
      },
    ])

    renderWithProjectListContext(
      <>
        <ProjectListTable />
        <LoadMore />
      </>,
      { mockProjectApi: false }
    )

    await screen.findByText('Paged Project 1')
    fireEvent.click(
      await screen.findByRole('button', { name: /Show all projects/i })
    )

    await screen.findByText('Paged Project 45')

    const requestBodies = getProjectApiRequestBodies()
    expect(requestBodies[1].page).to.deep.equal({ size: 25, offset: 20 })
    expect(requestBodies[2].page).to.deep.equal({ size: 5, offset: 40 })
  })
})
