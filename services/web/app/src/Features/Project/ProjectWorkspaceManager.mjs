import path from 'node:path'
import fs from 'node:fs/promises'
import Settings from '@superpaper/settings'

const INTERNAL_PREFIXES = ['/.git', '/.superpaper']
const SENSITIVE_PATH_PATTERNS = [
  /^\/\.env(?:\.|$)/i,
  /^\/secrets(?:\/|$)/i,
  /^\/credentials\./i,
  /^\/渠道\.txt$/i,
  /\.pem$/i,
  /\.key$/i,
]

export class ProjectWorkspaceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProjectWorkspaceError'
    this.code = code
  }
}

function getConfiguredWorkspaceRoot() {
  const root = Settings.projectWorkspaceRoot
  if (!root) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_ROOT_NOT_CONFIGURED',
      'Project workspace root is not configured'
    )
  }
  return path.resolve(root)
}

function getWorkspaceRoot(projectId) {
  const safeProjectId = String(projectId)
  if (!/^[a-zA-Z0-9_-]+$/.test(safeProjectId)) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PROJECT_ID',
      'Project id is not safe for workspace paths'
    )
  }
  return path.join(getConfiguredWorkspaceRoot(), safeProjectId, 'workspace')
}

function normalizeProjectPath(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PATH',
      'Project path is required'
    )
  }
  if (/^[a-zA-Z]:[\\/]/.test(projectPath)) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PATH',
      'Project path must be project-relative'
    )
  }

  const rawProjectPath = projectPath.trim().replaceAll('\\', '/')
  if (rawProjectPath.split('/').includes('..')) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_PATH_ESCAPE',
      'Project path escapes the workspace'
    )
  }
  const normalized = path.posix.normalize(`/${rawProjectPath}`)
  if (normalized === '/') {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INVALID_PATH',
      'Project path is required'
    )
  }
  if (
    INTERNAL_PREFIXES.some(
      prefix => normalized === prefix || normalized.startsWith(`${prefix}/`)
    )
  ) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_INTERNAL_PATH',
      'Project path is internal'
    )
  }
  if (SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(normalized))) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_SENSITIVE_PATH',
      'Project path is sensitive'
    )
  }
  return normalized
}

async function resolveProjectPath({ projectId, projectPath }) {
  const normalizedProjectPath = normalizeProjectPath(projectPath)
  const workspaceRoot = getWorkspaceRoot(projectId)
  const absolutePath = path.resolve(workspaceRoot, `.${normalizedProjectPath}`)
  assertContainedPath(workspaceRoot, absolutePath)
  await assertNoSymlinkEscape(workspaceRoot, absolutePath)
  return {
    workspaceRoot,
    projectPath: normalizedProjectPath,
    absolutePath,
  }
}

function assertContainedPath(workspaceRoot, absolutePath) {
  const relative = path.relative(workspaceRoot, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ProjectWorkspaceError(
      'PROJECT_WORKSPACE_PATH_ESCAPE',
      'Project path escapes the workspace'
    )
  }
}

async function assertNoSymlinkEscape(workspaceRoot, absolutePath) {
  const root = path.resolve(workspaceRoot)
  const candidates = []
  let cursor = path.dirname(absolutePath)
  while (cursor.startsWith(root) && cursor !== root) {
    candidates.push(cursor)
    cursor = path.dirname(cursor)
  }

  for (const candidate of candidates.reverse()) {
    try {
      const stat = await fs.lstat(candidate)
      if (stat.isSymbolicLink()) {
        const real = await fs.realpath(candidate)
        assertContainedPath(root, real)
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err
      }
    }
  }
}

export default {
  getWorkspaceRoot,
  normalizeProjectPath,
  resolveProjectPath,
}
