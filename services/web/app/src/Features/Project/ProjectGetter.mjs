import { db, ObjectId } from '../../infrastructure/mongodb.mjs'
import Mongo from '../Helpers/Mongo.mjs'
import OError from '@superpaper/o-error'
import { Project } from '../../models/Project.mjs'
import LockManager from '../../infrastructure/LockManager.mjs'
import { DeletedProject } from '../../models/DeletedProject.mjs'
import { callbackifyAll } from '@superpaper/promise-utils'
import ProjectEntityMongoUpdateHandler from './ProjectEntityMongoUpdateHandler.mjs'
import CollaboratorsGetter from '../Collaborators/CollaboratorsGetter.mjs'
import PublicAccessLevels from '../Authorization/PublicAccessLevels.mjs'
import Sources from '../Authorization/Sources.mjs'

const { normalizeQuery } = Mongo
const MAX_PROJECT_LIST_PAGE_SIZE = 100

const ProjectGetter = {
  async getProject(projectId, projection = {}) {
    if (projectId == null) {
      throw new Error('no project id provided')
    }
    if (typeof projection !== 'object') {
      throw new Error('projection is not an object')
    }

    if (projection.rootFolder || Object.keys(projection).length === 0) {
      return await LockManager.promises.runWithLock(
        ProjectEntityMongoUpdateHandler.LOCK_NAMESPACE,
        projectId,
        () => ProjectGetter.getProjectWithoutLock(projectId, projection)
      )
    } else {
      return await ProjectGetter.getProjectWithoutLock(projectId, projection)
    }
  },

  async getProjectWithoutLock(projectId, projection = {}) {
    if (projectId == null) {
      throw new Error('no project id provided')
    }
    if (typeof projection !== 'object') {
      throw new Error('projection is not an object')
    }

    const query = normalizeQuery(projectId)

    let project
    try {
      project = await db.projects.findOne(query, { projection })
    } catch (error) {
      OError.tag(error, 'error getting project', {
        query,
        projection,
      })
      throw error
    }

    return project
  },

  async getProjectIdByReadAndWriteToken(token) {
    const project = await Project.findOne(
      { 'tokens.readAndWrite': token },
      { _id: 1 }
    ).exec()

    if (project == null) {
      return
    }

    return project._id
  },

  /**
   * @return {Promise<any>}
   */
  async findAllUsersProjects(userId, fields) {
    const ownedProjects = await Project.find(
      { owner_ref: userId },
      fields
    ).exec()

    const projects =
      await CollaboratorsGetter.promises.getProjectsUserIsMemberOf(
        userId,
        fields
      )

    const result = {
      owned: ownedProjects || [],
      readAndWrite: projects.readAndWrite || [],
      readOnly: projects.readOnly || [],
      tokenReadAndWrite: projects.tokenReadAndWrite || [],
      tokenReadOnly: projects.tokenReadOnly || [],
      review: projects.review || [],
    }

    // Remove duplicate projects. The order of result values is determined by the order they occur.
    const tempAddedProjectsIds = new Set()
    const filteredProjects = Object.entries(result).reduce((prev, current) => {
      const [key, projects] = current

      prev[key] = []

      projects.forEach(project => {
        const projectId = project._id.toString()

        if (!tempAddedProjectsIds.has(projectId)) {
          prev[key].push(project)
          tempAddedProjectsIds.add(projectId)
        }
      })

      return prev
    }, {})

    return filteredProjects
  },

  async findUsersProjectListPage(
    userId,
    {
      filters = {},
      sort = { by: 'lastUpdated', order: 'desc' },
      page = { size: 20, offset: 0 },
      tags = [],
    } = {}
  ) {
    const userObjectId = new ObjectId(userId)
    const normalizedPage = normalizeProjectListPage(page)
    const filterContext = buildProjectListFilterContext({ filters, tags })
    const pipeline = buildProjectListPagePipeline({
      userObjectId,
      filters,
      filterContext,
      sort,
      page: normalizedPage,
    })
    const [result = {}] = await db.projects.aggregate(pipeline).toArray()
    const totalSize = result.total?.[0]?.count || 0
    const projects = await injectProjectListUsers(result.projects || [])
    const activeProjectIds = (result.activeProjectIds || []).map(
      project => project.id
    )

    return {
      totalSize,
      projects,
      page: buildProjectListPageResponse(normalizedPage, totalSize),
      tagCounts: buildProjectListTagCounts(activeProjectIds, tags),
    }
  },

  async existUsersDebugProjectsOlderThan(userId, days) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const exists = await Project.exists({
      owner_ref: userId,
      'superpaper.isDebugCopyOf': { $type: 'objectId' },
      lastUpdated: { $lt: cutoffDate },
    })

    return Boolean(exists)
  },

  async findAllDebugProjects(fields) {
    return Project.find(
      {
        'superpaper.isDebugCopyOf': { $type: 'objectId' },
      },
      fields
    )
      .limit(500)
      .populate('owner_ref', ['email', 'name'])
      .exec()
  },

  /**
   * Return all projects with the given name that belong to the given user.
   *
   * Projects include the user's own projects as well as collaborations with
   * read/write access.
   */
  async findUsersProjectsByName(userId, projectName) {
    const allProjects = await ProjectGetter.findAllUsersProjects(
      userId,
      'name archived trashed'
    )

    const { owned, readAndWrite } = allProjects
    const projects = owned.concat(readAndWrite)
    const lowerCasedProjectName = projectName.toLowerCase()
    return projects.filter(
      project => project.name.toLowerCase() === lowerCasedProjectName
    )
  },

  async getUsersDeletedProjects(userId) {
    return await DeletedProject.find({
      'deleterData.deletedProjectOwnerId': userId,
    }).exec()
  },
}

