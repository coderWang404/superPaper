import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listToolDefinitions } from './AiAgentToolRegistry.mjs'

const KNOWN_TOOL_NAMES = new Set(listToolDefinitions().map(tool => tool.name))
const MANIFEST_CANDIDATES = [
  {
    format: 'superpaper',
    path: '.superpaper-plugin/plugin.json',
  },
  {
    format: 'codex',
    path: '.codex-plugin/plugin.json',
  },
  {
    format: 'claude',
    path: '.claude-plugin/plugin.json',
  },
]
const MAX_PLUGIN_MANIFEST_BYTES = 32 * 1024
const MAX_SKILL_MARKDOWN_BYTES = 64 * 1024
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024
const MAX_PACKAGE_FILES = 300
const MAX_SKILLS_PER_PLUGIN = 100
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

const BLOCKED_MANIFEST_KEYS = new Set(
  [
    'agent',
    'agents',
    'app',
    'apps',
    'bin',
    'browser',
    'command',
    'commands',
    'connector',
    'connectors',
    'exec',
    'executable',
    'hook',
    'hooks',
    'lsp',
    'lspServer',
    'lspServers',
    'mcp',
    'mcpServer',
    'mcpServers',
    'monitor',
    'monitors',
    'script',
    'scripts',
    'shell',
    'subprocess',
  ].map(normalizeManifestKey)
)

const BLOCKED_PACKAGE_PATH_PARTS = new Set([
  '.app.json',
  '.mcp.json',
  'bin',
  'commands',
  'hooks',
  'mcp',
  'scripts',
])

export class AgentPluginPackageValidationError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'AgentPluginPackageValidationError'
    this.details = details
  }
}

export async function previewPluginPackageFromDirectory({ directory }) {
  const root = await resolveDirectoryRoot(directory)
  const files = await collectPackageFiles(root)
  const { manifest, manifestFormat, manifestPath } = await readManifest({
    root,
    files,
  })
  assertManifestSafe(manifest)
  assertPackagePathsSafe(files)

  const plugin = normalizePluginManifest({
    manifest,
    manifestFormat,
    manifestPath,
  })
  const skillsRoot = resolveSkillsRoot({ manifest, root })
  const skills = await readSkills({ root, plugin, skillsRoot, files })
  const integrity = await hashPackageFiles({ root, files })

  return {
    plugin,
    manifest,
    manifestFormat,
    manifestPath,
    skills,
    integrity,
    packageBytes: files.reduce((total, file) => total + file.size, 0),
    fileCount: files.length,
    warnings: [],
  }
}

async function resolveDirectoryRoot(directory) {
  if (!directory || typeof directory !== 'string') {
    throw new AgentPluginPackageValidationError('Plugin directory is required')
  }
  const root = path.resolve(directory)
  let stat
  try {
    stat = await fs.lstat(root)
  } catch {
    throw new AgentPluginPackageValidationError('Plugin directory does not exist')
  }
  if (!stat.isDirectory()) {
    throw new AgentPluginPackageValidationError('Plugin package must be a directory')
  }
  return root
}

async function collectPackageFiles(root) {
  const files = []
  let packageBytes = 0

  async function walk(currentDirectory) {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name)
      const relativePath = normalizeRelativePath(path.relative(root, absolutePath))
      assertRelativePathSafe(relativePath)

      if (entry.isSymbolicLink()) {
        throw new AgentPluginPackageValidationError(
          `Plugin package must not contain symlinks: ${relativePath}`
        )
      }
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile()) {
        throw new AgentPluginPackageValidationError(
          `Plugin package contains unsupported file type: ${relativePath}`
        )
      }

      const stat = await fs.stat(absolutePath)
      packageBytes += stat.size
      if (packageBytes > MAX_PACKAGE_BYTES) {
        throw new AgentPluginPackageValidationError('Plugin package is too large')
      }
      files.push({
        relativePath,
        absolutePath,
        size: stat.size,
      })
      if (files.length > MAX_PACKAGE_FILES) {
        throw new AgentPluginPackageValidationError(
          'Plugin package contains too many files'
        )
      }
    }
  }

  await walk(root)
  if (files.length === 0) {
    throw new AgentPluginPackageValidationError('Plugin package is empty')
  }
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  )
}

