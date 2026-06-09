// @ts-check
import _ from 'lodash'
import Metrics from '@superpaper/metrics'
import ProjectHelper from './ProjectHelper.mjs'
import ProjectGetter from './ProjectGetter.mjs'
import PrivilegeLevels from '../Authorization/PrivilegeLevels.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import Sources from '../Authorization/Sources.mjs'
import UserGetter from '../User/UserGetter.mjs'
import TagsHandler from '../Tags/TagsHandler.mjs'
import { expressify } from '@superpaper/promise-utils'
import logger from '@superpaper/logger'
import NotificationsHandler from '../Notifications/NotificationsHandler.mjs'
import { OError, V1ConnectionError } from '../Errors/Errors.js'
import { User } from '../../models/User.mjs'
import Settings from '@superpaper/settings'
import UserPrimaryEmailCheckHandler from '../User/UserPrimaryEmailCheckHandler.mjs'
import UserController from '../User/UserController.mjs'
import TutorialHandler from '../Tutorial/TutorialHandler.mjs'
import UserSettingsHelper from './UserSettingsHelper.mjs'

const DEFAULT_PROJECT_LIST_PAGE_SIZE = 20
const MAX_PROJECT_LIST_PAGE_SIZE = 100
const MAX_PROJECT_LIST_SEARCH_LENGTH = 200

/**
 * @import { GetProjectsRequest, GetProjectsResponse, AllUsersProjects, MongoProject, FormattedProject, MongoTag } from "./types"
 * @import { Project, ProjectApi, ProjectAccessLevel, Filters, Page, Sort, UserRef } from "../../../../types/project/dashboard/api"
 * @import { Source } from "../Authorization/types"
 */

/**
 * @param {any} req
 */
function cleanupSession(req) {
  // cleanup redirects at the end of the redirect chain
  delete req.session.postCheckoutRedirect
  delete req.session.postLoginRedirect
  delete req.session.postOnboardingRedirect

  // cleanup details from register page
  delete req.session.sharedProjectData
  delete req.session.templateData
}

/**
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
async function projectListPage(req, res, next) {
  cleanupSession(req)

  const userId = SessionManager.getLoggedInUserId(req.session)

  const projectsBlobPending = _getProjects(
    userId,
    { archived: false, trashed: false },
    { by: 'lastUpdated', order: 'desc' },
    { size: DEFAULT_PROJECT_LIST_PAGE_SIZE, offset: 0 }
  ).catch(err => {
    logger.err({ err, userId }, 'projects listing in background failed')
    return undefined
  })

  const user = await User.findById(
    userId,
    'email isAdmin emails features alphaProgram lastPrimaryEmailCheck lastActive signUpDate ace completedTutorials aiFeatures labsProgram'
  )

  // Handle case of deleted user
  if (user == null) {
    UserController.logout(req, res, next)
    return
  }

  if (
    user &&
    UserPrimaryEmailCheckHandler.requiresPrimaryEmailCheck({
      email: user.email,
      emails: user.emails,
      lastPrimaryEmailCheck: user.lastPrimaryEmailCheck,
      signUpDate: user.signUpDate,
    })
  ) {
    return res.redirect('/user/emails/primary-email-check')
  }

  const tags = await TagsHandler.promises.getAllTags(userId)

  /** @type {{ list: any[], error?: any }} */
  let userEmailsData = {
    list: [],
  }

  try {
    const fullEmails = await UserGetter.promises.getUserFullEmails(userId)
    userEmailsData.list = fullEmails
  } catch (error) {
    if (!(error instanceof V1ConnectionError)) {
      logger.error({ err: error, userId }, 'Failed to get user full emails')
    }
  }

  const userEmails = userEmailsData.list || []

  const notifications =
    await NotificationsHandler.promises.getUserNotifications(userId)

  for (const notification of notifications) {
    notification.html = req.i18n.translate(
      notification.templateKey,
      notification.messageOpts
    )
  }

  const prefetchedProjectsBlob = await projectsBlobPending
  Metrics.inc('project-list-prefetch-projects', 1, {
    status: prefetchedProjectsBlob ? 'success' : 'error',
  })

  const inactiveTutorials = TutorialHandler.getInactiveTutorials(user)

  const userSettings = await UserSettingsHelper.buildUserSettings(
    req,
    res,
    user
  )

  res.render('project/list-react', {
    title: 'your_projects',
    notifications,
    user,
    userEmails,
    userSettings,
    tags,
    prefetchedProjectsBlob,
    projectDashboardReact: true, // used in navbar
    userRestrictions: Array.from(req.userRestrictions || []),
    inactiveTutorials,
  })
}

