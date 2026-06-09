import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongodb from 'mongodb-legacy'
import {
  cleanupTestDatabase,
  db,
  waitForDb,
} from '../../../../app/src/infrastructure/mongodb.mjs'
import ProjectGetter from '../../../../app/src/Features/Project/ProjectGetter.mjs'

const { ObjectId } = mongodb

function buildProject({
  _id = new ObjectId(),
  name,
  ownerRef,
  lastUpdated,
  lastUpdatedBy,
  publicAccesLevel = 'private',
  collaberatorRefs = [],
  reviewerRefs = [],
  readOnlyRefs = [],
  tokenReadAndWriteRefs = [],
  tokenReadOnlyRefs = [],
  archived = [],
  trashed = [],
}) {
  return {
    _id,
    name,
    owner_ref: ownerRef,
    lastUpdated,
    lastUpdatedBy,
    publicAccesLevel,
    collaberator_refs: collaberatorRefs,
    reviewer_refs: reviewerRefs,
    readOnly_refs: readOnlyRefs,
    tokenAccessReadAndWrite_refs: tokenReadAndWriteRefs,
    tokenAccessReadOnly_refs: tokenReadOnlyRefs,
    archived,
    trashed,
    tokens: {},
    rootFolder: [],
    active: true,
    readOnly: false,
  }
}

function names(projects) {
  return projects.map(project => project.name)
}