function normalizeProjectListPage(page) {
  const size = Math.min(page.size, MAX_PROJECT_LIST_PAGE_SIZE)
  return {
    size,
    offset: page.offset || 0,
  }
}

function buildProjectListPagePipeline({
  userObjectId,
  filters,
  filterContext,
  sort,
  page,
}) {
  const accessMatch = {
    $or: [
      { owner_ref: userObjectId },
      { collaberator_refs: userObjectId },
      { reviewer_refs: userObjectId },
      { readOnly_refs: userObjectId },
      {
        tokenAccessReadAndWrite_refs: userObjectId,
        publicAccesLevel: PublicAccessLevels.TOKEN_BASED,
      },
      {
        tokenAccessReadOnly_refs: userObjectId,
        publicAccesLevel: PublicAccessLevels.TOKEN_BASED,
      },
    ],
  }
  const pipeline = [
    { $match: accessMatch },
    ...buildProjectListDerivedFieldStages(userObjectId),
  ]
  const filterStages = buildProjectListFilterStages(filters, filterContext)
  const tagCountFilterStages = buildProjectListFilterStages(
    buildProjectListTagCountFilters(filters),
    filterContext
  )

  if (sort.by === 'title') {
    pipeline.push({
      $addFields: {
        dashboardTitleSortKey: { $toLower: { $ifNull: ['$name', ''] } },
      },
    })
  }

  pipeline.push({
    $facet: {
      projects: [
        ...filterStages,
        { $sort: buildProjectListSort(sort) },
        { $skip: page.offset },
        { $limit: page.size },
        { $project: buildProjectListProjection() },
      ],
      total: [...filterStages, { $count: 'count' }],
      activeProjectIds: [
        ...tagCountFilterStages,
        { $match: { dashboardArchived: false, dashboardTrashed: false } },
        { $project: { _id: 0, id: { $toString: '$_id' } } },
      ],
    },
  })

  return pipeline
}