/**
 * Load user's projects with pagination, sorting and filters
 *
 * @param {GetProjectsRequest} req the request
 * @param {GetProjectsResponse} res the response
 * @returns {Promise<void>}
 */
async function getProjectsJson(req, res) {
  const request = _normalizeGetProjectsRequest(req.body)
  if (request == null) {
    return res.status(400).json({ error: 'invalid_project_list_request' })
  }
  const { filters, page, sort } = request
  const userId = SessionManager.getLoggedInUserId(req.session)
  const projectsPage = await _getProjects(userId, filters, sort, page)
  res.json(projectsPage)
}

/**
 * @param {string} userId
 * @param {Filters} filters
 * @param {Sort} sort
 * @param {Page} page
 * @returns {Promise<{
 *   totalSize: number,
 *   projects: Project[],
 *   page?: { size: number, offset: number, nextOffset: number | null },
 *   tagCounts: { untagged: number, byTagId: Record<string, number> },
 * }>}
 * @private
 */
async function _getProjects(
  userId,
  filters = {},
  sort = { by: 'lastUpdated', order: 'desc' },
  page
) {
  if (Settings.enableProjectListDbPagination && page != null) {
    const tags = await TagsHandler.promises.getAllTags(userId)
    return await ProjectGetter.promises.findUsersProjectListPage(userId, {
      filters,
      sort,
      page: _normalizePage(page),
      tags,
    })
  }

  /** @type {[AllUsersProjects, MongoTag[]]} */
  const results = await Promise.all([
    ProjectGetter.promises.findAllUsersProjects(
      userId,
      'name lastUpdated lastUpdatedBy publicAccesLevel archived trashed owner_ref tokens'
    ),
    TagsHandler.promises.getAllTags(userId),
  ])
  const [allProjects, tags] = results
  const formattedProjects = _formatProjects(allProjects, userId)
  const filteredProjects = _applyFilters(
    formattedProjects,
    tags,
    filters,
    userId
  )
  const responseMeta = {
    page: _buildPageResponse(page, filteredProjects.length),
    tagCounts: _buildTagCounts(
      _applyFilters(
        formattedProjects,
        tags,
        _getTagCountFilters(filters),
        userId
      ),
      tags
    ),
  }
  if (sort.by === 'owner') {
    const projectsWithUsers = await _injectProjectUsers(filteredProjects)
    const pagedProjects = _sortAndPaginate(projectsWithUsers, sort, page)
    return {
      totalSize: filteredProjects.length,
      projects: pagedProjects,
      ...responseMeta,
    }
  }

  const pagedProjects = _sortAndPaginate(filteredProjects, sort, page)

  const projects = await _injectProjectUsers(pagedProjects)

  return {
    totalSize: filteredProjects.length,
    projects,
    ...responseMeta,
  }
}

/**
 * @param {any} body
 * @returns {{filters: Filters, sort: Sort, page?: Page} | null}
 * @private
 */
function _normalizeGetProjectsRequest(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }

  const sort = _normalizeSort(body.sort)
  const filters = _normalizeFilters(body.filters)
  const page = _normalizePageRequest(body.page)

  if (sort == null || filters == null || page === null) {
    return null
  }

  return {
    filters,
    sort,
    ...(page === undefined ? {} : { page }),
  }
}

/**
 * @param {any} sort
 * @returns {Sort | null}
 * @private
 */