async function readManifest({ root, files }) {
  const manifestFiles = MANIFEST_CANDIDATES.filter(candidate =>
    files.some(file => file.relativePath === candidate.path)
  )
  if (manifestFiles.length === 0) {
    throw new AgentPluginPackageValidationError(
      'Plugin package must contain .superpaper-plugin/plugin.json, .codex-plugin/plugin.json, or .claude-plugin/plugin.json'
    )
  }
  if (manifestFiles.length > 1) {
    throw new AgentPluginPackageValidationError(
      'Plugin package must contain exactly one plugin manifest'
    )
  }

  const [{ format, path: manifestPath }] = manifestFiles
  const absoluteManifestPath = path.join(root, manifestPath)
  const manifestText = await readTextFileLimited({
    absolutePath: absoluteManifestPath,
    maxBytes: MAX_PLUGIN_MANIFEST_BYTES,
    label: 'Plugin manifest',
  })
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch {
    throw new AgentPluginPackageValidationError(
      'Plugin manifest must be valid JSON'
    )
  }
  if (!isPlainObject(manifest)) {
    throw new AgentPluginPackageValidationError(
      'Plugin manifest must be a JSON object'
    )
  }
  return { manifest, manifestFormat: format, manifestPath }
}

function normalizePluginManifest({ manifest, manifestFormat, manifestPath }) {
  const name = validateSafeId(manifest.name, 'Plugin name')
  const version = validateVersion(manifest.version || '1.0.0')
  const interfaceMetadata = isPlainObject(manifest.interface)
    ? manifest.interface
    : {}
  const displayName =
    stringOrNull(interfaceMetadata.displayName) ||
    stringOrNull(manifest.displayName) ||
    name
  const description =
    stringOrNull(manifest.description) ||
    stringOrNull(interfaceMetadata.shortDescription) ||
    stringOrNull(interfaceMetadata.longDescription) ||
    ''

  return {
    id: name,
    name,
    version,
    displayName,
    description,
    manifestFormat,
    manifestPath,
    keywords: normalizeStringArray(manifest.keywords, 40, 80),
  }
}

function resolveSkillsRoot({ manifest, root }) {
  const skillsPath = typeof manifest.skills === 'string' ? manifest.skills : 'skills'
  const normalizedPath = normalizeRelativePath(skillsPath)
  assertRelativePathSafe(normalizedPath)
  return path.join(root, normalizedPath)
}

async function readSkills({ root, plugin, skillsRoot, files }) {
  const skillsRootRelative = normalizeRelativePath(path.relative(root, skillsRoot))
  const skillMarkdownFiles = files.filter(file => {
    const relativePath = file.relativePath
    return (
      relativePath.startsWith(`${skillsRootRelative}/`) &&
      relativePath.endsWith('/SKILL.md')
    )
  })
  if (skillMarkdownFiles.length === 0) {
    throw new AgentPluginPackageValidationError(
      'Plugin package must contain at least one skills/<skill-id>/SKILL.md file'
    )
  }
  if (skillMarkdownFiles.length > MAX_SKILLS_PER_PLUGIN) {
    throw new AgentPluginPackageValidationError(
      'Plugin package contains too many skills'
    )
  }

  const skills = []
  for (const skillFile of skillMarkdownFiles) {
    const skillMarkdown = await readTextFileLimited({
      absolutePath: skillFile.absolutePath,
      maxBytes: MAX_SKILL_MARKDOWN_BYTES,
      label: 'Skill markdown',
    })
    const skill = parseSkillMarkdown({
      markdown: skillMarkdown,
      relativePath: skillFile.relativePath,
      plugin,
    })
    skills.push(skill)
  }
  return skills.sort((left, right) => left.id.localeCompare(right.id))
}

function parseSkillMarkdown({ markdown, relativePath, plugin }) {
  const match = markdown.match(FRONTMATTER_PATTERN)
  if (!match) {
    throw new AgentPluginPackageValidationError(
      `Skill markdown must contain YAML frontmatter: ${relativePath}`
    )
  }
  const frontmatter = parseFrontmatter(match[1], relativePath)
  const content = match[2].trim()
  if (!content) {
    throw new AgentPluginPackageValidationError(
      `Skill markdown must contain instructions: ${relativePath}`
    )
  }

  const localName = validateSafeId(frontmatter.name, 'Skill name')
  const description = requireString(frontmatter.description, 'Skill description')
  const requiredTools = normalizeStringArray(frontmatter.requiredTools, 20, 120)
  for (const toolName of requiredTools) {
    if (!KNOWN_TOOL_NAMES.has(toolName)) {
      throw new AgentPluginPackageValidationError(
        `Unknown agent tool required by skill ${localName}: ${toolName}`
      )
    }
  }

  const displayName = stringOrNull(frontmatter.displayName) || localName
  const keywords = [
    ...plugin.keywords,
    ...normalizeStringArray(frontmatter.keywords, 40, 80),
  ].slice(0, 40)

  return {
    id: `${plugin.id}/${localName}`,
    name: localName,
    pluginId: plugin.id,
    displayName,
    description,
    modelInvocable: frontmatter.modelInvocable !== false,
    requiredTools,
    keywords,
    content,
    sourcePath: relativePath,
  }
}

