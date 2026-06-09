import {
  cloneDeep,
  concat,
  filter as arrayFilter,
  find,
  flatten,
  uniq,
  uniqBy,
  without,
} from 'lodash'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Tag } from '../../../../../app/src/Features/Tags/types'
import {
  ClonedProject,
  Filters,
  GetProjectsRequestBody,
  GetProjectsResponseBody,
  Project,
  Sort,
} from '../../../../../types/project/dashboard/api'
import usePersistedState from '../../../shared/hooks/use-persisted-state'
import getMeta from '../../../utils/meta'
import useAsync from '../../../shared/hooks/use-async'
import { getProjects } from '../util/api'
import sortProjects from '../util/sort-projects'
import {
  isArchivedOrTrashed,
  isDeletableProject,
  isLeavableProject,
} from '../util/project'
import { debugConsole } from '@/utils/debugging'

const MAX_PROJECT_PER_PAGE = 20
const MAX_PROJECTS_PER_SERVER_PAGE = 100
const SEARCH_DEBOUNCE_MS = 300

export type Filter = 'all' | 'owned' | 'shared' | 'archived' | 'trashed'
type FilterMap = {
  [key in Filter]: Partial<Project> | ((project: Project) => boolean) // eslint-disable-line no-unused-vars
}
const filters: FilterMap = {
  all: {
    archived: false,
    trashed: false,
  },
  owned: {
    accessLevel: 'owner',
    archived: false,
    trashed: false,
  },
  shared: project => {
    return (
      project.accessLevel !== 'owner' && !project.archived && !project.trashed
    )
  },
  archived: {
    archived: true,
    trashed: false,
  },
  trashed: {
    trashed: true,
  },
}

export const UNCATEGORIZED_KEY = 'uncategorized'

export type ProjectListContextValue = {
  addClonedProjectToViewData: (project: ClonedProject) => void
  selectOrUnselectAllProjects: React.Dispatch<React.SetStateAction<boolean>>
  visibleProjects: Project[]
  totalProjectsCount: number
  error: Error | null
  isLoading: ReturnType<typeof useAsync>['isLoading']
  isPageLoading: boolean
  loadProgress: number
  sort: Sort
  setSort: React.Dispatch<React.SetStateAction<Sort>>
  tags: Tag[]
  untaggedProjectsCount: number
  projectsPerTag: Record<Tag['_id'], { length: number }>
  filter: Filter
  selectFilter: (filter: Filter) => void
  selectedTagId?: string | undefined
  selectTag: (tagId: string) => void
  addTag: (tag: Tag) => void
  updateTag: (tagId: string, newTagName: string, newTagColor?: string) => void
  deleteTag: (tagId: string) => void
  updateProjectViewData: (newProjectData: Project) => void
  removeProjectFromView: (project: Project) => void
  addProjectToTagInView: (tagId: string, projectId: string) => void
  removeProjectFromTagInView: (tagId: string, projectId: string) => void
  searchText: string
  setSearchText: React.Dispatch<React.SetStateAction<string>>
  selectedProjects: Project[]
  selectedProjectIds: Set<string>
  setSelectedProjectIds: React.Dispatch<React.SetStateAction<Set<string>>>
  toggleSelectedProject: (projectId: string, selected?: boolean) => void
  hiddenProjectsCount: number
  loadMoreCount: number
  showAllProjects: () => void
  loadMoreProjects: () => void
  hasLeavableProjectsSelected: boolean
  hasDeletableProjectsSelected: boolean
}

export const ProjectListContext = createContext<
  ProjectListContextValue | undefined
>(undefined)

type ProjectListProviderProps = {
  children: ReactNode
}