function _normalizeSort(sort) {
  if (sort === undefined) {
    return { by: 'lastUpdated', order: 'desc' }
  }
  if (sort == null || typeof sort !== 'object' || Array.isArray(sort)) {
    return null
  }
  const normalizedSort = {
    by: sort.by ?? 'lastUpdated',
    order: sort.order ?? 'desc',
  }
  if (
    !['lastUpdated', 'title', 'owner'].includes(normalizedSort.by) ||
    !['asc', 'desc'].includes(normalizedSort.order)
  ) {
    return null
  }
  return normalizedSort
}

/**
 * @param {any} filters
 * @returns {Filters | null}
 * @private
 */
function _normalizeFilters(filters) {
  if (filters === undefined) {
    return {}
  }
  if (filters == null || typeof filters !== 'object' || Array.isArray(filters)) {
    return null
  }

  /** @type {Filters} */
  const normalizedFilters = {}

  for (const key of [
    'ownedByUser',
    'sharedWithUser',
    'archived',
    'trashed',
  ]) {
    if (filters[key] !== undefined) {
      if (typeof filters[key] !== 'boolean') {
        return null
      }
      normalizedFilters[key] = filters[key]
    }
  }

  if (filters.tag !== undefined) {
    if (filters.tag !== null && typeof filters.tag !== 'string') {
      return null
    }
    normalizedFilters.tag = filters.tag
  }

  if (filters.search !== undefined) {
    if (
      typeof filters.search !== 'string' ||
      filters.search.length > MAX_PROJECT_LIST_SEARCH_LENGTH
    ) {
      return null
    }
    normalizedFilters.search = filters.search
  }

  return normalizedFilters
}

/**
 * @param {any} page
 * @returns {Page | undefined | null}
 * @private
 */
function _normalizePageRequest(page) {
  if (page === undefined) {
    return undefined
  }
  if (page == null || typeof page !== 'object' || Array.isArray(page)) {
    return null
  }
  if (
    typeof page.size !== 'number' ||
    (page.offset !== undefined && typeof page.offset !== 'number')
  ) {
    return null
  }
  const { size } = page
  const offset = page.offset ?? 0
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    return null
  }
  return {
    size,
    offset,
  }
}

/**
 * @param {AllUsersProjects} projects
 * @param {string} userId
 * @returns {FormattedProject[]}
 * @private
 */
function _formatProjects(projects, userId) {
  const {
    owned,
    review,
    readAndWrite,
    readOnly,
    tokenReadAndWrite,
    tokenReadOnly,
  } = projects

  const formattedProjects = /** @type {FormattedProject[]} **/ []
  for (const project of owned) {
    formattedProjects.push(
      _formatProjectInfo(project, 'owner', Sources.OWNER, userId)
    )
  }
  // Invite-access
  for (const project of readAndWrite) {
    formattedProjects.push(
      _formatProjectInfo(project, 'readWrite', Sources.INVITE, userId)
    )
  }
  for (const project of review) {
    formattedProjects.push(
      _formatProjectInfo(project, 'review', Sources.INVITE, userId)
    )
  }
  for (const project of readOnly) {
    formattedProjects.push(
      _formatProjectInfo(project, 'readOnly', Sources.INVITE, userId)
    )
  }
  // Token-access
  // Only add these formattedProjects if they're not already present, this gives us cascading access
  // from 'owner' => 'token-read-only'
  for (const project of tokenReadAndWrite) {
    if (!formattedProjects.some(p => p.id === project._id.toString())) {
      formattedProjects.push(
        _formatProjectInfo(project, 'readAndWrite', Sources.TOKEN, userId)
      )
    }
  }
  for (const project of tokenReadOnly) {
    if (!formattedProjects.some(p => p.id === project._id.toString())) {
      formattedProjects.push(
        _formatProjectInfo(project, 'readOnly', Sources.TOKEN, userId)
      )
    }
  }

  return formattedProjects
}

