import { beforeEach, describe, it, expect, vi } from 'vitest'
import sinon from 'sinon'
import mongodb from 'mongodb-legacy'
import Settings from '@superpaper/settings'

const ObjectId = mongodb.ObjectId

const MODULE_PATH = `${import.meta.dirname}/../../../../app/src/Features/Project/ProjectListController`

// Mock AnalyticsManager as it isn't used in these tests but causes the User model to be imported and redeclares queues
vi.mock('../Telemetry/TelemetryManager.mjs', () => {
  return {
    default: {
      setUserPropertyForUserInBackground: () => {},
    },
  }
})

function buildProject(id, attrs = {}) {
  return {
    _id: id,
    name: `Project ${id}`,
    lastUpdated: new Date(id),
    owner_ref: 'user-1',
    ...attrs,
  }
}

function setOwnedProjects(ctx, projects) {
  ctx.allProjects = {
    owned: projects,
    readAndWrite: [],
    readOnly: [],
    tokenReadAndWrite: [],
    tokenReadOnly: [],
    review: [],
  }

  ctx.ProjectGetter.promises.findAllUsersProjects.resolves(ctx.allProjects)
}

describe('ProjectListController', function () {
  beforeEach(async function (ctx) {
    ctx.project_id = new ObjectId('abcdefabcdefabcdefabcdef')

    ctx.user = {
      _id: new ObjectId('123456123456123456123456'),
      email: 'test@superpaper.com',
      first_name: 'bjkdsjfk',
      features: {},
      emails: [{ email: 'test@superpaper.com' }],
      lastActive: new Date(2),
      signUpDate: new Date(1),
      lastLoginIp: '111.111.111.112',
      ace: {
        syntaxValidation: true,
        pdfViewer: 'pdfjs',
        spellCheckLanguage: 'en',
        autoPairDelimiters: true,
        autoComplete: true,
        fontSize: 12,
        theme: 'textmate',
        mode: 'none',
      },
      aiFeatures: { enabled: false },
    }
    ctx.users = {
      'user-1': {
        first_name: 'James',
      },
      'user-2': {
        first_name: 'Henry',
      },
    }
    ctx.users[ctx.user._id] = ctx.user // Owner
    ctx.usersArr = Object.entries(ctx.users).map(([key, value]) => ({
      _id: key,
      ...value,
    }))
    ctx.tags = [
      { name: 1, project_ids: ['1', '2', '3'] },
      { name: 2, project_ids: ['a', '1'] },
      { name: 3, project_ids: ['a', 'b', 'c', 'd'] },
    ]
    ctx.notifications = [
      {
        _id: '1',
        user_id: '2',
        templateKey: '3',
        messageOpts: '4',
        key: '5',
      },
    ]
    ctx.settings = {
      ...Settings,
      siteUrl: 'https://superpaper.com',
    }
    ctx.TagsHandler = {
      promises: {
        getAllTags: sinon.stub().resolves(ctx.tags),
      },
    }
    ctx.NotificationsHandler = {
      promises: {
        getUserNotifications: sinon.stub().resolves(ctx.notifications),
      },
    }
    ctx.UserModel = {
      findById: sinon.stub().resolves(ctx.user),
    }
    ctx.UserPrimaryEmailCheckHandler = {
      requiresPrimaryEmailCheck: sinon.stub().returns(false),
    }
    ctx.ProjectGetter = {
      promises: {
        findAllUsersProjects: sinon.stub(),
      },
    }
    ctx.ProjectHelper = {
      isArchived: sinon.stub(),
      isTrashed: sinon.stub(),
    }
    ctx.ProjectHelper.isArchived.callsFake(project => Boolean(project.archived))
    ctx.ProjectHelper.isTrashed.callsFake(project => Boolean(project.trashed))
    ctx.SessionManager = {
      getLoggedInUserId: sinon.stub().returns(ctx.user._id),
    }
    ctx.UserController = {
      logout: sinon.stub(),
    }
    ctx.UserGetter = {
      promises: {
        getUsers: sinon.stub().resolves(ctx.usersArr),
        getUserFullEmails: sinon.stub().resolves([]),
      },
    }
    ctx.TutorialHandler = {
      getInactiveTutorials: sinon.stub().returns([]),
    }

    vi.doMock('mongodb-legacy', () => ({
      default: { ObjectId },
    }))

    vi.doMock('@superpaper/settings', () => ({
      default: ctx.settings,
    }))

    vi.doMock('../../../../app/src/Features/User/UserController', () => ({
      default: ctx.UserController,
    }))

    vi.doMock('../../../../app/src/Features/Project/ProjectHelper', () => ({
      default: ctx.ProjectHelper,
    }))

    vi.doMock('../../../../app/src/Features/Tags/TagsHandler', () => ({
      default: ctx.TagsHandler,
    }))

    vi.doMock(
      '../../../../app/src/Features/Notifications/NotificationsHandler',
      () => ({
        default: ctx.NotificationsHandler,
      })
    )

    vi.doMock('../../../../app/src/models/User', () => ({
      User: ctx.UserModel,
    }))

    vi.doMock('../../../../app/src/Features/Project/ProjectGetter', () => ({
      default: ctx.ProjectGetter,
    }))

    vi.doMock(
      '../../../../app/src/Features/Authentication/SessionManager',
      () => ({
        default: ctx.SessionManager,
      })
    )

    vi.doMock('../../../../app/src/Features/User/UserGetter', () => ({
      default: ctx.UserGetter,
    }))

    vi.doMock(
      '../../../../app/src/Features/User/UserPrimaryEmailCheckHandler',
      () => ({
        default: ctx.UserPrimaryEmailCheckHandler,
      })
    )

    vi.doMock('../../../../app/src/Features/Tutorial/TutorialHandler', () => ({
      default: ctx.TutorialHandler,
    }))

    ctx.ProjectListController = (await import(MODULE_PATH)).default

    ctx.req = {
      query: {},
      params: {
        Project_id: ctx.project_id,
      },
      headers: {},
      session: {
        user: ctx.user,
      },
      body: {},
      i18n: {
        translate() {},
      },
    }
    ctx.res = {}
  })

  describe('projectListPage', function () {
    beforeEach(function (ctx) {
      ctx.projects = [
        { _id: 1, lastUpdated: new Date(1), owner_ref: 'user-1' },
        {
          _id: 2,
          lastUpdated: new Date(2),
          owner_ref: 'user-2',
          lastUpdatedBy: 'user-1',
        },
      ]
      ctx.readAndWrite = [
        { _id: 5, lastUpdated: new Date(5), owner_ref: 'user-1' },
      ]
      ctx.readOnly = [{ _id: 3, lastUpdated: new Date(3), owner_ref: 'user-1' }]
      ctx.tokenReadAndWrite = [
        { _id: 6, lastUpdated: new Date(5), owner_ref: 'user-4' },
      ]
      ctx.tokenReadOnly = [
        { _id: 7, lastUpdated: new Date(4), owner_ref: 'user-5' },
      ]
      ctx.review = [{ _id: 8, lastUpdated: new Date(4), owner_ref: 'user-6' }]
      ctx.allProjects = {
        owned: ctx.projects,
        readAndWrite: ctx.readAndWrite,
        readOnly: ctx.readOnly,
        tokenReadAndWrite: ctx.tokenReadAndWrite,
        tokenReadOnly: ctx.tokenReadOnly,
        review: ctx.review,
      }

      ctx.ProjectGetter.promises.findAllUsersProjects.resolves(ctx.allProjects)
    })

    it('should render the project/list-react page', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        pageName.should.equal('project/list-react')
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

    it('should send the tags', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        opts.tags.length.should.equal(ctx.tags.length)
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

    it('should send the projects', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        opts.prefetchedProjectsBlob.projects.length.should.equal(
          ctx.projects.length +
            ctx.readAndWrite.length +
            ctx.readOnly.length +
            ctx.tokenReadAndWrite.length +
            ctx.tokenReadOnly.length +
            ctx.review.length
        )
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

    it('should send the user', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        opts.user.should.deep.equal(ctx.user)
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

    it('should inject the users', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        const projects = opts.prefetchedProjectsBlob.projects

        projects
          .filter(p => p.id === '1')[0]
          .owner.firstName.should.equal(
            ctx.users[ctx.projects.filter(p => p._id === 1)[0].owner_ref]
              .first_name
          )
        projects
          .filter(p => p.id === '2')[0]
          .owner.firstName.should.equal(
            ctx.users[ctx.projects.filter(p => p._id === 2)[0].owner_ref]
              .first_name
          )
        projects
          .filter(p => p.id === '2')[0]
          .lastUpdatedBy.firstName.should.equal(
            ctx.users[ctx.projects.filter(p => p._id === 2)[0].lastUpdatedBy]
              .first_name
          )
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

    it('should prefetch only the first page of projects for the React dashboard', async function (ctx) {
      setOwnedProjects(
        ctx,
        Array.from({ length: 25 }, (_, index) => buildProject(index + 1))
      )

      ctx.res.render = (pageName, opts) => {
        opts.prefetchedProjectsBlob.totalSize.should.equal(25)
        opts.prefetchedProjectsBlob.projects.length.should.equal(20)
        opts.prefetchedProjectsBlob.projects[0].id.should.equal('25')
        opts.prefetchedProjectsBlob.projects[19].id.should.equal('6')
      }

      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

  })

  describe('getProjectsJson pagination contract', function () {
    beforeEach(function (ctx) {
      ctx.res.status = sinon.stub().returns(ctx.res)
      ctx.res.json = sinon.stub()
    })

    it('returns all projects when callers omit paging parameters', async function (ctx) {
      setOwnedProjects(
        ctx,
        Array.from({ length: 25 }, (_, index) => buildProject(index + 1))
      )
      ctx.req.body = {
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(25)
      expect(response.projects).to.have.length(25)
      expect(response.projects.map(project => project.id)).to.deep.equal(
        Array.from({ length: 25 }, (_, index) => String(25 - index))
      )
    })

    it('returns a page using page.size and page.offset after sorting', async function (ctx) {
      setOwnedProjects(
        ctx,
        [1, 2, 3, 4].map(id => buildProject(id))
      )
      ctx.req.body = {
        page: { size: 2, offset: 1 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(4)
      expect(response.page).to.deep.equal({
        size: 2,
        offset: 1,
        nextOffset: 3,
      })
      expect(response.projects.map(project => project.id)).to.deep.equal([
        '3',
        '2',
      ])
    })

    it('reports null nextOffset on the final page', async function (ctx) {
      setOwnedProjects(
        ctx,
        [1, 2, 3].map(id => buildProject(id))
      )
      ctx.req.body = {
        page: { size: 2, offset: 2 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(3)
      expect(response.projects.map(project => project.id)).to.deep.equal(['1'])
      expect(response.page).to.deep.equal({
        size: 2,
        offset: 2,
        nextOffset: null,
      })
    })

    it('sorts by title before pagination', async function (ctx) {
      setOwnedProjects(ctx, [
        buildProject(1, { name: 'Zulu' }),
        buildProject(2, { name: 'Alpha' }),
        buildProject(3, { name: 'Mike' }),
      ])
      ctx.req.body = {
        page: { size: 1, offset: 1 },
        sort: { by: 'title', order: 'asc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(3)
      expect(response.projects.map(project => project.name)).to.deep.equal([
        'Mike',
      ])
    })

    it('sorts by owner before pagination', async function (ctx) {
      ctx.allProjects = {
        owned: [buildProject(3, { name: 'Owned Project' })],
        readAndWrite: [
          buildProject(1, { name: 'Shared Henry', owner_ref: 'user-2' }),
          buildProject(2, { name: 'Shared James', owner_ref: 'user-1' }),
        ],
        readOnly: [],
        tokenReadAndWrite: [],
        tokenReadOnly: [],
        review: [],
      }
      ctx.ProjectGetter.promises.findAllUsersProjects.resolves(ctx.allProjects)
      ctx.req.body = {
        page: { size: 1, offset: 1 },
        sort: { by: 'owner', order: 'asc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(3)
      expect(response.projects.map(project => project.name)).to.deep.equal([
        'Shared James',
      ])
    })

    it('returns 400 for malformed pagination request bodies', async function (ctx) {
      setOwnedProjects(ctx, [buildProject(1)])

      for (const body of [
        { sort: null },
        { filters: null },
        { page: { size: 0, offset: 0 } },
        { page: { size: true, offset: false } },
        { page: { size: [20], offset: [0] } },
      ]) {
        ctx.res.status.resetHistory()
        ctx.res.json.resetHistory()
        ctx.req.body = body

        await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

        expect(ctx.res.status).to.have.been.calledWith(400)
        expect(ctx.res.json.firstCall.args[0]).to.deep.equal({
          error: 'invalid_project_list_request',
        })
      }
    })

    it('reports totalSize after search filtering and before pagination', async function (ctx) {
      setOwnedProjects(ctx, [
        buildProject(1, { name: 'Alpha Notes' }),
        buildProject(2, { name: 'Beta Notes' }),
        buildProject(3, { name: 'alpha Draft' }),
      ])
      ctx.req.body = {
        filters: { search: 'alpha' },
        page: { size: 1, offset: 1 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(2)
      expect(response.projects.map(project => project.name)).to.deep.equal([
        'Alpha Notes',
      ])
    })

    it('applies boolean status filters before pagination', async function (ctx) {
      setOwnedProjects(ctx, [
        buildProject(1, { name: 'Current One' }),
        buildProject(2, { name: 'Archived One', archived: true }),
        buildProject(3, { name: 'Trashed One', trashed: true }),
        buildProject(4, { name: 'Current Two' }),
      ])
      ctx.req.body = {
        filters: { archived: false, trashed: false },
        page: { size: 10, offset: 0 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(2)
      expect(response.projects.map(project => project.name)).to.deep.equal([
        'Current Two',
        'Current One',
      ])
    })

    it('filters by tag id and supports uncategorized filtering', async function (ctx) {
      ctx.tags = [
        {
          _id: 'tag-a',
          name: 'Alpha tag',
          project_ids: ['1', '3'],
        },
      ]
      ctx.TagsHandler.promises.getAllTags.resolves(ctx.tags)
      setOwnedProjects(ctx, [
        buildProject(1, { name: 'Tagged One' }),
        buildProject(2, { name: 'Untagged One' }),
        buildProject(3, { name: 'Tagged Two' }),
      ])

      ctx.req.body = {
        filters: { tag: 'tag-a', archived: false, trashed: false },
        page: { size: 10, offset: 0 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }
      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)
      const taggedResponse = ctx.res.json.firstCall.args[0]

      ctx.res.json.resetHistory()
      ctx.req.body = {
        filters: { tag: null, archived: false, trashed: false },
        page: { size: 10, offset: 0 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }
      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)
      const untaggedResponse = ctx.res.json.firstCall.args[0]

      expect(taggedResponse.totalSize).to.equal(2)
      expect(taggedResponse.projects.map(project => project.name)).to.deep.equal([
        'Tagged Two',
        'Tagged One',
      ])
      expect(untaggedResponse.totalSize).to.equal(1)
      expect(untaggedResponse.projects.map(project => project.name)).to.deep.equal([
        'Untagged One',
      ])
    })

    it('reports tag counts from all active filtered projects, not only the current page', async function (ctx) {
      ctx.tags = [
        {
          _id: 'tag-a',
          name: 'Alpha tag',
          project_ids: ['1', '3'],
        },
        {
          _id: 'tag-b',
          name: 'Archived tag',
          project_ids: ['4'],
        },
      ]
      ctx.TagsHandler.promises.getAllTags.resolves(ctx.tags)
      setOwnedProjects(ctx, [
        buildProject(1, { name: 'Report One' }),
        buildProject(2, { name: 'Report Two' }),
        buildProject(3, { name: 'Report Three' }),
        buildProject(4, { name: 'Archived Report', archived: true }),
      ])
      ctx.req.body = {
        filters: { archived: false, trashed: false, search: 'Report' },
        page: { size: 1, offset: 0 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(3)
      expect(response.projects.map(project => project.name)).to.deep.equal([
        'Report Three',
      ])
      expect(response.tagCounts).to.deep.equal({
        untagged: 1,
        byTagId: {
          'tag-a': 2,
          'tag-b': 0,
        },
      })
    })

    it('caps requested page sizes to a safe maximum', async function (ctx) {
      setOwnedProjects(
        ctx,
        Array.from({ length: 105 }, (_, index) => buildProject(index + 1))
      )
      ctx.req.body = {
        page: { size: 150, offset: 0 },
        sort: { by: 'lastUpdated', order: 'desc' },
      }

      await ctx.ProjectListController.getProjectsJson(ctx.req, ctx.res)

      const response = ctx.res.json.firstCall.args[0]
      expect(response.totalSize).to.equal(105)
      expect(response.projects).to.have.length(100)
      expect(response.projects[0].id).to.equal('105')
      expect(response.projects[99].id).to.equal('6')
    })
  })

  describe('projectListReactPage with duplicate projects', function () {
    beforeEach(function (ctx) {
      ctx.projects = [
        { _id: 1, lastUpdated: new Date(1), owner_ref: 'user-1' },
        { _id: 2, lastUpdated: new Date(2), owner_ref: 'user-2' },
      ]
      ctx.readAndWrite = [
        { _id: 5, lastUpdated: new Date(5), owner_ref: 'user-1' },
      ]
      ctx.readOnly = [{ _id: 3, lastUpdated: new Date(3), owner_ref: 'user-1' }]
      ctx.tokenReadAndWrite = [
        { _id: 6, lastUpdated: new Date(5), owner_ref: 'user-4' },
      ]
      ctx.tokenReadOnly = [
        { _id: 6, lastUpdated: new Date(5), owner_ref: 'user-4' }, // Also in tokenReadAndWrite
        { _id: 7, lastUpdated: new Date(4), owner_ref: 'user-5' },
      ]
      ctx.review = [{ _id: 8, lastUpdated: new Date(5), owner_ref: 'user-6' }]
      ctx.allProjects = {
        owned: ctx.projects,
        readAndWrite: ctx.readAndWrite,
        readOnly: ctx.readOnly,
        tokenReadAndWrite: ctx.tokenReadAndWrite,
        tokenReadOnly: ctx.tokenReadOnly,
        review: ctx.review,
      }

      ctx.ProjectGetter.promises.findAllUsersProjects.resolves(ctx.allProjects)
    })

    it('should render the project/list-react page', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        pageName.should.equal('project/list-react')
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })

    it('should omit one of the projects', async function (ctx) {
      ctx.res.render = (pageName, opts) => {
        opts.prefetchedProjectsBlob.projects.length.should.equal(
          ctx.projects.length +
            ctx.readAndWrite.length +
            ctx.readOnly.length +
            ctx.tokenReadAndWrite.length +
            ctx.tokenReadOnly.length +
            ctx.review.length -
            1
        )
      }
      await ctx.ProjectListController.projectListPage(ctx.req, ctx.res)
    })
  })
})
