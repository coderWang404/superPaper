import crypto from 'node:crypto'
import path from 'node:path'
import { fetchStream } from '@superpaper/fetch-utils'

const MAX_SKILL_BYTES = 32 * 1024
const SKILL_FETCH_TIMEOUT_MS = 20_000
const GITHUB_HOST = 'github.com'
const GITHUB_RAW_HOST = 'raw.githubusercontent.com'

export class AgentSkillImportValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AgentSkillImportValidationError'
  }
}

export async function previewAgentSkillImport(source = {}) {
  const normalized = normalizeSkillSource(source)
  const content = await fetchSkillMarkdown(normalized.fetchUrl)
  const metadata = parseSkillMetadata(content)
  return {
    source: normalized.publicSource,
    content,
    metadata,
    bytes: Buffer.byteLength(content, 'utf8'),
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  }
}

function normalizeSkillSource(source) {
  if (source.sourceType === 'github_file') {
    return normalizeGitHubSkillUrl(source.url)
  }
  if (source.sourceType === 'url') {
    return normalizeRawSkillUrl(source.url)
  }
  throw new AgentSkillImportValidationError('Unsupported skill source type')
}

function normalizeRawSkillUrl(value) {
  const parsedUrl = parseHttpsUrl(value, 'Skill URL is invalid')
  if (parsedUrl.hostname !== GITHUB_RAW_HOST) {
    throw new AgentSkillImportValidationError(
      'Skill URL must use raw.githubusercontent.com or a GitHub SKILL.md link'
    )
  }
  assertSkillMarkdownPath(parsedUrl.pathname)
  return {
    fetchUrl: parsedUrl.toString(),
    publicSource: {
      type: 'url',
      url: parsedUrl.toString(),
    },
  }
}

function normalizeGitHubSkillUrl(value) {
  const parsedUrl = parseHttpsUrl(value, 'GitHub skill URL is invalid')
  if (parsedUrl.hostname !== GITHUB_HOST) {
    throw new AgentSkillImportValidationError(
      'GitHub skill URL must use https://github.com'
    )
  }

  const parts = parsedUrl.pathname.split('/').filter(Boolean)
  const [owner, repo, marker, ref, ...rest] = parts
  if (!owner || !repo || !['blob', 'raw', 'tree'].includes(marker) || !ref) {
    throw new AgentSkillImportValidationError(
      'GitHub skill URL must point to a SKILL.md file or skill folder'
    )
  }

  let skillPath = rest.join('/')
  if (marker === 'tree') {
    skillPath = path.posix.join(skillPath, 'SKILL.md')
  }
  assertSkillMarkdownPath(`/${skillPath}`)

  const rawUrl = new URL(
    [
      '',
      encodeURIComponent(owner),
      encodeURIComponent(repo),
      encodeURIComponent(ref),
      ...skillPath.split('/').map(segment => encodeURIComponent(segment)),
    ].join('/'),
    'https://raw.githubusercontent.com'
  )

  return {
    fetchUrl: rawUrl.toString(),
    publicSource: {
      type: 'github_file',
      url: parsedUrl.toString(),
      rawUrl: rawUrl.toString(),
      ref,
      path: skillPath,
    },
  }
}

async function fetchSkillMarkdown(url) {
  const abortController = new AbortController()
  const timeout = setTimeout(() => {
    abortController.abort(new Error('SKILL.md download timed out'))
  }, SKILL_FETCH_TIMEOUT_MS)
  try {
    const stream = await fetchStream(url, { signal: abortController.signal })
    const chunks = []
    let bytes = 0
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > MAX_SKILL_BYTES) {
        throw new AgentSkillImportValidationError('SKILL.md is too large')
      }
      chunks.push(buffer)
    }

    const content = Buffer.concat(chunks).toString('utf8')
    if (!content.trim()) {
      throw new AgentSkillImportValidationError('SKILL.md is empty')
    }
    return content
  } catch (err) {
    if (abortController.signal.aborted) {
      throw new AgentSkillImportValidationError('SKILL.md download timed out')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function parseHttpsUrl(value, message) {
  let parsedUrl
  try {
    parsedUrl = new URL(String(value || '').trim())
  } catch {
    throw new AgentSkillImportValidationError(message)
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new AgentSkillImportValidationError('Skill URL must use HTTPS')
  }
  return parsedUrl
}

function assertSkillMarkdownPath(pathname) {
  if (!pathname || !pathname.toLowerCase().endsWith('/skill.md')) {
    throw new AgentSkillImportValidationError(
      'Skill URL must point to SKILL.md'
    )
  }
}

function parseSkillMetadata(content) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  if (!frontmatter) {
    return {}
  }
  return {
    name: yamlStringValue(frontmatter[1], 'name'),
    description: yamlStringValue(frontmatter[1], 'description'),
    displayName: yamlStringValue(frontmatter[1], 'displayName'),
  }
}

function yamlStringValue(yaml, key) {
  const match = yaml.match(
    new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.+?))\\s*$`, 'm')
  )
  return (match?.[1] || match?.[2] || match?.[3] || '').trim()
}