/**
 * @param {FormattedProject[]} projects
 * @param {MongoTag[]} tags
 * @param {Filters} filters
 * @param {string} userId
 * @returns {FormattedProject[]}
 * @private
 */
function _applyFilters(projects, tags, filters, userId) {
  if (!_hasActiveFilter(filters)) {
    return projects
  }
  return projects.filter(project => _matchesFilters(project, tags, filters))
}

/**
 * @param {FormattedProject[]} projects
 * @param {Sort} sort
 * @param {Page} page
 * @returns {FormattedProject[]}
 * @private
 */
function _sortAndPaginate(projects, sort, page) {
  const sortedProjects = _.orderBy(
    projects,
    [_getProjectSortValue(sort.by || 'lastUpdated')],
    [sort.order || 'desc']
  )
  if (page == null) {
    return sortedProjects
  }
  const { offset, size } = _normalizePage(page)
  return sortedProjects.slice(offset, offset + size)
}

/**
 * @param {Sort['by']} sortBy
 * @returns {(project: FormattedProject | Project) => string | number}
 * @private
 */
function _getProjectSortValue(sortBy) {
  if (sortBy === 'title') {
    return project => project.name.toLowerCase()
  }
  if (sortBy === 'owner') {
    return project => _getProjectOwnerSortValue(project)
  }
  return project => new Date(project.lastUpdated).getTime()
}

/**
 * @param {FormattedProject | Project} project
 * @returns {string}
 * @private
 */
function _getProjectOwnerSortValue(project) {
  if (project.accessLevel === 'owner') {
    return 'You'
  }
  if (project.owner == null) {
    return ''
  }
  const owner = project.owner
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ')
  return ownerName || owner.email || ''
}

/**
 * @param {Page} page
 * @returns {{ offset: number, size: number }}
 * @private
 */
function _normalizePage(page) {
  const size = Number(page.size)
  const offset = Number(page.offset ?? 0)

  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new OError('Invalid pagination criteria', { page })
  }

  return {
    offset,
    size: Math.min(size, MAX_PROJECT_LIST_PAGE_SIZE),
  }
}

/**
 * @param {Page | undefined} page
 * @param {number} totalSize
 * @returns {{ size: number, offset: number, nextOffset: number | null } | undefined}
 * @private
 */
function _buildPageResponse(page, totalSize) {
  if (page == null) {
    return undefined
  }
  const normalizedPage = _normalizePage(page)
  const nextOffset = normalizedPage.offset + normalizedPage.size
  return {
    size: normalizedPage.size,
    offset: normalizedPage.offset,
    nextOffset: nextOffset < totalSize ? nextOffset : null,
  }
}

/**
 * Tag counts describe the active dashboard scope, not the currently selected
 * tag. This keeps the sidebar stable while a tag filter is active.
 *
 * @param {Filters} filters
 * @returns {Filters}
 * @private
 */
function _getTagCountFilters(filters) {
  return {
    ...filters,
    archived: false,
    trashed: false,
    tag: undefined,
  }
}

/**
 * @param {FormattedProject[]} projects
 * @param {MongoTag[]} tags
 * @returns {{ untagged: number, byTagId: Record<string, number> }}
 * @private
 */
function _buildTagCounts(projects, tags) {
  const activeProjectIds = new Set(
    projects
      .filter(project => !project.archived && !project.trashed)
      .map(project => project.id)
  )
  const taggedActiveProjectIds = new Set()
  /** @type {Record<string, number>} */
  const byTagId = {}

  for (const tag of tags) {
    const tagId = tag._id?.toString()
    if (!tagId) {
      continue
    }

    let count = 0
    for (const projectId of tag.project_ids || []) {
      if (!activeProjectIds.has(projectId)) {
        continue
      }
      count += 1
      taggedActiveProjectIds.add(projectId)
    }
    byTagId[tagId] = count
  }

  return {
    untagged: activeProjectIds.size - taggedActiveProjectIds.size,
    byTagId,
  }
}