function buildProjectListDerivedFieldStages(userObjectId) {
  return [
    {
      $addFields: {
        dashboardCollaberatorRefs: {
          $cond: [
            { $isArray: '$collaberator_refs' },
            '$collaberator_refs',
            [],
          ],
        },
        dashboardReviewerRefs: {
          $cond: [{ $isArray: '$reviewer_refs' }, '$reviewer_refs', []],
        },
        dashboardReadOnlyRefs: {
          $cond: [{ $isArray: '$readOnly_refs' }, '$readOnly_refs', []],
        },
        dashboardTokenReadAndWriteRefs: {
          $cond: [
            { $isArray: '$tokenAccessReadAndWrite_refs' },
            '$tokenAccessReadAndWrite_refs',
            [],
          ],
        },
        dashboardTokenReadOnlyRefs: {
          $cond: [
            { $isArray: '$tokenAccessReadOnly_refs' },
            '$tokenAccessReadOnly_refs',
            [],
          ],
        },
        dashboardArchivedRefs: {
          $cond: [{ $isArray: '$archived' }, '$archived', []],
        },
        dashboardTrashedRefs: {
          $cond: [{ $isArray: '$trashed' }, '$trashed', []],
        },
      },
    },
    {
      $addFields: {
        dashboardAccessRank: {
          $switch: {
            branches: [
              { case: { $eq: ['$owner_ref', userObjectId] }, then: 0 },
              {
                case: { $in: [userObjectId, '$dashboardCollaberatorRefs'] },
                then: 1,
              },
              {
                case: { $in: [userObjectId, '$dashboardReviewerRefs'] },
                then: 2,
              },
              {
                case: { $in: [userObjectId, '$dashboardReadOnlyRefs'] },
                then: 3,
              },
              {
                case: {
                  $and: [
                    {
                      $eq: [
                        '$publicAccesLevel',
                        PublicAccessLevels.TOKEN_BASED,
                      ],
                    },
                    {
                      $in: [
                        userObjectId,
                        '$dashboardTokenReadAndWriteRefs',
                      ],
                    },
                  ],
                },
                then: 4,
              },
              {
                case: {
                  $and: [
                    {
                      $eq: [
                        '$publicAccesLevel',
                        PublicAccessLevels.TOKEN_BASED,
                      ],
                    },
                    {
                      $in: [userObjectId, '$dashboardTokenReadOnlyRefs'],
                    },
                  ],
                },
                then: 5,
              },
            ],
            default: 99,
          },
        },
        dashboardArchived: {
          $in: [userObjectId, '$dashboardArchivedRefs'],
        },
        dashboardTrashedRaw: {
          $in: [userObjectId, '$dashboardTrashedRefs'],
        },
      },
    },
    {
      $addFields: {
        dashboardTrashed: {
          $and: [
            '$dashboardTrashedRaw',
            { $not: ['$dashboardArchived'] },
          ],
        },
        accessLevel: {
          $switch: {
            branches: [
              { case: { $eq: ['$dashboardAccessRank', 0] }, then: 'owner' },
              {
                case: { $eq: ['$dashboardAccessRank', 1] },
                then: 'readWrite',
              },
              { case: { $eq: ['$dashboardAccessRank', 2] }, then: 'review' },
              {
                case: { $eq: ['$dashboardAccessRank', 3] },
                then: 'readOnly',
              },
              {
                case: { $eq: ['$dashboardAccessRank', 4] },
                then: 'readAndWrite',
              },
              {
                case: { $eq: ['$dashboardAccessRank', 5] },
                then: 'readOnly',
              },
            ],
          },
        },
        source: {
          $switch: {
            branches: [
              {
                case: { $eq: ['$dashboardAccessRank', 0] },
                then: Sources.OWNER,
              },
              {
                case: { $lt: ['$dashboardAccessRank', 4] },
                then: Sources.INVITE,
              },
              {
                case: { $lt: ['$dashboardAccessRank', 6] },
                then: Sources.TOKEN,
              },
            ],
          },
        },
      },
    },
  ]
}

function buildProjectListFilterContext({ filters, tags }) {
  const taggedProjectIds = new Set()
  for (const tag of tags) {
    for (const projectId of tag.project_ids || []) {
      if (ObjectId.isValid(projectId)) {
        taggedProjectIds.add(projectId)
      }
    }
  }

  let selectedTagProjectIds
  if (typeof filters.tag === 'string' && filters.tag.length > 0) {
    const selectedTag = tags.find(
      tag =>
        filters.tag === tag._id?.toString() || filters.tag === String(tag.name)
    )
    selectedTagProjectIds = selectedTag
      ? (selectedTag.project_ids || []).filter(projectId =>
          ObjectId.isValid(projectId)
        )
      : []
  }

  return {
    taggedProjectIds: [...taggedProjectIds].map(
      projectId => new ObjectId(projectId)
    ),
    selectedTagProjectIds:
      selectedTagProjectIds?.map(projectId => new ObjectId(projectId)),
  }
}

