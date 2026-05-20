# Filesystem Project Entity Reads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let filesystem-backed projects expose docs, files, doc paths, and folder structure from the canonical workspace.

**Architecture:** Keep Mongo-backed projects on the existing `ProjectEntityHandler` path. Add a filesystem branch that derives doc/file entries from `ProjectFileStore.listFiles()` and reads text docs from workspace files. This gives later editor, compile, and agent work a compatibility layer before mutating flows are switched.

**Tech Stack:** Node.js ESM, Vitest, existing Project models, `FolderStructureBuilder`, `ProjectFileStore`, `ProjectWorkspaceManager`.

---

## Files

- Modify: `services/web/app/src/Features/Project/ProjectFileStore.mjs`
  - Export `isTextProjectPath` and keep file classification stable.
- Modify: `services/web/app/src/Features/Project/ProjectEntityHandler.mjs`
  - Branch `getAllDocs`, `getAllFiles`, `getAllDocPathsFromProjectById`, and `getDocPathByProjectIdAndDocId` for filesystem projects.
  - Add helper `buildFilesystemRootFolder`.
- Modify: `services/web/test/unit/src/Project/ProjectEntityHandler.test.mjs`
  - Add filesystem-backed project tests with mocked `ProjectFileStore`.

## Task 1: File Store Text Classification Export

- [ ] **Step 1: Add failing tests through ProjectEntityHandler expectations**

This task is covered by Task 2 tests, which require filesystem project docs and files to be classified from `ProjectFileStore.listFiles()`.

- [ ] **Step 2: Export `isTextProjectPath`**

Modify the default export in `services/web/app/src/Features/Project/ProjectFileStore.mjs`:

```js
export default {
  readTextFile,
  writeTextFile,
  listFiles,
  renameFile,
  deleteFile,
  isTextProjectPath,
}
```

- [ ] **Step 3: Run existing file store tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectFileStore.test.mjs
```

Expected: PASS.

## Task 2: Filesystem ProjectEntityHandler Reads

- [ ] **Step 1: Add filesystem-backed tests**

Append this block to `services/web/test/unit/src/Project/ProjectEntityHandler.test.mjs` inside the top-level `describe('ProjectEntityHandler', ...)`:

```js
  describe('filesystem-backed projects', function () {
    beforeEach(async function (ctx) {
      vi.resetModules()
      ctx.project.rootFolder = [
        {
          _id: 'root-folder-id',
          name: 'rootFolder',
          docs: [],
          fileRefs: [],
          folders: [],
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
          content:
            projectPath === '/main.tex'
              ? 'hello\\nworld'
              : 'intro',
          sha256: `${projectPath}-sha`,
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
      const docs =
        await ctx.ProjectEntityHandler.promises.getAllDocs(projectId)

      expect(docs['/main.tex'].lines).to.deep.equal(['hello', 'world'])
      expect(docs['/main.tex'].rev).to.equal(0)
      expect(docs['/sections/intro.tex'].lines).to.deep.equal(['intro'])
      expect(Object.keys(docs)).to.deep.equal([
        '/main.tex',
        '/sections/intro.tex',
      ])
    })

    it('gets all files from workspace files', async function (ctx) {
      const files =
        await ctx.ProjectEntityHandler.promises.getAllFiles(projectId)

      expect(Object.keys(files)).to.deep.equal(['/figures/plot.pdf'])
      expect(files['/figures/plot.pdf'].name).to.equal('plot.pdf')
    })

    it('builds a rootFolder compatibility tree from workspace files', function (ctx) {
      const rootFolder =
        ctx.ProjectEntityHandler.buildFilesystemRootFolder([
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityHandler.test.mjs
```

Expected: FAIL because `ProjectEntityHandler` does not branch on `storageBackend`.

- [ ] **Step 3: Modify `ProjectEntityHandler.mjs`**

Add imports:

```js
import { Doc } from '../../models/Doc.mjs'
import { File } from '../../models/File.mjs'
import FolderStructureBuilder from './FolderStructureBuilder.mjs'
import ProjectFileStore from './ProjectFileStore.mjs'
```

In `getAllDocs(projectId)`, after fetching the project with `rootFolder`, branch:

```js
  const project = await ProjectGetter.promises.getProject(projectId, {
    rootFolder: 1,
    storageBackend: 1,
  })
  if (project == null) {
    throw new Errors.NotFoundError('no project')
  }
  if (project.storageBackend === 'filesystem') {
    return await getAllFilesystemDocs(projectId)
  }
```

Avoid fetching project twice by passing the already-fetched project to folder helpers.

Add helper functions:

```js
async function getAllFilesystemDocs(projectId) {
  const entries = await ProjectFileStore.listFiles({ projectId })
  const docs = {}
  for (const entry of entries.filter(entry => entry.type === 'doc')) {
    const file = await ProjectFileStore.readTextFile({
      projectId,
      projectPath: entry.projectPath,
    })
    const doc = createFilesystemDoc(entry.projectPath)
    docs[entry.projectPath] = {
      _id: doc._id,
      name: doc.name,
      lines: file.content.split('\n'),
      rev: 0,
      folder: null,
      storageBackend: 'filesystem',
      sha256: file.sha256,
    }
  }
  return docs
}

async function getAllFilesystemFiles(projectId) {
  const entries = await ProjectFileStore.listFiles({ projectId })
  const files = {}
  for (const entry of entries.filter(entry => entry.type === 'file')) {
    const file = createFilesystemFile(entry.projectPath)
    const fileObject = file.toObject?.() || file
    files[entry.projectPath] = {
      ...fileObject,
      folder: null,
      storageBackend: 'filesystem',
      bytes: entry.bytes,
    }
  }
  return files
}

function buildFilesystemRootFolder(entries) {
  const docEntries = []
  const fileEntries = []
  for (const entry of entries) {
    if (entry.type === 'doc') {
      docEntries.push({
        path: entry.projectPath,
        doc: createFilesystemDoc(entry.projectPath),
      })
    } else {
      fileEntries.push({
        path: entry.projectPath,
        file: createFilesystemFile(entry.projectPath),
      })
    }
  }
  return FolderStructureBuilder.buildFolderStructure(docEntries, fileEntries)
}

function createFilesystemDoc(projectPath) {
  return new Doc({
    _id: deterministicObjectId(`doc:${projectPath}`),
    name: path.basename(projectPath),
  })
}

function createFilesystemFile(projectPath) {
  return new File({
    _id: deterministicObjectId(`file:${projectPath}`),
    name: path.basename(projectPath),
  })
}

function deterministicObjectId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 24)
}
```

Also branch `getAllFiles`, `getAllDocPathsFromProjectById`, and `getDocPathByProjectIdAndDocId` for filesystem projects using these helpers.

- [ ] **Step 4: Run ProjectEntityHandler tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityHandler.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run Phase 1 + Phase 2 related tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectFileStore.mjs services/web/app/src/Features/Project/ProjectEntityHandler.mjs services/web/test/unit/src/Project/ProjectEntityHandler.test.mjs docs/superpowers/plans/2026-05-20-filesystem-project-entity-reads.md
git commit -m "Add filesystem project entity reads"
```
