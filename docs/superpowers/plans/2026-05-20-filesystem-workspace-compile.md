# Filesystem Workspace Compile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile filesystem-backed projects from the canonical workspace files, including binary resources.

**Architecture:** Keep Mongo-backed compile behavior unchanged. For filesystem projects, `ClsiManager` builds full compile requests from `ProjectEntityHandler` workspace docs/files, skips doc-updater incremental reads, and serializes non-text workspace files as base64 content resources. CLSI accepts `contentEncoding: 'base64'` and writes decoded bytes to disk.

**Tech Stack:** Node.js ESM, Vitest, existing `ClsiManager`, `ProjectEntityHandler`, `ProjectFileStore`, CLSI `RequestParser`, CLSI `ResourceWriter`.

---

## Files

- Modify: `services/web/app/src/Features/Project/ProjectFileStore.mjs`
  - Add `readFileBuffer({ projectId, projectPath })` for binary workspace resources.
- Modify: `services/web/test/unit/src/Project/ProjectFileStore.test.mjs`
  - Cover binary read metadata and hash.
- Modify: `services/web/app/src/Features/Project/ProjectEntityHandler.mjs`
  - Include `contentBase64`, `sha256`, and `modified` on filesystem non-text files.
- Modify: `services/web/test/unit/src/Project/ProjectEntityHandler.test.mjs`
  - Cover filesystem file binary payloads.
- Modify: `services/web/app/src/Features/Compile/ClsiManager.mjs`
  - Fetch `storageBackend`.
  - Route filesystem projects to workspace full compile requests.
  - Emit base64 resources for filesystem binary files.
- Modify: `services/web/test/unit/src/Compile/ClsiManager.test.mjs`
  - Cover filesystem compile request construction and doc-updater bypass.
- Modify: `services/clsi/app/js/RequestParser.js`
  - Parse optional `contentEncoding`.
  - Permit only `base64`.
- Modify: `services/clsi/test/unit/js/RequestParser.test.js`
  - Cover accepted and rejected `contentEncoding`.
- Modify: `services/clsi/app/js/ResourceWriter.js`
  - Decode base64 content to `Buffer` before writing.
- Modify: `services/clsi/test/unit/js/ResourceWriter.test.js`
  - Cover binary content writes.

## Task 1: Binary Workspace Reads

- [ ] **Step 1: Add failing file-store test**

In `services/web/test/unit/src/Project/ProjectFileStore.test.mjs`, add:

```js
  it('reads a binary file as a buffer with metadata', async function (ctx) {
    const absolutePath = path.join(
      ctx.tmpRoot,
      'project-1',
      'workspace',
      'figures',
      'plot.pdf'
    )
    const bytes = Buffer.from([0, 1, 2, 255])
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, bytes)

    const file = await ctx.ProjectFileStore.readFileBuffer({
      projectId: 'project-1',
      projectPath: '/figures/plot.pdf',
    })

    expect(file.projectPath).to.equal('/figures/plot.pdf')
    expect(Buffer.isBuffer(file.content)).to.equal(true)
    expect(file.content).to.deep.equal(bytes)
    expect(file.bytes).to.equal(4)
    expect(file.sha256).to.match(/^[a-f0-9]{64}$/)
  })
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectFileStore.test.mjs
```

Expected: FAIL with `readFileBuffer is not a function`.

- [ ] **Step 3: Implement `readFileBuffer`**

In `services/web/app/src/Features/Project/ProjectFileStore.mjs`, add:

```js
async function readFileBuffer({ projectId, projectPath }) {
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  let content
  try {
    content = await fs.readFile(resolved.absolutePath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ProjectFileStoreError(
        'PROJECT_FILE_NOT_FOUND',
        'Project file not found'
      )
    }
    throw err
  }
  return {
    projectPath: resolved.projectPath,
    absolutePath: resolved.absolutePath,
    content,
    bytes: content.length,
    sha256: sha256(content),
  }
}
```

