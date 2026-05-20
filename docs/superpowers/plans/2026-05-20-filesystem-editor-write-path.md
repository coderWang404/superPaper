# Filesystem Editor Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let filesystem-backed projects write and delete text documents through existing path-based project update APIs.

**Architecture:** Keep Mongo-backed projects on the current `ProjectEntityUpdateHandler` flow. Add filesystem branches to `upsertDocWithPath` and `deleteEntityWithPath` that operate on `ProjectFileStore` and return compatibility objects for existing `EditorController` callers.

**Tech Stack:** Node.js ESM, Vitest, existing `ProjectEntityUpdateHandler`, `ProjectGetter`, `ProjectFileStore`.

---

## Files

- Modify: `services/web/app/src/Features/Project/ProjectEntityUpdateHandler.mjs`
  - Add `ProjectGetter` storage-backend checks.
  - Add `ProjectFileStore.writeTextFile` branch in `upsertDocWithPath`.
  - Add `ProjectFileStore.deleteFile` branch in `deleteEntityWithPath`.
- Modify: `services/web/test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs`
  - Add filesystem write/delete tests.

## Task 1: Filesystem `upsertDocWithPath`

- [ ] **Step 1: Add failing test**

In `services/web/test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs`, add this describe block near existing `upsertDocWithPath` tests:

```js
  describe('upsertDocWithPath for filesystem projects', function () {
    beforeEach(async function (ctx) {
      ctx.project.storageBackend = 'filesystem'
      ctx.ProjectGetter.promises.getProject.resolves(ctx.project)
      ctx.ProjectFileStore = {
        writeTextFile: sinon.stub().resolves({
          projectPath: '/sections/intro.tex',
          sha256: 'sha',
        }),
        deleteFile: sinon.stub().resolves(),
      }
      vi.doMock(
        '../../../../app/src/Features/Project/ProjectFileStore',
        () => ({
          default: ctx.ProjectFileStore,
        })
      )
      ctx.ProjectEntityUpdateHandler = (await import(MODULE_PATH)).default
      ctx.result =
        await ctx.ProjectEntityUpdateHandler.promises.upsertDocWithPath(
          projectId,
          '/sections/intro.tex',
          ['hello', 'world'],
          ctx.source,
          userId
        )
    })

    it('writes the text file to the workspace', function (ctx) {
      ctx.ProjectFileStore.writeTextFile.should.have.been.calledWith({
        projectId,
        projectPath: '/sections/intro.tex',
        content: 'hello\nworld',
      })
    })

    it('returns a compatibility doc result', function (ctx) {
      expect(ctx.result.doc.name).to.equal('intro.tex')
      expect(ctx.result.doc.storageBackend).to.equal('filesystem')
      expect(ctx.result.isNew).to.equal(false)
      expect(ctx.result.newFolders).to.deep.equal([])
    })
  })
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs
```

Expected: FAIL because `upsertDocWithPath` still uses Mongo folder/doc flow.

- [ ] **Step 3: Implement filesystem branch**

In `ProjectEntityUpdateHandler.mjs`, import:

```js
import ProjectFileStore from './ProjectFileStore.mjs'
```

Add helper:

```js
async function isFilesystemProject(projectId) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    storageBackend: 1,
  })
  return project?.storageBackend === 'filesystem'
}
```

At the start of `upsertDocWithPath`, after SafePath validation:

```js
    if (await isFilesystemProject(projectId)) {
      const projectPath = elementPath.startsWith('/')
        ? elementPath
        : `/${elementPath}`
      const write = await ProjectFileStore.writeTextFile({
        projectId,
        projectPath,
        content: docLines.join('\n'),
      })
      return {
        doc: {
          _id: write.sha256.slice(0, 24),
          name: Path.basename(projectPath),
          storageBackend: 'filesystem',
          path: projectPath,
          sha256: write.sha256,
        },
        isNew: false,
        newFolders: [],
        folder: null,
      }
    }
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs
```

Expected: PASS.

## Task 2: Filesystem `deleteEntityWithPath`

- [ ] **Step 1: Add failing delete test**

Add this test inside the existing `deleteEntityWithPath` describe:

```js
    describe('for filesystem projects', function () {
      beforeEach(async function (ctx) {
        ctx.project.storageBackend = 'filesystem'
        ctx.ProjectGetter.promises.getProject.resolves(ctx.project)
        ctx.ProjectFileStore = {
          writeTextFile: sinon.stub().resolves(),
          deleteFile: sinon.stub().resolves({
            projectPath: '/sections/intro.tex',
          }),
        }
        vi.doMock(
          '../../../../app/src/Features/Project/ProjectFileStore',
          () => ({
            default: ctx.ProjectFileStore,
          })
        )
        ctx.ProjectEntityUpdateHandler = (await import(MODULE_PATH)).default
        ctx.result =
          await ctx.ProjectEntityUpdateHandler.promises.deleteEntityWithPath(
            projectId,
            '/sections/intro.tex',
            userId,
            ctx.source
          )
      })

      it('deletes the workspace file by path', function (ctx) {
        ctx.ProjectFileStore.deleteFile.should.have.been.calledWith({
          projectId,
          projectPath: '/sections/intro.tex',
        })
      })

      it('returns the deleted path', function (ctx) {
        expect(ctx.result).to.equal('/sections/intro.tex')
      })
    })
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs
```

Expected: FAIL because delete still calls `ProjectLocator.findElementByPath`.

- [ ] **Step 3: Implement delete branch**

At the start of `deleteEntityWithPath`:

```js
    if (await isFilesystemProject(projectId)) {
      const projectPath = path.startsWith('/') ? path : `/${path}`
      await ProjectFileStore.deleteFile({
        projectId,
        projectPath,
      })
      return projectPath
    }
```

- [ ] **Step 4: Run focused and related tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectEntityUpdateHandler.mjs services/web/test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs docs/superpowers/plans/2026-05-20-filesystem-editor-write-path.md
git commit -m "Add filesystem editor document write path"
```

