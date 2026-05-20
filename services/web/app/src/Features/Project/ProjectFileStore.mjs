import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import ProjectWorkspaceManager from './ProjectWorkspaceManager.mjs'

const TEXT_EXTENSIONS = new Set([
  '.tex',
  '.bib',
  '.cls',
  '.sty',
  '.md',
  '.txt',
  '.ltx',
])

export class ProjectFileStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProjectFileStoreError'
    this.code = code
  }
}

async function ensureWorkspace(projectId) {
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  await fs.mkdir(workspaceRoot, { recursive: true })
  return workspaceRoot
}

async function readTextFile({ projectId, projectPath }) {
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  let content
  try {
    content = await fs.readFile(resolved.absolutePath, 'utf8')
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
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  }
}

async function writeTextFile({ projectId, projectPath, content }) {
  assertTextPath(projectPath)
  await ensureWorkspace(projectId)
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true })
  await fs.writeFile(resolved.absolutePath, content, 'utf8')
  return {
    projectPath: resolved.projectPath,
    absolutePath: resolved.absolutePath,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  }
}

async function listFiles({ projectId }) {
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  const files = []
  await walk(workspaceRoot, '/', files)
  return files.sort((a, b) => a.projectPath.localeCompare(b.projectPath))
}

async function renameFile({ projectId, fromPath, toPath }) {
  const from = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath: fromPath,
  })
  const to = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath: toPath,
  })
  await fs.mkdir(path.dirname(to.absolutePath), { recursive: true })
  await fs.rename(from.absolutePath, to.absolutePath)
  return {
    fromPath: from.projectPath,
    toPath: to.projectPath,
  }
}

async function deleteFile({ projectId, projectPath }) {
  const resolved = await ProjectWorkspaceManager.resolveProjectPath({
    projectId,
    projectPath,
  })
  try {
    await fs.rm(resolved.absolutePath, { force: false })
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
  }
}

async function walk(root, relativeDir, files) {
  let entries
  try {
    entries = await fs.readdir(path.join(root, `.${relativeDir}`), {
      withFileTypes: true,
    })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return
    }
    throw err
  }

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.superpaper') {
      continue
    }
    const projectPath = path.posix.join(relativeDir, entry.name)
    const absolutePath = path.join(root, `.${projectPath}`)
    if (entry.isDirectory()) {
      await walk(root, projectPath, files)
    } else if (entry.isFile()) {
      const stat = await fs.stat(absolutePath)
      files.push({
        projectPath,
        absolutePath,
        bytes: stat.size,
        type: isTextProjectPath(projectPath) ? 'doc' : 'file',
      })
    }
  }
}

function assertTextPath(projectPath) {
  if (!isTextProjectPath(projectPath)) {
    throw new ProjectFileStoreError(
      'PROJECT_FILE_NOT_TEXT',
      'Project path is not an editable text document'
    )
  }
}

function isTextProjectPath(projectPath) {
  return TEXT_EXTENSIONS.has(path.posix.extname(projectPath).toLowerCase())
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export default {
  readTextFile,
  writeTextFile,
  listFiles,
  renameFile,
  deleteFile,
}
