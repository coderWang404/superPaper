import { vi, expect } from 'vitest'
import sinon from 'sinon'
import Errors from '../../../../app/src/Features/Errors/Errors.js'
const modulePath = '../../../../app/src/Features/Project/ProjectEntityHandler'

vi.mock('../../../../app/src/Features/Errors/Errors.js', () =>
  vi.importActual('../../../../app/src/Features/Errors/Errors.js')
)

describe('ProjectEntityHandler', function () {
  const projectId = '4eecb1c1bffa66588e0000a1'
  const docId = '4eecb1c1bffa66588e0000a2'

  beforeEach(async function (ctx) {
    ctx.TpdsUpdateSender = {
      addDoc: sinon.stub().callsArg(1),
      addFile: sinon.stub().callsArg(1),
    }
    ctx.ProjectModel = class Project {
      constructor(options) {
        this._id = projectId
        this.name = 'project_name_here'
        this.rev = 0
        this.rootFolder = [this.rootFolder]
      }
    }
    ctx.project = new ctx.ProjectModel()

    ctx.ProjectLocator = { findElement: sinon.stub() }
    ctx.DocumentUpdaterHandler = {
      updateProjectStructure: sinon.stub().yields(),
    }
    ctx.callback = sinon.stub()

    vi.doMock('../../../../app/src/Features/Docstore/DocstoreManager', () => ({
      default: (ctx.DocstoreManager = {
        promises: {},
      }),
    }))

    vi.doMock(
      '../../../../app/src/Features/DocumentUpdater/DocumentUpdaterHandler',
      () => ({
        default: ctx.DocumentUpdaterHandler,
      })
    )

    vi.doMock('../../../../app/src/models/Project', () => ({
      Project: ctx.ProjectModel,
    }))

    vi.doMock('../../../../app/src/Features/Project/ProjectLocator', () => ({
      default: ctx.ProjectLocator,
    }))

    vi.doMock('../../../../app/src/Features/Project/ProjectGetter', () => ({
      default: (ctx.ProjectGetter = { promises: {} }),
    }))

    vi.doMock(
      '../../../../app/src/Features/ThirdPartyDataStore/TpdsUpdateSender',
      () => ({
        default: ctx.TpdsUpdateSender,
      })
    )

    ctx.ProjectEntityHandler = (await import(modulePath)).default
  })

  describe('getting folders, docs and files', function () {
    beforeEach(function (ctx) {
      ctx.project.rootFolder = [
        {
          docs: [
            (ctx.doc1 = {
              name: 'doc1',
              _id: 'doc1_id',
            }),
          ],
          fileRefs: [
            (ctx.file1 = {
              rev: 1,
              _id: 'file1_id',
              name: 'file1',
            }),
          ],
          folders: [
            (ctx.folder1 = {
              name: 'folder1',
              docs: [
                (ctx.doc2 = {
                  name: 'doc2',
                  _id: 'doc2_id',
                }),
              ],
              fileRefs: [
                (ctx.file2 = {
                  rev: 2,
                  name: 'file2',
                  _id: 'file2_id',
                }),
              ],
              folders: [],
            }),
          ],
        },
      ]
      ctx.ProjectGetter.promises.getProject = sinon.stub().resolves(ctx.project)
    })

    describe('getAllDocs', function () {
      let fetchedDocs
      beforeEach(async function (ctx) {
        ctx.docs = [
          {
            _id: ctx.doc1._id,
            lines: (ctx.lines1 = ['one']),
            rev: (ctx.rev1 = 1),
          },
          {
            _id: ctx.doc2._id,
            lines: (ctx.lines2 = ['two']),
            rev: (ctx.rev2 = 2),
          },
        ]
        ctx.DocstoreManager.promises.getAllDocs = sinon
          .stub()
          .resolves(ctx.docs)
        fetchedDocs =
          await ctx.ProjectEntityHandler.promises.getAllDocs(projectId)
      })

      it('should get the doc lines and rev from the docstore', function (ctx) {
        ctx.DocstoreManager.promises.getAllDocs
          .calledWith(projectId)
          .should.equal(true)
      })

      it('should call the callback with the docs with the lines and rev included', function (ctx) {
        expect(fetchedDocs).to.deep.equal({
          '/doc1': {
            _id: ctx.doc1._id,
            lines: ctx.lines1,
            name: ctx.doc1.name,
            rev: ctx.rev1,
            folder: ctx.project.rootFolder[0],
          },
          '/folder1/doc2': {
            _id: ctx.doc2._id,
            lines: ctx.lines2,
            name: ctx.doc2.name,
            rev: ctx.rev2,
            folder: ctx.folder1,
          },
        })
      })
    })

    describe('getAllFiles', function () {
      let allFiles
      beforeEach(async function (ctx) {
        ctx.callback = sinon.stub()
        allFiles = await ctx.ProjectEntityHandler.promises.getAllFiles(
          projectId,
          ctx.callback
        )
      })

      it('should call the callback with the files', function (ctx) {
        expect(allFiles).to.deep.equal({
          '/file1': { ...ctx.file1, folder: ctx.project.rootFolder[0] },
          '/folder1/file2': { ...ctx.file2, folder: ctx.folder1 },
        })
      })
    })

    describe('getAllDocPathsFromProject', function () {
      beforeEach(function (ctx) {
        ctx.docs = [
          {
            _id: ctx.doc1._id,
            lines: (ctx.lines1 = ['one']),
            rev: (ctx.rev1 = 1),
          },
          {
            _id: ctx.doc2._id,
            lines: (ctx.lines2 = ['two']),
            rev: (ctx.rev2 = 2),
          },
        ]
      })

      it('should call the callback with the path for each docId', function (ctx) {
        const expected = {
          [ctx.doc1._id]: `/${ctx.doc1.name}`,
          [ctx.doc2._id]: `/folder1/${ctx.doc2.name}`,
        }
        expect(
          ctx.ProjectEntityHandler.getAllDocPathsFromProject(
            ctx.project,
            ctx.callback
          )
        ).to.deep.equal(expected)
      })
    })

    describe('getDocPathByProjectIdAndDocId', function () {
      it('should call the callback with the path for an existing doc id at the root level', async function (ctx) {
        const path =
          await ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            ctx.doc1._id
          )
        expect(path).to.deep.equal(`/${ctx.doc1.name}`)
      })

      it('should call the callback with the path for an existing doc id nested within a folder', async function (ctx) {
        const path =
          await ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            ctx.doc2._id
          )
        expect(path).to.deep.equal(`/folder1/${ctx.doc2.name}`)
      })

      it('should call the callback with a NotFoundError for a non-existing doc', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            'non-existing-id'
          )
        ).to.be.rejectedWith(Errors.NotFoundError)
      })

      it('should call the callback with a NotFoundError for an existing file', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            ctx.file1._id
          )
        ).to.be.rejectedWith(Errors.NotFoundError)
      })
    })

    describe('_getAllFolders', async function () {
      let folders
      beforeEach(async function (ctx) {
        ctx.callback = sinon.stub()
        folders =
          await ctx.ProjectEntityHandler.promises._getAllFolders(projectId)
      })

      it('should get the project without the docs lines', function (ctx) {
        ctx.ProjectGetter.promises.getProject
          .calledWith(projectId)
          .should.equal(true)
      })

      it('should call the callback with the folders', function (ctx) {
        expect(folders).to.deep.equal([
          { path: '/', folder: ctx.project.rootFolder[0] },
          { path: '/folder1', folder: ctx.folder1 },
        ])
      })
    })

    describe('_getAllFoldersFromProject', function () {
      it('should return the folders', function (ctx) {
        expect(
          ctx.ProjectEntityHandler._getAllFoldersFromProject(ctx.project)
        ).to.deep.equal([
          { path: '/', folder: ctx.project.rootFolder[0] },
          { path: '/folder1', folder: ctx.folder1 },
        ])
      })
    })
  })

  describe('with an invalid file tree', function () {
    beforeEach(function (ctx) {
      ctx.project.rootFolder = [
        {
          docs: [
            (ctx.doc1 = {
              name: null, // invalid doc name
              _id: 'doc1_id',
            }),
          ],
          fileRefs: [
            (ctx.file1 = {
              rev: 1,
              _id: 'file1_id',
              name: null, // invalid file name
            }),
          ],
          folders: [
            (ctx.folder1 = {
              name: null, // invalid folder name
              docs: [
                (ctx.doc2 = {
                  name: 'doc2',
                  _id: 'doc2_id',
                }),
              ],
              fileRefs: [
                (ctx.file2 = {
                  rev: 2,
                  name: 'file2',
                  _id: 'file2_id',
                }),
              ],
              folders: null,
            }),
            null, // invalid folder
          ],
        },
      ]
      ctx.ProjectGetter.promises.getProject = sinon.stub().resolves(ctx.project)
    })

    describe('getAllDocs', function () {
      beforeEach(async function (ctx) {
        ctx.docs = [
          {
            _id: ctx.doc1._id,
            lines: (ctx.lines1 = ['one']),
            rev: (ctx.rev1 = 1),
          },
          {
            _id: ctx.doc2._id,
            lines: (ctx.lines2 = ['two']),
            rev: (ctx.rev2 = 2),
          },
        ]
        ctx.DocstoreManager.promises.getAllDocs = sinon
          .stub()
          .resolves(ctx.docs)
      })

      it('should call the callback with an error', async function (ctx) {
        await expect(ctx.ProjectEntityHandler.promises.getAllDocs(projectId)).to
          .be.rejected
      })
    })

    describe('getAllFiles', function () {
      it('should call the callback with and error', async function (ctx) {
        await expect(ctx.ProjectEntityHandler.promises.getAllFiles(projectId))
          .to.be.rejected
      })
    })

    describe('getDocPathByProjectIdAndDocId', function () {
      it('should call the callback with an error for an existing doc id at the root level', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            ctx.doc1._id
          )
        ).to.be.rejectedWith(Error)
      })

      it('should call the callback with an error for an existing doc id nested within a folder', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            ctx.doc2._id
          )
        ).to.be.rejectedWith(Error)
      })

      it('should call the callback with an error for a non-existing doc', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            'non-existing-id'
          )
        ).to.be.rejectedWith(Error)
      })

      it('should call the callback with an error for an existing file', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathByProjectIdAndDocId(
            projectId,
            ctx.file1._id
          )
        ).to.be.rejectedWith(Error)
      })
    })

    describe('_getAllFolders', function () {
      it('should call the callback with an error', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises._getAllFolders(projectId)
        ).to.be.rejected
      })
    })

    describe('getAllEntities', function () {
      beforeEach(function (ctx) {
        ctx.ProjectGetter.promises.getProject = sinon
          .stub()
          .resolves(ctx.project)
      })

      it('should call the callback with an error', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getAllEntities(projectId)
        ).to.be.rejected
      })
    })

    describe('getAllDocPathsFromProjectById', function () {
      it('should call the callback with an error', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getAllDocPathsFromProjectById(
            projectId
          )
        ).to.be.rejected
      })
    })

    describe('getDocPathFromProjectByDocId', function () {
      it('should call the callback with an error', async function (ctx) {
        await expect(
          ctx.ProjectEntityHandler.promises.getDocPathFromProjectByDocId(
            projectId,
            ctx.doc1._id
          )
        ).to.be.rejected
      })
    })
  })

  describe('getDoc', function () {
    beforeEach(function (ctx) {
      ctx.lines = ['mock', 'doc', 'lines']
      ctx.rev = 5
      ctx.version = 42
      ctx.ranges = { mock: 'ranges' }
      ctx.callback = sinon.stub()
      ctx.ProjectGetter.promises.getProject = sinon.stub().resolves(ctx.project)
      ctx.DocstoreManager.promises.getDoc = sinon.stub().resolves({
        lines: ctx.lines,
        rev: ctx.rev,
        version: ctx.version,
        ranges: ctx.ranges,
      })
    })

    it('should call the callback with the lines, version and rev', async function (ctx) {
      const doc = await ctx.ProjectEntityHandler.promises.getDoc(
        projectId,
        docId
      )
      ctx.DocstoreManager.promises.getDoc
        .calledWith(projectId, docId)
        .should.equal(true)
      expect(doc).to.exist
    })
  })

  describe('promises.getDoc', function () {
    let result

    beforeEach(async function (ctx) {
      ctx.lines = ['mock', 'doc', 'lines']
      ctx.rev = 5
      ctx.version = 42
      ctx.ranges = { mock: 'ranges' }
      ctx.ProjectGetter.promises.getProject = sinon.stub().resolves(ctx.project)

      ctx.DocstoreManager.promises.getDoc = sinon.stub().resolves({
        lines: ctx.lines,
        rev: ctx.rev,
        version: ctx.version,
        ranges: ctx.ranges,
      })
      result = await ctx.ProjectEntityHandler.promises.getDoc(projectId, docId)
    })

    it('should call the docstore', function (ctx) {
      ctx.DocstoreManager.promises.getDoc
        .calledWith(projectId, docId)
        .should.equal(true)
    })

    it('should return the lines, rev, version and ranges', function (ctx) {
      expect(result.lines).to.equal(ctx.lines)
      expect(result.rev).to.equal(ctx.rev)
      expect(result.version).to.equal(ctx.version)
      expect(result.ranges).to.equal(ctx.ranges)
    })
  })

  describe('filesystem-backed projects', function () {
    beforeEach(async function (ctx) {
      vi.resetModules()
      ctx.project.rootFolder = [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [
            {
              _id: 'legacy-main-doc-id',
              name: 'main.tex',
            },
          ],
          fileRefs: [],
          folders: [
            {
              _id: 'legacy-sections-folder-id',
              name: 'sections',
              docs: [
                {
                  _id: 'legacy-intro-doc-id',
                  name: 'intro.tex',
                },
              ],
              fileRefs: [],
              folders: [],
            },
          ],
        },
      ]
      ctx.project.storageBackend = 'filesystem'
      ctx.ProjectGetter.promises.getProject = sinon.stub().resolves(ctx.project)
      ctx.ProjectFileStore = {
        listFiles: sinon.stub().resolves([
          {
            projectPath: '/main.tex',
            type: 'doc',
            bytes: 11,
          },
          {
            projectPath: '/sections/intro.tex',
            type: 'doc',
            bytes: 5,
          },
          {
            projectPath: '/figures/plot.pdf',
            type: 'file',
            bytes: 4,
          },
        ]),
        readTextFile: sinon.stub().callsFake(async ({ projectPath }) => ({
          projectPath,
          content: projectPath === '/main.tex' ? 'hello\nworld' : 'intro',
          sha256: `${projectPath}-sha`,
        })),
        readFileBuffer: sinon.stub().callsFake(async ({ projectPath }) => ({
          projectPath,
          content: Buffer.from([1, 2, 3, 4]),
          bytes: 4,
          sha256: `${projectPath}-binary-sha`,
        })),
      }
      vi.doMock(
        '../../../../app/src/Features/Project/ProjectFileStore.mjs',
        () => ({
          default: ctx.ProjectFileStore,
        })
      )
      ctx.ProjectEntityHandler = (await import(modulePath)).default
    })

    it('gets all docs from workspace files', async function (ctx) {
      const docs = await ctx.ProjectEntityHandler.promises.getAllDocs(projectId)

      expect(docs['/main.tex'].lines).to.deep.equal(['hello', 'world'])
      expect(docs['/main.tex'].rev).to.equal(0)
      expect(docs['/sections/intro.tex'].lines).to.deep.equal(['intro'])
      expect(Object.keys(docs)).to.deep.equal([
        '/main.tex',
        '/sections/intro.tex',
      ])
    })

    it('gets all files from workspace files', async function (ctx) {
      const files = await ctx.ProjectEntityHandler.promises.getAllFiles(
        projectId
      )

      expect(Object.keys(files)).to.deep.equal(['/figures/plot.pdf'])
      expect(files['/figures/plot.pdf'].name).to.equal('plot.pdf')
    })

    it('gets filesystem binary files with base64 content', async function (ctx) {
      const files = await ctx.ProjectEntityHandler.promises.getAllFiles(
        projectId
      )

      expect(files['/figures/plot.pdf']).to.include({
        storageBackend: 'filesystem',
        bytes: 4,
        sha256: '/figures/plot.pdf-binary-sha',
        contentBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
      })
      expect(ctx.ProjectFileStore.readFileBuffer).to.have.been.calledWith({
        projectId,
        projectPath: '/figures/plot.pdf',
      })
    })

    it('builds a rootFolder compatibility tree from workspace files', function (ctx) {
      const rootFolder = ctx.ProjectEntityHandler.buildFilesystemRootFolder([
        {
          projectPath: '/main.tex',
          type: 'doc',
        },
        {
          projectPath: '/sections/intro.tex',
          type: 'doc',
        },
        {
          projectPath: '/figures/plot.pdf',
          type: 'file',
        },
      ])

      expect(rootFolder.docs.map(doc => doc.name)).to.deep.equal(['main.tex'])
      expect(rootFolder.folders.map(folder => folder.name)).to.deep.equal([
        'sections',
        'figures',
      ])
    })

    it('preserves existing doc ids when rebuilding the filesystem tree', function (ctx) {
      const rootFolder = ctx.ProjectEntityHandler.buildFilesystemRootFolder(
        [
          {
            projectPath: '/main.tex',
            type: 'doc',
          },
          {
            projectPath: '/new-agent-file.tex',
            type: 'doc',
          },
          {
            projectPath: '/sections/intro.tex',
            type: 'doc',
          },
        ],
        ctx.project.rootFolder[0]
      )

      expect(rootFolder.docs.find(doc => doc.name === 'main.tex')).to.include({
        _id: 'legacy-main-doc-id',
        name: 'main.tex',
      })
      expect(
        rootFolder.docs.find(doc => doc.name === 'new-agent-file.tex')._id
      ).to.match(/^[a-f0-9]{24}$/)
      expect(
        rootFolder.docs.find(doc => doc.name === 'new-agent-file.tex')._id
      ).not.to.equal('legacy-main-doc-id')
      expect(
        rootFolder.folders
          .find(folder => folder.name === 'sections')
          .docs.find(doc => doc.name === 'intro.tex')
      ).to.include({
        _id: 'legacy-intro-doc-id',
        name: 'intro.tex',
      })
    })

    it('reads filesystem docs from the workspace by preserved doc id', async function (ctx) {
      const doc = await ctx.ProjectEntityHandler.promises.getDoc(
        projectId,
        'legacy-main-doc-id'
      )

      expect(doc).to.deep.include({
        rev: 0,
        version: 0,
      })
      expect(doc.lines).to.deep.equal(['hello', 'world'])
      expect(doc.ranges).to.deep.equal({})
      expect(ctx.ProjectFileStore.readTextFile).to.have.been.calledWith({
        projectId,
        projectPath: '/main.tex',
      })
    })

    it('returns the preserved filesystem doc id for a workspace path', async function (ctx) {
      const docId =
        await ctx.ProjectEntityHandler.promises.getFilesystemDocIdForPath(
          projectId,
          '/sections/intro.tex'
        )

      expect(docId).to.equal('legacy-intro-doc-id')
    })

    it('gets doc paths by generated doc id', async function (ctx) {
      const paths =
        await ctx.ProjectEntityHandler.promises.getAllDocPathsFromProjectById(
          projectId
        )

      expect(Object.values(paths)).to.deep.equal([
        '/main.tex',
        '/sections/intro.tex',
      ])
    })
  })
})