function buildProjectListFilterStages(filters, filterContext) {
  if (filters.ownedByUser && filters.sharedWithUser) {
    return [{ $match: { $expr: { $eq: [1, 0] } } }]
  }

  const match = {}
  if (filters.ownedByUser) {
    match.dashboardAccessRank = 0
  }
  if (filters.sharedWithUser) {
    match.dashboardAccessRank = {
      ...(match.dashboardAccessRank || {}),
      $gt: 0,
    }
  }
  if (typeof filters.archived === 'boolean') {
    match.dashboardArchived = filters.archived
  }
  if (typeof filters.trashed === 'boolean') {
    match.dashboardTrashed = filters.trashed
  }
  if (filters.search?.length) {
    match.name = {
      $regex: escapeRegExp(filters.search),
      $options: 'i',
    }
  }
  if (filters.tag === null) {
    match._id = { $nin: filterContext.taggedProjectIds }
  } else if (filters.tag?.length) {
    match._id = { $in: filterContext.selectedTagProjectIds || [] }
  }
  return Object.keys(match).length ? [{ $match: match }] : []
}

function buildProjectListTagCountFilters(filters) {
  return {
    ...filters,
    archived: false,
    trashed: false,
    tag: undefined,
  }
}

function buildProjectListSort(sort) {
  const order = sort.order === 'asc' ? 1 : -1
  if (sort.by === 'title') {
    return { dashboardTitleSortKey: order, _id: 1 }
  }
  return { lastUpdated: order, _id: 1 }
}

function buildProjectListProjection() {
  return {
    _id: 1,
    id: { $toString: '$_id' },
    name: 1,
    lastUpdated: 1,
    archived: '$dashboardArchived',
    trashed: '$dashboardTrashed',
    accessLevel: 1,
    source: 1,
    owner_ref: {
      $cond: [
        {
          $and: [
            { $eq: ['$source', Sources.TOKEN] },
            { $eq: ['$accessLevel', 'readOnly'] },
          ],
        },
        null,
        '$owner_ref',
      ],
    },
    lastUpdatedBy: {
      $cond: [
        {
          $and: [
            { $eq: ['$source', Sources.TOKEN] },
            { $eq: ['$accessLevel', 'readOnly'] },
          ],
        },
        null,
        '$lastUpdatedBy',
      ],
    },
  }
}

async function injectProjectListUsers(projects) {
  const userIds = new Set()
  for (const project of projects) {
    if (project.owner_ref != null) {
      userIds.add(project.owner_ref)
    }
    if (project.lastUpdatedBy != null) {
      userIds.add(project.lastUpdatedBy)
    }
  }

  const users = {}
  if (userIds.size > 0) {
    for (const user of await db.users
      .find(
        { _id: { $in: [...userIds] } },
        { projection: { email: 1, first_name: 1, last_name: 1 } }
      )
      .toArray()) {
      const userId = user._id.toString()
      users[userId] = {
        id: userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      }
    }
  }

  return projects.map(project => {
    const owner =
      project.owner_ref == null
        ? undefined
        : users[project.owner_ref.toString()]

    return {
      id: project._id.toString(),
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
      ...(owner == null ? {} : { owner }),
    }
  })
}

function buildProjectListPageResponse(page, totalSize) {
  const nextOffset = page.offset + page.size
  return {
    size: page.size,
    offset: page.offset,
    nextOffset: nextOffset < totalSize ? nextOffset : null,
  }
}

function buildProjectListTagCounts(projectIds, tags) {
  const activeProjectIds = new Set(projectIds)
  const taggedActiveProjectIds = new Set()
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default {
  ...callbackifyAll(ProjectGetter),
  promises: ProjectGetter,
}