/**
 * @param {MongoProject} project
 * @param {ProjectAccessLevel} accessLevel
 * @param {Source} source
 * @param {string} userId
 * @returns {FormattedProject}
 * @private
 */
function _formatProjectInfo(project, accessLevel, source, userId) {
  const archived = ProjectHelper.isArchived(project, userId)
  // If a project is simultaneously trashed and archived, we will consider it archived but not trashed.
  const trashed = ProjectHelper.isTrashed(project, userId) && !archived
  const readOnlyTokenAccess =
    accessLevel === PrivilegeLevels.READ_ONLY && source === Sources.TOKEN

  return {
    id: project._id.toString(),
    name: project.name,
    owner_ref: readOnlyTokenAccess ? null : project.owner_ref,
    lastUpdated: project.lastUpdated,
    lastUpdatedBy: readOnlyTokenAccess ? null : project.lastUpdatedBy,
    accessLevel,
    source,
    archived,
    trashed,
  }
}

/**
 * @param {FormattedProject[]} projects
 * @returns {Promise<Project[]>}
 * @private
 */
async function _injectProjectUsers(projects) {
  const userIds = new Set()
  for (const project of projects) {
    if (project.owner_ref != null) {
      userIds.add(project.owner_ref.toString())
    }
    if (project.lastUpdatedBy != null) {
      userIds.add(project.lastUpdatedBy.toString())
    }
  }

  const projection = {
    first_name: 1,
    last_name: 1,
    email: 1,
  }
  /** @type {Record<string, UserRef>} */
  const users = {}
  for (const user of await UserGetter.promises.getUsers(userIds, projection)) {
    const userId = user._id.toString()
    users[userId] = {
      id: userId,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    }
  }

  return projects.map(project => ({
    id: project.id,
    name: project.name,
    archived: project.archived,
    trashed: project.trashed,
    accessLevel: project.accessLevel,
    source: project.source,
    lastUpdated: project.lastUpdated.toISOString(),
    lastUpdatedBy:
      project.lastUpdatedBy == null
        ? null
        : users[project.lastUpdatedBy.toString()] || null,
    owner:
      project.owner_ref == null
        ? undefined
        : users[project.owner_ref.toString()],
    owner_ref: undefined,
  }))
}

/**
 * @param {any} project
 * @param {MongoTag[]} tags
 * @param {Filters} filters
 * @private
 */
function _matchesFilters(project, tags, filters) {
  if (filters.ownedByUser && project.accessLevel !== 'owner') {
    return false
  }
  if (filters.sharedWithUser && project.accessLevel === 'owner') {
    return false
  }
  if (
    typeof filters.archived === 'boolean' &&
    project.archived !== filters.archived
  ) {
    return false
  }
  if (
    typeof filters.trashed === 'boolean' &&
    project.trashed !== filters.trashed
  ) {
    return false
  }
  if (filters.tag === null) {
    const taggedProjectIds = new Set(
      tags.flatMap(tag => tag.project_ids || [])
    )
    if (taggedProjectIds.has(project.id)) {
      return false
    }
  } else if (filters.tag?.length) {
    const tag = _.find(
      tags,
      tag =>
        filters.tag === tag._id?.toString() || filters.tag === String(tag.name)
    )
    if (!tag || !(tag.project_ids || []).includes(project.id)) {
      return false
    }
  }
  if (
    filters.search?.length &&
    project.name.toLowerCase().indexOf(filters.search.toLowerCase()) === -1
  ) {
    return false
  }
  return true
}

/**
 * @param {Filters} filters
 * @returns {boolean}
 * @private
 */
function _hasActiveFilter(filters) {
  return Boolean(
    filters.ownedByUser ||
    filters.sharedWithUser ||
    typeof filters.archived === 'boolean' ||
    typeof filters.trashed === 'boolean' ||
    filters.tag === null ||
    filters.tag?.length ||
    filters.search?.length
  )
}

export default {
  projectListPage: expressify(projectListPage),
  getProjectsJson: expressify(getProjectsJson),
}