Export it in the default object:

```js
  readFileBuffer,
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectFileStore.test.mjs
```

Expected: PASS.

## Task 2: Filesystem File Entities Carry Base64 Content

- [ ] **Step 1: Add failing entity-handler test**

In `services/web/test/unit/src/Project/ProjectEntityHandler.test.mjs`, inside `describe('filesystem-backed projects')`, update `ctx.ProjectFileStore` to include:

```js
        readFileBuffer: sinon.stub().callsFake(async ({ projectPath }) => ({
          projectPath,
          content: Buffer.from([1, 2, 3, 4]),
          bytes: 4,
          sha256: `${projectPath}-binary-sha`,
        })),
```

Then add:

```js
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
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityHandler.test.mjs
```

Expected: FAIL because filesystem file entries do not include base64 content yet.

- [ ] **Step 3: Implement filesystem binary file payloads**

In `services/web/app/src/Features/Project/ProjectEntityHandler.mjs`, replace `getAllFilesystemFiles` with:

```js
async function getAllFilesystemFiles(projectId) {
  const entries = await ProjectFileStore.listFiles({ projectId })
  const files = {}
  for (const entry of entries.filter(entry => entry.type === 'file')) {
    const file = createFilesystemFile(entry.projectPath)
    const content = await ProjectFileStore.readFileBuffer({
      projectId,
      projectPath: entry.projectPath,
    })
    files[entry.projectPath] = {
      ...file,
      folder: null,
      storageBackend: 'filesystem',
      bytes: content.bytes,
      contentBase64: content.content.toString('base64'),
      sha256: content.sha256,
    }
  }
  return files
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectEntityHandler.test.mjs
```

Expected: PASS.

## Task 3: Web Compile Request Uses Workspace Resources

- [ ] **Step 1: Add failing compile test**

In `services/web/test/unit/src/Compile/ClsiManager.test.mjs`, inside `describe('sendRequest')`, add:

```js
    describe('with a filesystem-backed project', function () {
      beforeEach(async function (ctx) {
        ctx.project.storageBackend = 'filesystem'
        ctx.docs = {
          '/main.tex': {
            name: 'main.tex',
            _id: 'fs-main-doc-id',
            lines: ['\\includegraphics{figures/plot.pdf}'],
          },
        }
        ctx.files = {
          '/figures/plot.pdf': {
            name: 'plot.pdf',
            _id: 'fs-file-id',
            storageBackend: 'filesystem',
            contentBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
            bytes: 4,
            sha256: 'plot-sha',
          },
        }
        ctx.ProjectEntityHandler.promises.getAllDocs.resolves(ctx.docs)
        ctx.ProjectEntityHandler.promises.getAllFiles.resolves(ctx.files)

        await ctx.ClsiManager.promises.sendRequest(
          ctx.project._id,
          ctx.user_id,
          {
            compileBackendClass: 'c3d',
            compileGroup: 'standard',
            incrementalCompilesEnabled: true,
          }
        )
      })

      it('gets the project storage backend with compile fields', function (ctx) {
        ctx.ProjectGetter.promises.getProject.should.have.been.calledWith(
          ctx.project._id,
          {
            compiler: 1,
            rootDoc_id: 1,
            imageName: 1,
            rootFolder: 1,
            storageBackend: 1,
            'superpaper.history.id': 1,
          }
        )
      })

      it('does not read from the doc updater', function (ctx) {
        expect(
          ctx.DocumentUpdaterHandler.promises.getProjectDocsIfMatch
        ).not.to.have.been.called
        expect(
          ctx.DocumentUpdaterHandler.promises.flushProjectToMongo
        ).not.to.have.been.called
      })

      it('sends workspace docs and binary files to CLSI', function (ctx) {
        expect(ctx.FetchUtils.fetchStringWithResponse).to.have.been.calledWith(
          sinon.match.any,
          sinon.match({
            json: {
              compile: {
                rootResourcePath: 'main.tex',
                resources: [
                  {
                    path: 'main.tex',
                    content: '\\includegraphics{figures/plot.pdf}',
                  },
                  {
                    path: 'figures/plot.pdf',
                    content: Buffer.from([1, 2, 3, 4]).toString('base64'),
                    contentEncoding: 'base64',
                    modified: undefined,
                  },
                ],
              },
            },
          })
        )
      })
    })
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Compile/ClsiManager.test.mjs
```

