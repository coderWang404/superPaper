import path from 'node:path'
import crypto from 'node:crypto'
import ProjectEntityHandler from '../Project/ProjectEntityHandler.mjs'

const DEFAULT_MAX_BYTES = 32 * 1024
const INSTRUCTION_FILENAMES = ['AGENTS.md', 'SUPERPAPER_AGENTS.md']

export async function loadAgentInstructions({
  projectId,
  currentPath,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const candidates = instructionCandidatePaths(currentPath)
  const sources = []
  let remaining = maxBytes
  let truncated = false

  for (const candidatePath of candidates) {
    const doc = docs[candidatePath]
    if (!doc) {
      continue
    }
    const content = getDocText(doc).trim()
    if (!content) {
      continue
    }
    const bytes = Buffer.byteLength(content, 'utf8')
    const sourceTruncated = bytes > remaining
    const includedContent =
      sourceTruncated ? trimToByteBudget(content, remaining) : content

    sources.push({
      type: 'project-file',
      path: candidatePath,
      sha256: sha256(content),
      bytes: Buffer.byteLength(includedContent, 'utf8'),
      content: includedContent,
    })
    remaining -= Buffer.byteLength(includedContent, 'utf8')
    if (sourceTruncated) {
      truncated = true
      break
    }
    if (remaining <= 0) {
      truncated = true
      break
    }
  }

  return {
    sources,
    truncated,
  }
}

export function instructionCandidatePaths(currentPath) {
  const directories = ['/']
  const normalizedCurrentPath = currentPath ? normalizeProjectPath(currentPath) : null
  if (normalizedCurrentPath) {
    const dirname = path.posix.dirname(normalizedCurrentPath)
    const parts = dirname.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      directories.push(current)
    }
  }

  const paths = []
  for (const directory of directories) {
    for (const filename of INSTRUCTION_FILENAMES) {
      paths.push(path.posix.join(directory, filename))
    }
  }
  return [...new Set(paths)]
}

function normalizeProjectPath(projectPath) {
  return path.posix.normalize(`/${projectPath}`.replaceAll('\\', '/'))
}

function getDocText(doc) {
  return Array.isArray(doc.lines) ? doc.lines.join('\n') : ''
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function trimToByteBudget(content, maxBytes) {
  if (maxBytes <= 0) {
    return ''
  }
  let output = ''
  let bytes = 0
  for (const char of content) {
    const charBytes = Buffer.byteLength(char, 'utf8')
    if (bytes + charBytes > maxBytes) {
      return output
    }
    output += char
    bytes += charBytes
  }
  return output
}