describe('ProjectGetter.findUsersProjectListPage', function () {
  beforeAll(async function () {
    await waitForDb()
  })

  beforeEach(cleanupTestDatabase)

  beforeEach(async function (ctx) {
    ctx.userId = new ObjectId()
    ctx.otherUserId = new ObjectId()
    ctx.ownerId = new ObjectId()
    ctx.lastUpdatedBy = new ObjectId()

    await db.users.insertMany([
      {
        _id: ctx.userId,
        email: 'dashboard-user@example.com',
        first_name: 'Dashboard',
        last_name: 'User',
      },
      {
        _id: ctx.ownerId,
        email: 'owner@example.com',
        first_name: 'Project',
        last_name: 'Owner',
      },
      {
        _id: ctx.lastUpdatedBy,
        email: 'editor@example.com',
        first_name: 'Recent',
        last_name: 'Editor',
      },
    ])
  })

  it('returns every dashboard access bucket with the current access/source contract', async function (ctx) {
    await db.projects.insertMany([
      buildProject({
        name: 'Owned',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
        lastUpdatedBy: ctx.userId,
      }),
      buildProject({
        name: 'Invite Editor',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        collaberatorRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Reviewer',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        reviewerRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Invite Viewer',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-04T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        readOnlyRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Token Editor',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-05T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        publicAccesLevel: 'tokenBased',
        tokenReadAndWriteRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Token Viewer',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-06T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        publicAccesLevel: 'tokenBased',
        tokenReadOnlyRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Disabled Token',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-07T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        publicAccesLevel: 'private',
        tokenReadAndWriteRefs: [ctx.userId],
      }),
    ])

    const result = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: {},
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )

    expect(names(result.projects)).to.deep.equal([
      'Owned',
      'Invite Editor',
      'Reviewer',
      'Invite Viewer',
      'Token Editor',
      'Token Viewer',
    ])
    expect(
      result.projects.map(project => ({
        name: project.name,
        accessLevel: project.accessLevel,
        source: project.source,
      }))
    ).to.deep.equal([
      { name: 'Owned', accessLevel: 'owner', source: 'owner' },
      { name: 'Invite Editor', accessLevel: 'readWrite', source: 'invite' },
      { name: 'Reviewer', accessLevel: 'review', source: 'invite' },
      { name: 'Invite Viewer', accessLevel: 'readOnly', source: 'invite' },
      { name: 'Token Editor', accessLevel: 'readAndWrite', source: 'token' },
      { name: 'Token Viewer', accessLevel: 'readOnly', source: 'token' },
    ])
    expect(result.totalSize).to.equal(6)
    expect(result.page).to.deep.equal({
      size: 20,
      offset: 0,
      nextOffset: null,
    })
  })

  it('redacts owner and lastUpdatedBy for token read-only projects', async function (ctx) {
    await db.projects.insertOne(
      buildProject({
        name: 'Token Viewer',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-06T00:00:00Z'),
        lastUpdatedBy: ctx.lastUpdatedBy,
        publicAccesLevel: 'tokenBased',
        tokenReadOnlyRefs: [ctx.userId],
      })
    )

    const result = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: {},
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )

    expect(result.projects).to.have.length(1)
    expect(result.projects[0]).not.to.have.property('owner')
    expect(result.projects[0].lastUpdatedBy).to.equal(null)
  })

  it('uses the strongest dashboard access when a project matches multiple paths', async function (ctx) {
    await db.projects.insertMany([
      buildProject({
        name: 'Owner Beats Token',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
        publicAccesLevel: 'tokenBased',
        tokenReadOnlyRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Reviewer Beats Viewer',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
        reviewerRefs: [ctx.userId],
        readOnlyRefs: [ctx.userId],
      }),
      buildProject({
        name: 'Token Editor Beats Token Viewer',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
        publicAccesLevel: 'tokenBased',
        tokenReadAndWriteRefs: [ctx.userId],
        tokenReadOnlyRefs: [ctx.userId],
      }),
    ])

    const result = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: {},
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )

    expect(
      result.projects.map(project => ({
        name: project.name,
        accessLevel: project.accessLevel,
        source: project.source,
      }))
    ).to.deep.equal([
      { name: 'Owner Beats Token', accessLevel: 'owner', source: 'owner' },
      { name: 'Reviewer Beats Viewer', accessLevel: 'review', source: 'invite' },
      {
        name: 'Token Editor Beats Token Viewer',
        accessLevel: 'readAndWrite',
        source: 'token',
      },
    ])
  })

  it('treats projects archived and trashed by the user as archived only', async function (ctx) {
    await db.projects.insertMany([
      buildProject({
        name: 'Archived And Trashed',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
        archived: [ctx.userId],
        trashed: [ctx.userId],
      }),
      buildProject({
        name: 'Only Trashed',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
        trashed: [ctx.userId],
      }),
      buildProject({
        name: 'Other User Archived',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
        archived: [ctx.otherUserId],
        trashed: [ctx.otherUserId],
      }),
    ])

    const archivedResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { archived: true, trashed: false },
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )
    const trashedResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { trashed: true },
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )
    const activeResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { archived: false, trashed: false },
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )

    expect(names(archivedResult.projects)).to.deep.equal([
      'Archived And Trashed',
    ])
    expect(archivedResult.projects[0]).to.include({
      archived: true,
      trashed: false,
    })
    expect(names(trashedResult.projects)).to.deep.equal(['Only Trashed'])
    expect(names(activeResult.projects)).to.deep.equal(['Other User Archived'])
  })

  it('applies owned and shared filters with the current boolean semantics', async function (ctx) {
    await db.projects.insertMany([
      buildProject({
        name: 'Owned',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
      }),
      buildProject({
        name: 'Shared',
        ownerRef: ctx.ownerId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
        collaberatorRefs: [ctx.userId],
      }),
    ])

    const ownedResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { ownedByUser: true },
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )
    const sharedResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { sharedWithUser: true },
        sort: { by: 'lastUpdated', order: 'asc' },
        page: { size: 20, offset: 0 },
        tags: [],
      }
    )
    const conflictingResult =
      await ProjectGetter.promises.findUsersProjectListPage(
        ctx.userId.toString(),
        {
          filters: { ownedByUser: true, sharedWithUser: true },
          sort: { by: 'lastUpdated', order: 'asc' },
          page: { size: 20, offset: 0 },
          tags: [],
        }
      )

    expect(names(ownedResult.projects)).to.deep.equal(['Owned'])
    expect(names(sharedResult.projects)).to.deep.equal(['Shared'])
    expect(conflictingResult.projects).to.deep.equal([])
    expect(conflictingResult.totalSize).to.equal(0)
  })

  it('reports tag counts from all active matching projects, not only the current page', async function (ctx) {
    const taggedProjectId1 = new ObjectId()
    const taggedProjectId2 = new ObjectId()
    const untaggedProjectId = new ObjectId()
    const archivedProjectId = new ObjectId()

    await db.projects.insertMany([
      buildProject({
        _id: taggedProjectId1,
        name: 'Report One',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
      }),
      buildProject({
        _id: taggedProjectId2,
        name: 'Report Two',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
      }),
      buildProject({
        _id: untaggedProjectId,
        name: 'Report Three',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
      }),
      buildProject({
        _id: archivedProjectId,
        name: 'Archived Report',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-04T00:00:00Z'),
        archived: [ctx.userId],
      }),
    ])

    const result = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { archived: false, trashed: false, search: 'Report' },
        sort: { by: 'lastUpdated', order: 'desc' },
        page: { size: 1, offset: 0 },
        tags: [
          {
            _id: 'tag-a',
            project_ids: [
              taggedProjectId1.toString(),
              taggedProjectId2.toString(),
            ],
          },
          {
            _id: 'tag-b',
            project_ids: [archivedProjectId.toString()],
          },
        ],
      }
    )

    expect(result.totalSize).to.equal(3)
    expect(names(result.projects)).to.deep.equal(['Report Three'])
    expect(result.tagCounts).to.deep.equal({
      untagged: 1,
      byTagId: {
        'tag-a': 2,
        'tag-b': 0,
      },
    })
  })

  it('filters by tag id, tag name, and uncategorized project ids', async function (ctx) {
    const tagProjectId1 = new ObjectId()
    const tagProjectId2 = new ObjectId()
    const untaggedProjectId = new ObjectId()
    const staleProjectId = new ObjectId()

    await db.projects.insertMany([
      buildProject({
        _id: tagProjectId1,
        name: 'Tagged One',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
      }),
      buildProject({
        _id: tagProjectId2,
        name: 'Tagged Two',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
      }),
      buildProject({
        _id: untaggedProjectId,
        name: 'Untagged',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
      }),
    ])

    const tags = [
      {
        _id: 'tag-a',
        name: 'Alpha tag',
        project_ids: [
          tagProjectId1.toString(),
          tagProjectId2.toString(),
          staleProjectId.toString(),
          'not-a-valid-object-id',
        ],
      },
    ]
    const byIdResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { tag: 'tag-a', archived: false, trashed: false },
        sort: { by: 'lastUpdated', order: 'desc' },
        page: { size: 20, offset: 0 },
        tags,
      }
    )
    const byNameResult = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { tag: 'Alpha tag', archived: false, trashed: false },
        sort: { by: 'lastUpdated', order: 'desc' },
        page: { size: 20, offset: 0 },
        tags,
      }
    )
    const uncategorizedResult =
      await ProjectGetter.promises.findUsersProjectListPage(
        ctx.userId.toString(),
        {
          filters: { tag: null, archived: false, trashed: false },
          sort: { by: 'lastUpdated', order: 'desc' },
          page: { size: 20, offset: 0 },
          tags,
        }
      )

    expect(names(byIdResult.projects)).to.deep.equal([
      'Tagged Two',
      'Tagged One',
    ])
    expect(names(byNameResult.projects)).to.deep.equal([
      'Tagged Two',
      'Tagged One',
    ])
    expect(names(uncategorizedResult.projects)).to.deep.equal(['Untagged'])
  })

  it('treats search text as a case-insensitive literal substring before pagination', async function (ctx) {
    await db.projects.insertMany([
      buildProject({
        name: 'Alpha [v1] Notes',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
      }),
      buildProject({
        name: 'ALPHA [v1] Draft',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
      }),
      buildProject({
        name: 'Alpha v1 False Positive',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
      }),
    ])

    const result = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: { search: '[v1]' },
        sort: { by: 'lastUpdated', order: 'desc' },
        page: { size: 1, offset: 1 },
        tags: [],
      }
    )

    expect(result.totalSize).to.equal(2)
    expect(names(result.projects)).to.deep.equal(['Alpha [v1] Notes'])
    expect(result.page).to.deep.equal({
      size: 1,
      offset: 1,
      nextOffset: null,
    })
  })

  it('sorts titles case-insensitively before pagination', async function (ctx) {
    await db.projects.insertMany([
      buildProject({
        name: 'bravo',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-01T00:00:00Z'),
      }),
      buildProject({
        name: 'Alpha',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-02T00:00:00Z'),
      }),
      buildProject({
        name: 'charlie',
        ownerRef: ctx.userId,
        lastUpdated: new Date('2026-01-03T00:00:00Z'),
      }),
    ])

    const result = await ProjectGetter.promises.findUsersProjectListPage(
      ctx.userId.toString(),
      {
        filters: {},
        sort: { by: 'title', order: 'asc' },
        page: { size: 1, offset: 1 },
        tags: [],
      }
    )

    expect(result.totalSize).to.equal(3)
    expect(names(result.projects)).to.deep.equal(['bravo'])
    expect(result.page).to.deep.equal({
      size: 1,
      offset: 1,
      nextOffset: 2,
    })
  })
})