Expected: FAIL because `storageBackend` is not requested and filesystem files are still converted to history blob URLs.

- [ ] **Step 3: Implement filesystem compile request routing**

In `services/web/app/src/Features/Compile/ClsiManager.mjs`, include `storageBackend` in the project projection:

```js
    storageBackend: 1,
```

After compile-from-history handling and before incremental/doc-updater handling, add:

```js
  if (project.storageBackend === 'filesystem') {
    const timer = new Metrics.Timer('editor.compile-getdocs-filesystem')
    const { docs, files } = await _getContentFromWorkspace(projectId)
    timer.done()
    return _finaliseRequest(projectId, options, project, docs, files)
  }
```

Add:

```js
async function _getContentFromWorkspace(projectId) {
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const files = await ProjectEntityHandler.promises.getAllFiles(projectId)
  return { docs, files }
}
```

In `_finaliseRequest`, replace the file-resource push block with:

```js
    if (file.storageBackend === 'filesystem') {
      resources.push({
        path,
        content: file.contentBase64,
        contentEncoding: 'base64',
        modified: file.modified?.getTime?.(),
      })
    } else {
      resources.push({
        path,
        url: HistoryManager.getFilestoreBlobURL(historyId, file.hash),
        modified: file.created?.getTime(),
      })
    }
```

- [ ] **Step 4: Run web compile tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Compile/ClsiManager.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs
```

Expected: PASS.

## Task 4: CLSI Parses Base64 Resource Encoding

- [ ] **Step 1: Add failing parser tests**

In `services/clsi/test/unit/js/RequestParser.test.js`, add:

```js
  describe('with a base64 content resource', () => {
    beforeEach(async ctx => {
      await new Promise((resolve, reject) => {
        ctx.validResource.content = Buffer.from([1, 2, 3]).toString('base64')
        ctx.validResource.contentEncoding = 'base64'
        ctx.validRequest.compile.resources.push(ctx.validResource)
        ctx.RequestParser.parse(ctx.validRequest, (error, data) => {
          if (error) return reject(error)
          ctx.data = data
          resolve()
        })
      })
    })

    it('should return the content encoding in the parsed response', ctx => {
      ctx.data.resources[0].contentEncoding.should.equal('base64')
    })
  })

  describe('with an unsupported content encoding', () => {
    beforeEach(ctx => {
      ctx.validResource.contentEncoding = 'gzip'
      ctx.validRequest.compile.resources.push(ctx.validResource)
      ctx.RequestParser.parse(ctx.validRequest, ctx.callback)
    })

    it('should return an error', ctx => {
      ctx.callback
        .calledWithMatch({
          message: 'contentEncoding attribute should be one of: base64',
        })
        .should.equal(true)
    })
  })
```

- [ ] **Step 2: Run parser test and verify it fails**

Run:

```bash
corepack yarn --cwd services/clsi test:unit --run test/unit/js/RequestParser.test.js
```

Expected: FAIL because `contentEncoding` is discarded and unsupported values are not rejected.

- [ ] **Step 3: Implement `contentEncoding` parsing**

In `services/clsi/app/js/RequestParser.js`, inside `_parseResource`, add:

```js
  const contentEncoding = _parseAttribute(
    'contentEncoding',
    resource.contentEncoding,
    {
      validValues: ['base64'],
      type: 'string',
    }
  )
```

Return it:

```js
    contentEncoding,