function parseFrontmatter(text, relativePath) {
  const result = {}
  let currentArrayKey = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const arrayItemMatch = line.match(/^-\s+(.+)$/)
    if (arrayItemMatch && currentArrayKey) {
      result[currentArrayKey].push(parseScalar(arrayItemMatch[1]))
      continue
    }
    const keyValueMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!keyValueMatch) {
      throw new AgentPluginPackageValidationError(
        `Unsupported skill frontmatter syntax in ${relativePath}: ${line}`
      )
    }
    const [, key, rawValue] = keyValueMatch
    if (rawValue === '') {
      result[key] = []
      currentArrayKey = key
      continue
    }
    result[key] = parseScalar(rawValue)
    currentArrayKey = null
  }
  return result
}

function parseScalar(rawValue) {
  const value = rawValue.trim()
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    return inner ? inner.split(',').map(item => parseScalar(item)) : []
  }
  return stripQuotes(value)
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function assertManifestSafe(manifest) {
  assertObjectValueHasNoBlockedKeys(manifest)
}

function assertObjectValueHasNoBlockedKeys(value, currentPath = []) {
  if (!value || typeof value !== 'object') {
    return
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertObjectValueHasNoBlockedKeys(item, [...currentPath, String(index)])
    }
    return
  }
  for (const [key, childValue] of Object.entries(value)) {
    if (BLOCKED_MANIFEST_KEYS.has(normalizeManifestKey(key))) {
      throw new AgentPluginPackageValidationError(
        `Agent plugin manifest contains executable capability: ${[
          ...currentPath,
          key,
        ].join('.')}`
      )
    }
    assertObjectValueHasNoBlockedKeys(childValue, [...currentPath, key])
  }
}

function assertPackagePathsSafe(files) {
  for (const file of files) {
    const pathParts = file.relativePath.split('/')
    if (pathParts.some(part => BLOCKED_PACKAGE_PATH_PARTS.has(part))) {
      throw new AgentPluginPackageValidationError(
        `Plugin package contains executable capability path: ${file.relativePath}`
      )
    }
  }
}

async function hashPackageFiles({ root, files }) {
  const hash = crypto.createHash('sha256')
  for (const file of files) {
    hash.update(file.relativePath)
    hash.update('\0')
    hash.update(await fs.readFile(path.join(root, file.relativePath)))
    hash.update('\0')
  }
  return {
    sha256: hash.digest('hex'),
  }
}

async function readTextFileLimited({ absolutePath, maxBytes, label }) {
  const stat = await fs.stat(absolutePath)
  if (stat.size > maxBytes) {
    throw new AgentPluginPackageValidationError(`${label} is too large`)
  }
  return fs.readFile(absolutePath, 'utf8')
}

function normalizeRelativePath(input) {
  return String(input || '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
}

function assertRelativePathSafe(relativePath) {
  if (!relativePath || relativePath.startsWith('/') || path.isAbsolute(relativePath)) {
    throw new AgentPluginPackageValidationError(
      `Plugin package path is not relative: ${relativePath}`
    )
  }
  const parts = relativePath.split('/')
  if (parts.some(part => part === '..' || part === '')) {
    throw new AgentPluginPackageValidationError(
      `Plugin package path is unsafe: ${relativePath}`
    )
  }
  if (relativePath !== path.posix.normalize(relativePath)) {
    throw new AgentPluginPackageValidationError(
      `Plugin package path is not normalized: ${relativePath}`
    )
  }
}

function validateSafeId(value, label) {
  const text = requireString(value, label)
  if (!SAFE_ID_PATTERN.test(text)) {
    throw new AgentPluginPackageValidationError(
      `${label} must be lower-case kebab-case`
    )
  }
  return text
}

function validateVersion(value) {
  const version = requireString(value, 'Plugin version')
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,79}$/.test(version)) {
    throw new AgentPluginPackageValidationError('Plugin version is invalid')
  }
  return version
}

function requireString(value, label) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    throw new AgentPluginPackageValidationError(`${label} is required`)
  }
  return text
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map(item => item.slice(0, maxLength))
}

function normalizeManifestKey(key) {
  return String(key).toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