export function ProjectListProvider({ children }: ProjectListProviderProps) {
  const prefetchedProjectsBlob = getMeta('ol-prefetchedProjectsBlob')
  const [loadedProjects, setLoadedProjects] = useState<Project[]>(
    prefetchedProjectsBlob?.projects ?? []
  )
  const [visibleProjects, setVisibleProjects] = useState<Project[]>([])
  const [maxVisibleProjects, setMaxVisibleProjects] =
    useState(MAX_PROJECT_PER_PAGE)
  const [hiddenProjectsCount, setHiddenProjectsCount] = useState(0)
  const [loadMoreCount, setLoadMoreCount] = useState(0)
  const [loadProgress, setLoadProgress] = useState(
    prefetchedProjectsBlob ? 100 : 20
  )
  const [totalProjectsCount, setTotalProjectsCount] = useState<number>(
    prefetchedProjectsBlob?.totalSize ?? 0
  )
  const [serverPageNextOffset, setServerPageNextOffset] = useState<
    number | null | undefined
  >(prefetchedProjectsBlob?.page?.nextOffset)
  const [isServerPagedResponse, setIsServerPagedResponse] = useState(
    Boolean(prefetchedProjectsBlob?.page)
  )
  const [serverTagCounts, setServerTagCounts] =
    useState<GetProjectsResponseBody['tagCounts']>(
      prefetchedProjectsBlob?.tagCounts
    )
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [sort, setSort] = useState<Sort>({
    by: 'lastUpdated',
    order: 'desc',
  })
  const [filter, setFilter] = usePersistedState<Filter>(
    'project-list-filter',
    'all'
  )
  const prevSortRef = useRef<Sort>(sort)
  const didMountRefreshRef = useRef(false)
  const didLoadInitialProjectsRef = useRef(false)
  const projectRequestGenerationRef = useRef(0)
  const [selectedTagId, setSelectedTagId] = usePersistedState<
    string | undefined
  >('project-list-selected-tag-id', undefined)
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  const olTags = getMeta('ol-tags') || []

  const [tags, setTags] = useState<Tag[]>(() =>
    // `tag.name` data may be null for some old users
    olTags.map(tag => ({ ...tag, name: tag.name ?? '' }))
  )

  const [searchText, setSearchText] = useState('')

  const {
    isLoading: loading,
    isIdle,
    error,
    runAsync,
  } = useAsync<GetProjectsResponseBody>({
    status: prefetchedProjectsBlob ? 'resolved' : 'pending',
    data: prefetchedProjectsBlob,
  })
  const isLoading = isIdle ? true : loading

  const buildProjectFilters = useCallback(
    (search: string = searchText): Filters => {
      const filters: Filters = {}
      const trimmedSearch = search.trim()

      if (selectedTagId !== undefined) {
        filters.archived = false
        filters.trashed = false
        if (selectedTagId === UNCATEGORIZED_KEY) {
          filters.tag = null
        } else {
          const selectedTag = tags.find(tag => tag._id === selectedTagId)
          if (selectedTag) {
            filters.tag = selectedTag._id
          }
        }
      } else if (filter === 'all') {
        filters.archived = false
        filters.trashed = false
      } else if (filter === 'owned') {
        filters.ownedByUser = true
        filters.archived = false
        filters.trashed = false
      } else if (filter === 'shared') {
        filters.sharedWithUser = true
        filters.archived = false
        filters.trashed = false
      } else if (filter === 'archived') {
        filters.archived = true
        filters.trashed = false
      } else if (filter === 'trashed') {
        filters.trashed = true
      }

      if (trimmedSearch.length > 0) {
        filters.search = trimmedSearch
      }

      return filters
    },
    [filter, searchText, selectedTagId, tags]
  )

  const buildProjectsRequest = useCallback(
    (page: GetProjectsRequestBody['page']): GetProjectsRequestBody => {
      const request: GetProjectsRequestBody = {
        sort,
        page,
      }
      const filters = buildProjectFilters()

      if (Object.keys(filters).length > 0) {
        request.filters = filters
      }

      return request
    },
    [buildProjectFilters, sort]
  )

  const canUsePrefetchedProjects =
    prefetchedProjectsBlob &&
    filter === 'all' &&
    selectedTagId === undefined &&
    searchText.trim() === '' &&
    sort.by === 'lastUpdated' &&
    sort.order === 'desc'

  useEffect(() => {
    if (prefetchedProjectsBlob || didLoadInitialProjectsRef.current) return
    didLoadInitialProjectsRef.current = true
    const requestGeneration = ++projectRequestGenerationRef.current
    setLoadProgress(40)
    runAsync(
      getProjects(
        buildProjectsRequest({ size: MAX_PROJECT_PER_PAGE, offset: 0 })
      )
    )
      .then(data => {
        if (requestGeneration !== projectRequestGenerationRef.current) {
          return
        }
        setLoadedProjects(data.projects)
        setTotalProjectsCount(data.totalSize)
        setServerPageNextOffset(data.page?.nextOffset)
        setIsServerPagedResponse(Boolean(data.page))
        setServerTagCounts(data.tagCounts)
      })
      .catch(debugConsole.error)
      .finally(() => {
        if (requestGeneration !== projectRequestGenerationRef.current) {
          return
        }
        setLoadProgress(100)
      })
  }, [buildProjectsRequest, prefetchedProjectsBlob, runAsync])

  useEffect(() => {
    if (!didMountRefreshRef.current) {
      didMountRefreshRef.current = true
      if (!prefetchedProjectsBlob || canUsePrefetchedProjects) {
        return
      }
    }

    const requestGeneration = ++projectRequestGenerationRef.current
    const timeout = window.setTimeout(() => {
      setIsPageLoading(true)
      getProjects(
        buildProjectsRequest({ size: MAX_PROJECT_PER_PAGE, offset: 0 })
      )
        .then(data => {
          if (requestGeneration !== projectRequestGenerationRef.current) {
            return
          }
          setLoadedProjects(data.projects)
          setTotalProjectsCount(data.totalSize)
          setServerPageNextOffset(data.page?.nextOffset)
          setIsServerPagedResponse(Boolean(data.page))
          setServerTagCounts(data.tagCounts)
          setMaxVisibleProjects(MAX_PROJECT_PER_PAGE)
          setSelectedProjectIds(new Set())
        })
        .catch(debugConsole.error)
        .finally(() => {
          if (requestGeneration !== projectRequestGenerationRef.current) {
            return
          }
          setIsPageLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [buildProjectsRequest])

  useEffect(() => {
    let filteredProjects = [...loadedProjects]

    if (isServerPagedResponse) {
      const hasMoreServerPages = serverPageNextOffset != null
      const serverHiddenProjectsCount = Math.max(
        hasMoreServerPages ? totalProjectsCount - loadedProjects.length : 0,
        0
      )
      setVisibleProjects(filteredProjects.slice(0, maxVisibleProjects))
      setHiddenProjectsCount(serverHiddenProjectsCount)
      setLoadMoreCount(
        Math.min(serverHiddenProjectsCount, MAX_PROJECT_PER_PAGE)
      )
      return
    }

    if (searchText.length) {
      filteredProjects = filteredProjects.filter(project =>
        project.name.toLowerCase().includes(searchText.toLowerCase())
      )
    }

    if (selectedTagId !== undefined) {
      if (selectedTagId === UNCATEGORIZED_KEY) {
        const taggedProjectIds = uniq(flatten(tags.map(tag => tag.project_ids)))
        filteredProjects = filteredProjects.filter(
          project =>
            !project.archived &&
            !project.trashed &&
            !taggedProjectIds.includes(project.id)
        )
      } else {
        const tag = tags.find(tag => tag._id === selectedTagId)
        if (tag) {
          filteredProjects = filteredProjects.filter(
            p => !isArchivedOrTrashed(p) && tag?.project_ids?.includes(p.id)
          )
        } else {
          setSelectedTagId(undefined)
        }
      }
    } else {
      filteredProjects = arrayFilter(filteredProjects, filters[filter])
    }

    if (prevSortRef.current !== sort) {
      filteredProjects = sortProjects(filteredProjects, sort)
      const loadedProjectsSorted = sortProjects(loadedProjects, sort)
      setLoadedProjects(loadedProjectsSorted)
    }

    const serverHiddenProjectsCount = Math.max(
      totalProjectsCount - loadedProjects.length,
      0
    )

    if (filteredProjects.length > maxVisibleProjects) {
      const visibleFilteredProjects = filteredProjects.slice(
        0,
        maxVisibleProjects
      )

      const hiddenFilteredProjectsCount =
        filteredProjects.slice(maxVisibleProjects).length

      setVisibleProjects(visibleFilteredProjects)
      setHiddenProjectsCount(hiddenFilteredProjectsCount)

      if (hiddenFilteredProjectsCount > MAX_PROJECT_PER_PAGE) {
        setLoadMoreCount(MAX_PROJECT_PER_PAGE)
      } else {
        setLoadMoreCount(hiddenFilteredProjectsCount)
      }
    } else if (serverHiddenProjectsCount > 0) {
      setVisibleProjects(filteredProjects)
      setHiddenProjectsCount(serverHiddenProjectsCount)
      setLoadMoreCount(
        Math.min(serverHiddenProjectsCount, MAX_PROJECT_PER_PAGE)
      )
    } else {
      setVisibleProjects(filteredProjects)
      setLoadMoreCount(0)
      setHiddenProjectsCount(0)
    }
  }, [
    loadedProjects,
    maxVisibleProjects,
    totalProjectsCount,
    tags,
    filter,
    setFilter,
    selectedTagId,
    setSelectedTagId,
    searchText,
    sort,
    isServerPagedResponse,
    serverPageNextOffset,
  ])

  useEffect(() => {
    prevSortRef.current = sort
  }, [sort])

  const showAllProjects = useCallback(() => {
    const hasMorePages =
      loadedProjects.length < totalProjectsCount &&
      (!isServerPagedResponse || serverPageNextOffset != null)

    if (hasMorePages) {
      const requestGeneration = projectRequestGenerationRef.current
      const fetchRemainingProjects = async () => {
        setIsPageLoading(true)
        let offset = serverPageNextOffset ?? loadedProjects.length
        let totalSize = totalProjectsCount
        const projectsToAppend: Project[] = []

        while (offset != null && offset < totalSize) {
          const pageSize = Math.min(
            MAX_PROJECTS_PER_SERVER_PAGE,
            totalSize - offset
          )
          const data = await getProjects(
            buildProjectsRequest({
              size: pageSize,
              offset,
            })
          )
          if (requestGeneration !== projectRequestGenerationRef.current) {
            return
          }
          projectsToAppend.push(...data.projects)
          offset = data.page
            ? data.page.nextOffset
            : offset + data.projects.length
          totalSize = data.totalSize

          if (offset == null || data.projects.length === 0) {
            break
          }
        }

        setLoadedProjects(loadedProjects =>
          uniqBy([...loadedProjects, ...projectsToAppend], 'id')
        )
        setTotalProjectsCount(totalSize)
        setServerPageNextOffset(offset)
        setIsServerPagedResponse(isServerPagedResponse)
        setMaxVisibleProjects(totalSize)
      }

      fetchRemainingProjects()
        .catch(debugConsole.error)
        .finally(() => {
          if (requestGeneration !== projectRequestGenerationRef.current) {
            return
          }
          setIsPageLoading(false)
        })
      return
    }

    setLoadMoreCount(0)
    setHiddenProjectsCount(0)
    setMaxVisibleProjects(maxVisibleProjects + hiddenProjectsCount)
  }, [
    buildProjectsRequest,
    hiddenProjectsCount,
    isServerPagedResponse,
    loadedProjects.length,
    maxVisibleProjects,
    serverPageNextOffset,
    totalProjectsCount,
  ])

  const loadMoreProjects = useCallback(() => {
    const hasMorePages =
      loadedProjects.length < totalProjectsCount &&
      loadedProjects.length <= maxVisibleProjects &&
      (!isServerPagedResponse || serverPageNextOffset != null)

    if (hasMorePages) {
      const requestGeneration = projectRequestGenerationRef.current
      setIsPageLoading(true)
      getProjects(
        buildProjectsRequest({
          size: loadMoreCount,
          offset: isServerPagedResponse
            ? serverPageNextOffset ?? loadedProjects.length
            : loadedProjects.length,
        })
      )
        .then(data => {
          if (requestGeneration !== projectRequestGenerationRef.current) {
            return
          }
          setLoadedProjects(loadedProjects =>
            uniqBy([...loadedProjects, ...data.projects], 'id')
          )
          setTotalProjectsCount(data.totalSize)
          setServerPageNextOffset(data.page?.nextOffset)
          setIsServerPagedResponse(Boolean(data.page))
          setServerTagCounts(data.tagCounts)
          setMaxVisibleProjects(maxVisibleProjects =>
            maxVisibleProjects + data.projects.length
          )
        })
        .catch(debugConsole.error)
        .finally(() => {
          if (requestGeneration !== projectRequestGenerationRef.current) {
            return
          }
          setIsPageLoading(false)
        })
      return
    }

    setMaxVisibleProjects(maxVisibleProjects + loadMoreCount)
  }, [
    buildProjectsRequest,
    isServerPagedResponse,
    loadedProjects.length,
    loadMoreCount,
    maxVisibleProjects,
    serverPageNextOffset,
    totalProjectsCount,
  ])

  const [selectedProjectIds, setSelectedProjectIds] = useState(
    () => new Set<string>()
  )

  const toggleSelectedProject = useCallback(
    (projectId: string, selected?: boolean) => {
      setSelectedProjectIds(prevSelectedProjectIds => {
        const selectedProjectIds = new Set(prevSelectedProjectIds)
        if (selected === true) {
          selectedProjectIds.add(projectId)
        } else if (selected === false) {
          selectedProjectIds.delete(projectId)
        } else if (selectedProjectIds.has(projectId)) {
          selectedProjectIds.delete(projectId)
        } else {
          selectedProjectIds.add(projectId)
        }
        return selectedProjectIds
      })
    },
    []
  )

  const selectedProjects = useMemo(() => {
    return visibleProjects.filter(project => selectedProjectIds.has(project.id))
  }, [selectedProjectIds, visibleProjects])

  const selectOrUnselectAllProjects = useCallback(
    (checked: any) => {
      setSelectedProjectIds(prevSelectedProjectIds => {
        const selectedProjectIds = new Set(prevSelectedProjectIds)
        for (const project of visibleProjects) {
          if (checked) {
            selectedProjectIds.add(project.id)
          } else {
            selectedProjectIds.delete(project.id)
          }
        }
        return selectedProjectIds
      })
    },
    [visibleProjects]
  )

  const untaggedProjectsCount = useMemo(() => {
    if (serverTagCounts) {
      return serverTagCounts.untagged
    }
    const taggedProjectIds = uniq(flatten(tags.map(tag => tag.project_ids)))
    return loadedProjects.filter(
      project =>
        !project.archived &&
        !project.trashed &&
        !taggedProjectIds.includes(project.id)
    ).length
  }, [tags, loadedProjects, serverTagCounts])

  const projectsPerTag = useMemo(() => {
    return tags.reduce<Record<Tag['_id'], { length: number }>>(
      (prev, curTag) => {
        const serverCount = serverTagCounts?.byTagId[curTag._id]
        if (serverCount != null) {
          return {
            ...prev,
            [curTag._id]: {
              length: serverCount,
            },
          }
        }
        const projectIds = new Set(curTag.project_ids || [])
        return {
          ...prev,
          [curTag._id]: {
            length: loadedProjects.filter(
              project =>
                !isArchivedOrTrashed(project) && projectIds.has(project.id)
            ).length,
          },
        }
      },
      {}
    )
  }, [tags, loadedProjects, serverTagCounts])

  const selectFilter = useCallback(
    (filter: Filter) => {
      setFilter(filter)
      setSelectedTagId(undefined)
      const selected = false
      selectOrUnselectAllProjects(selected)
    },
    [selectOrUnselectAllProjects, setFilter, setSelectedTagId]
  )

  const selectTag = useCallback(
    (tagId: string) => {
      setFilter('all')
      setSelectedTagId(tagId)
    },
    [setSelectedTagId, setFilter]
  )

  const addTag = useCallback((tag: Tag) => {
    setTags(tags => uniqBy(concat(tags, [tag]), '_id'))
  }, [])

  const updateTag = useCallback(
    (tagId: string, newTagName: string, newTagColor?: string) => {
      setTags(tags => {
        const newTags = cloneDeep(tags)
        const tag = find(newTags, ['_id', tagId])
        if (tag) {
          tag.name = newTagName
          tag.color = newTagColor
        }
        return newTags
      })
    },
    []
  )

  const deleteTag = useCallback(
    (tagId: string | null) => {
      setTags(tags => tags.filter(tag => tag._id !== tagId))
    },
    [setTags]
  )

  const addProjectToTagInView = useCallback(
    (tagId: string, projectId: string) => {
      setTags(tags => {
        const updatedTags = [...tags]
        for (const tag of updatedTags) {
          if (tag._id === tagId) {
            tag.project_ids = uniq([...(tag.project_ids || []), projectId])
          }
        }
        return updatedTags
      })
    },
    [setTags]
  )

  const removeProjectFromTagInView = useCallback(
    (tagId: string, projectId: string) => {
      setTags(tags => {
        const updatedTags = [...tags]
        for (const tag of updatedTags) {
          if (tag._id === tagId) {
            tag.project_ids = without(tag.project_ids || [], projectId)
          }
        }
        return updatedTags
      })
    },
    [setTags]
  )

  const addClonedProjectToViewData = useCallback(
    (project: ClonedProject) => {
      // clone API not using camelCase and does not return all data

      const owner = {
        id: project.owner?._id,
        email: project.owner?.email,
        firstName: project.owner?.first_name,
        lastName: project.owner?.last_name,
      }

      const clonedProject: Project = {
        ...project,
        id: project.project_id,
        owner,
        lastUpdatedBy: owner,
        source: 'owner',
        trashed: false,
        archived: false,
        accessLevel: 'owner',
      }

      setLoadedProjects(loadedProjects => {
        return sortProjects([...loadedProjects, clonedProject], sort)
      })
    },
    [sort]
  )

  const updateProjectViewData = useCallback((newProjectData: Project) => {
    setLoadedProjects(loadedProjects => {
      return loadedProjects.map(p =>
        p.id === newProjectData.id ? { ...newProjectData } : p
      )
    })
  }, [])

  const removeProjectFromView = useCallback((project: Project) => {
    setLoadedProjects(loadedProjects => {
      return loadedProjects.filter(p => p.id !== project.id)
    })
  }, [])

  const hasLeavableProjectsSelected = useMemo(
    () => selectedProjects.some(isLeavableProject),
    [selectedProjects]
  )

  const hasDeletableProjectsSelected = useMemo(
    () => selectedProjects.some(isDeletableProject),
    [selectedProjects]
  )

  const value = useMemo<ProjectListContextValue>(
    () => ({
      addTag,
      addClonedProjectToViewData,
      addProjectToTagInView,
      deleteTag,
      error,
      filter,
      hasLeavableProjectsSelected,
      hasDeletableProjectsSelected,
      hiddenProjectsCount,
      isLoading,
      isPageLoading,
      loadMoreCount,
      loadMoreProjects,
      loadProgress,
      removeProjectFromTagInView,
      removeProjectFromView,
      selectedTagId,
      selectFilter,
      selectedProjects,
      selectedProjectIds,
      selectOrUnselectAllProjects,
      selectTag,
      searchText,
      setSearchText,
      setSelectedProjectIds,
      setShowCustomPicker,
      setSort,
      showAllProjects,
      showCustomPicker,
      sort,
      tags,
      toggleSelectedProject,
      totalProjectsCount,
      untaggedProjectsCount,
      updateProjectViewData,
      updateTag,
      projectsPerTag,
      visibleProjects,
    }),
    [
      addTag,
      addClonedProjectToViewData,
      addProjectToTagInView,
      deleteTag,
      error,
      filter,
      hasLeavableProjectsSelected,
      hasDeletableProjectsSelected,
      hiddenProjectsCount,
      isLoading,
      isPageLoading,
      loadMoreCount,
      loadMoreProjects,
      loadProgress,
      removeProjectFromTagInView,
      removeProjectFromView,
      selectedTagId,
      selectFilter,
      selectedProjectIds,
      selectedProjects,
      selectOrUnselectAllProjects,
      selectTag,
      searchText,
      setSearchText,
      setSelectedProjectIds,
      setShowCustomPicker,
      setSort,
      showAllProjects,
      showCustomPicker,
      sort,
      tags,
      toggleSelectedProject,
      totalProjectsCount,
      untaggedProjectsCount,
      updateProjectViewData,
      updateTag,
      projectsPerTag,
      visibleProjects,
    ]
  )

  return (
    <ProjectListContext.Provider value={value}>
      {children}
    </ProjectListContext.Provider>
  )
}

export function useProjectListContext() {
  const context = useContext(ProjectListContext)
  if (!context) {
    throw new Error(
      'ProjectListContext is only available inside ProjectListProvider'
    )
  }
  return context
}