```

- [ ] **Step 4: Run parser test and verify it passes**

Run:

```bash
corepack yarn --cwd services/clsi test:unit --run test/unit/js/RequestParser.test.js
```

Expected: PASS.

## Task 5: CLSI Writes Base64 Resource Bytes

- [ ] **Step 1: Add failing resource-writer test**

In `services/clsi/test/unit/js/ResourceWriter.test.js`, near the content-based resource tests, add:

```js
    describe('with a base64 content resource', () => {
      beforeEach(ctx => {
        ctx.bytes = Buffer.from([0, 1, 2, 255])
        ctx.resource = {
          path: 'figures/plot.pdf',
          content: ctx.bytes.toString('base64'),
          contentEncoding: 'base64',
        }
        ctx.fs.writeFile = sinon.stub().callsArg(2)
        ctx.fs.mkdir = sinon.stub().callsArg(2)
        return ctx.ResourceWriter._writeResourceToDisk(
          ctx.project_id,
          ctx.resource,
          ctx.basePath,
          ctx.callback
        )
      })

      it('should write decoded bytes to disk', ctx => {
        return ctx.fs.writeFile
          .calledWith(
            path.join(ctx.basePath, ctx.resource.path),
            sinon.match(value => Buffer.isBuffer(value) && value.equals(ctx.bytes))
          )
          .should.equal(true)
      })
    })
```

- [ ] **Step 2: Run resource-writer test and verify it fails**

Run:

```bash
corepack yarn --cwd services/clsi test:unit --run test/unit/js/ResourceWriter.test.js
```

Expected: FAIL because `ResourceWriter` writes the base64 string as UTF-8 text.

- [ ] **Step 3: Implement decoded writes**

In `services/clsi/app/js/ResourceWriter.js`, replace:

```js
              fs.writeFile(path, resource.content, callback)
```

with:

```js
              const content =
                resource.contentEncoding === 'base64'
                  ? Buffer.from(resource.content, 'base64')
                  : resource.content
              fs.writeFile(path, content, callback)
```

- [ ] **Step 4: Run CLSI unit tests for parser/writer**

Run:

```bash
corepack yarn --cwd services/clsi test:unit --run test/unit/js/RequestParser.test.js test/unit/js/ResourceWriter.test.js
```

Expected: PASS.

## Task 6: Final Related Verification And Commit

- [ ] **Step 1: Run Phase 4 related tests**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs test/unit/src/Compile/ClsiManager.test.mjs
corepack yarn --cwd services/clsi test:unit --run test/unit/js/RequestParser.test.js test/unit/js/ResourceWriter.test.js
```

Expected: PASS for both commands.

- [ ] **Step 2: Run broader Phase 1-4 regression set**

Run:

```bash
corepack yarn --cwd services/web test:unit --run test/unit/src/Project/ProjectWorkspaceManager.test.mjs test/unit/src/Project/ProjectFileStore.test.mjs test/unit/src/Project/ProjectCheckpointService.test.mjs test/unit/src/Project/ProjectStorageMigrationService.test.mjs test/unit/src/Project/ProjectEntityHandler.test.mjs test/unit/src/Project/ProjectEntityUpdateHandler.test.mjs test/unit/src/Compile/ClsiManager.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add services/web/app/src/Features/Project/ProjectFileStore.mjs services/web/test/unit/src/Project/ProjectFileStore.test.mjs services/web/app/src/Features/Project/ProjectEntityHandler.mjs services/web/test/unit/src/Project/ProjectEntityHandler.test.mjs services/web/app/src/Features/Compile/ClsiManager.mjs services/web/test/unit/src/Compile/ClsiManager.test.mjs services/clsi/app/js/RequestParser.js services/clsi/test/unit/js/RequestParser.test.js services/clsi/app/js/ResourceWriter.js services/clsi/test/unit/js/ResourceWriter.test.js docs/superpowers/plans/2026-05-20-filesystem-workspace-compile.md
git commit -m "Compile filesystem projects from workspace files"
```
