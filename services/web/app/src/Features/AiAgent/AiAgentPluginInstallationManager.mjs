import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fetchStream } from '@superpaper/fetch-utils'
import Settings from '@superpaper/settings'
import { promisify } from '@superpaper/promise-utils'
import ArchiveManager from '../Uploads/ArchiveManager.mjs'
import { AgentPluginInstallation } from '../../models/AgentPluginInstallation.mjs'
import { AgentPluginSetting } from '../../models/AgentPluginSetting.mjs'
import { AgentSkillSetting } from '../../models/AgentSkillSetting.mjs'
import { ObjectId } from '../../infrastructure/mongodb.mjs'
import {
  AgentPluginPackageValidationError,
  previewPluginPackageFromDirectory,
} from './AiAgentPluginPackageManager.mjs'

const extractZipArchive = promisify(ArchiveManager.extractZipArchive)
const findTopLevelDirectory = promisify(ArchiveManager.findTopLevelDirectory)
const MAX_PLUGIN_ZIP_BYTES = 20 * 1024 * 1024
const CACHE_ROOT = path.resolve(Settings.path.uploadFolder, '../agent-plugins')

export class AgentPluginInstallationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AgentPluginInstallationError'
    this.code = code
  }
}

export async function previewAgentPluginPackage(source) {
  const prepared = await preparePluginSource(source)
  try {
    const preview = await previewPluginPackageFromDirectory({
      directory: prepared.directory,
    })
    return publicPreview({
      ...preview,
      source: publicSource(prepared.source),
    })
  } finally {
    await prepared.cleanup?.()
  }
}

export async function installAgentPluginPackage({
  source,
  scope = 'global',
  projectId = null,
  userId = null,
  enabled = true,
}) {
  const normalizedScope = normalizeScope(scope)
  const normalizedProjectId = normalizedScope === 'project' ? projectId : null
  const prepared = await preparePluginSource(source)
  try {
    const preview = await previewPluginPackageFromDirectory({
      directory: prepared.directory,
    })
    const cachePath = await copyPackageToCache({
      sourceDirectory: prepared.directory,
      plugin: preview.plugin,
      integrity: preview.integrity,
    })
    const installation = await upsertInstallation({
      scope: normalizedScope,
      projectId: normalizedProjectId,
      userId,
      enabled,
      preview,
      source: prepared.source,
      cachePath,
    })
    await upsertPluginSetting({
      scope: normalizedScope,
      projectId: normalizedProjectId,
      userId,
      enabled,
      preview,
    })
    await upsertSkillSettings({
      scope: normalizedScope,
      projectId: normalizedProjectId,
      userId,
      enabled,
      pluginId: preview.plugin.id,
      skills: preview.skills,
    })
    return publicInstallation(installation)
  } finally {
    await prepared.cleanup?.()
  }
}

export async function listInstalledAgentPlugins({
  scope = 'global',
  projectId = null,
} = {}) {
  const normalizedScope = normalizeScope(scope)
  const query = {
    scope: normalizedScope,
    projectId: normalizedScope === 'project' ? projectId : null,
  }
  const installations = await AgentPluginInstallation.find(query)
    .sort({ name: 1, version: 1 })
    .exec()
  return installations.map(publicInstallation)
}

export async function setInstalledAgentPluginEnabled({
  pluginId,
  enabled,
  scope = 'global',
  projectId = null,
  userId = null,
}) {
  const normalizedScope = normalizeScope(scope)
  const normalizedProjectId = normalizedScope === 'project' ? projectId : null
  const installation = await AgentPluginInstallation.findOneAndUpdate(
    {
      scope: normalizedScope,
      projectId: normalizedProjectId,
      pluginId,
    },
    {
      $set: {
        enabled,
        status: enabled ? 'installed' : 'disabled',
        updatedBy: userId,
      },
    },
    { new: true, sort: { updatedAt: -1 } }
  ).exec()
  if (!installation) {
    throw new AgentPluginInstallationError(
      'AGENT_PLUGIN_NOT_FOUND',
      'Agent plugin installation not found'
    )
  }
  await Promise.all([
    AgentPluginSetting.updateOne(
      { scope: normalizedScope, projectId: normalizedProjectId, pluginId },
      { $set: { enabled, updatedBy: userId } }
    ).exec(),
    AgentSkillSetting.updateMany(
      { scope: normalizedScope, projectId: normalizedProjectId, pluginId },
      { $set: { enabled, updatedBy: userId } }
    ).exec(),
  ])
  return publicInstallation(installation)
}

async function preparePluginSource(source = {}) {
  if (source.sourceType === 'local_directory') {
    return {
      directory: source.path,
      source: {
        type: 'local_directory',
        path: source.path,
      },
    }
  }
  if (source.sourceType === 'zip_url') {
    return prepareZipUrlSource(source.url)
  }
  throw new AgentPluginPackageValidationError(
    'Unsupported agent plugin source type'
  )
}

async function prepareZipUrlSource(url) {
  const parsedUrl = parsePluginUrl(url)
  const tempRoot = await fs.mkdtemp(
    path.join(Settings.path.uploadFolder, 'agent-plugin-')
  )
  const zipPath = path.join(tempRoot, 'plugin.zip')
  const extractPath = path.join(tempRoot, 'contents')
  try {
    const stream = await fetchStream(parsedUrl.toString())
    await writeLimitedStreamToFile({
      stream,
      destination: zipPath,
      maxBytes: MAX_PLUGIN_ZIP_BYTES,
    })
    await extractZipArchive(zipPath, extractPath)
    const topLevelDirectory = await findTopLevelDirectory(extractPath)
    return {
      directory: topLevelDirectory,
      source: {
        type: 'zip_url',
        url: parsedUrl.toString(),
      },
      cleanup: () => fs.rm(tempRoot, { recursive: true, force: true }),
    }
  } catch (err) {
    await fs.rm(tempRoot, { recursive: true, force: true })
    throw err
  }
}

function parsePluginUrl(url) {
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new AgentPluginPackageValidationError('Plugin zip URL is invalid')
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new AgentPluginPackageValidationError(
      'Plugin zip URL must use HTTPS'
    )
  }
  return parsedUrl
}

async function writeLimitedStreamToFile({ stream, destination, maxBytes }) {
  await fs.mkdir(path.dirname(destination), { recursive: true })
  const fileHandle = await fs.open(destination, 'w')
  let bytes = 0
  try {
    for await (const chunk of stream) {
      bytes += chunk.length
      if (bytes > maxBytes) {
        throw new AgentPluginPackageValidationError(
          'Plugin zip archive is too large'
        )
      }
      await fileHandle.write(chunk)
    }
  } finally {
    await fileHandle.close()
  }
}

async function copyPackageToCache({ sourceDirectory, plugin, integrity }) {
  const cachePath = path.join(
    CACHE_ROOT,
    plugin.id,
    plugin.version,
    integrity.sha256
  )
  await fs.rm(cachePath, { recursive: true, force: true })
  await fs.mkdir(path.dirname(cachePath), { recursive: true })
  await fs.cp(sourceDirectory, cachePath, {
    recursive: true,
    errorOnExist: true,
    force: false,
  })
  return cachePath
}

async function upsertInstallation({
  scope,
  projectId,
  userId,
  enabled,
  preview,
  source,
  cachePath,
}) {
  const plugin = preview.plugin
  const update = {
    name: plugin.name,
    version: plugin.version,
    displayName: plugin.displayName,
    description: plugin.description,
    enabled,
    status: enabled ? 'installed' : 'disabled',
    manifest: preview.manifest,
    manifestFormat: preview.manifestFormat,
    manifestPath: preview.manifestPath,
    source: publicSource(source),
    integrity: preview.integrity,
    cachePath,
    packageBytes: preview.packageBytes,
    fileCount: preview.fileCount,
    skillIds: preview.skills.map(skill => skill.id),
    warnings: preview.warnings,
    updatedBy: userId,
  }
  return AgentPluginInstallation.findOneAndUpdate(
    { scope, projectId, pluginId: plugin.id, version: plugin.version },
    {
      $set: update,
      $setOnInsert: {
        scope,
        projectId,
        pluginId: plugin.id,
        installedBy: userId,
      },
    },
    { upsert: true, new: true }
  ).exec()
}

async function upsertPluginSetting({ scope, projectId, userId, enabled, preview }) {
  const plugin = preview.plugin
  return AgentPluginSetting.updateOne(
    { scope, projectId, pluginId: plugin.id },
    {
      $set: {
        enabled,
        name: plugin.name,
        version: plugin.version,
        displayName: plugin.displayName,
        description: plugin.description,
        manifest: preview.manifest,
        skills: preview.skills.map(skill => skill.id),
        toolPresets: [],
        updatedBy: userId,
      },
      $setOnInsert: {
        scope,
        projectId,
        pluginId: plugin.id,
        createdBy: userId,
      },
    },
    { upsert: true }
  ).exec()
}

async function upsertSkillSettings({
  scope,
  projectId,
  userId,
  enabled,
  pluginId,
  skills,
}) {
  await Promise.all(
    skills.map(skill =>
      AgentSkillSetting.updateOne(
        { scope, projectId, skillId: skill.id },
        {
          $set: {
            enabled,
            displayName: skill.displayName,
            description: skill.description,
            modelInvocable: skill.modelInvocable,
            requiredTools: skill.requiredTools,
            keywords: skill.keywords,
            content: skill.content,
            pluginId,
            updatedBy: userId,
          },
          $setOnInsert: {
            scope,
            projectId,
            skillId: skill.id,
            createdBy: userId,
          },
        },
        { upsert: true }
      ).exec()
    )
  )
}

function publicPreview(preview) {
  return {
    plugin: preview.plugin,
    manifest: preview.manifest,
    manifestFormat: preview.manifestFormat,
    manifestPath: preview.manifestPath,
    source: preview.source,
    skills: preview.skills.map(publicPreviewSkill),
    integrity: preview.integrity,
    packageBytes: preview.packageBytes,
    fileCount: preview.fileCount,
    warnings: preview.warnings,
  }
}

function publicPreviewSkill(skill) {
  return {
    id: skill.id,
    name: skill.name,
    pluginId: skill.pluginId,
    displayName: skill.displayName,
    description: skill.description,
    modelInvocable: skill.modelInvocable,
    requiredTools: skill.requiredTools,
    keywords: skill.keywords,
    contentBytes: Buffer.byteLength(skill.content || '', 'utf8'),
    sourcePath: skill.sourcePath,
  }
}

function publicInstallation(installation) {
  const doc = toPlainObject(installation)
  return {
    id: doc._id?.toString?.() || doc.id || `${doc.pluginId}:${doc.version}`,
    scope: doc.scope,
    projectId: doc.projectId?.toString?.() || doc.projectId || null,
    pluginId: doc.pluginId,
    name: doc.name,
    version: doc.version,
    displayName: doc.displayName,
    description: doc.description,
    enabled: doc.enabled !== false,
    status: doc.status,
    manifestFormat: doc.manifestFormat,
    manifestPath: doc.manifestPath,
    source: publicSource(doc.source),
    integrity: doc.integrity || {},
    packageBytes: doc.packageBytes || 0,
    fileCount: doc.fileCount || 0,
    skillIds: Array.isArray(doc.skillIds) ? doc.skillIds : [],
    warnings: Array.isArray(doc.warnings) ? doc.warnings : [],
    installedBy: doc.installedBy?.toString?.() || doc.installedBy || null,
    updatedBy: doc.updatedBy?.toString?.() || doc.updatedBy || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  }
}

function publicSource(source = {}) {
  if (source.type === 'local_directory') {
    return {
      type: 'local_directory',
      pathHash: source.pathHash || hashSourcePath(source.path),
    }
  }
  if (source.type === 'zip_url') {
    return {
      type: 'zip_url',
      url: source.url,
    }
  }
  return {}
}

function hashSourcePath(sourcePath) {
  if (!sourcePath) {
    return null
  }
  return cryptoSha256(String(sourcePath))
}

function cryptoSha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function normalizeScope(scope) {
  return scope === 'project' ? 'project' : 'global'
}

function toPlainObject(document) {
  return typeof document?.toObject === 'function' ? document.toObject() : document
}

function isObjectIdLike(value) {
  return typeof value === 'string' && ObjectId.isValid(value)
}

export function normalizePluginInstallSource(source = {}) {
  if (source.sourceType === 'local_directory') {
    return {
      sourceType: 'local_directory',
      path: source.path,
    }
  }
  if (source.sourceType === 'zip_url') {
    return {
      sourceType: 'zip_url',
      url: source.url,
    }
  }
  return source
}

export function summarizePluginInstallation(installation) {
  return {
    pluginId: installation.pluginId,
    name: installation.name,
    version: installation.version,
    enabled: installation.enabled,
    status: installation.status,
    skillCount: installation.skillIds?.length || 0,
    sourceType: installation.source?.type || null,
    integrity: installation.integrity?.sha256 || null,
  }
}

export function assertProjectScopeHasProjectId(scope, projectId) {
  if (scope === 'project' && !isObjectIdLike(String(projectId || ''))) {
    throw new AgentPluginInstallationError(
      'AGENT_PLUGIN_PROJECT_REQUIRED',
      'Project scoped agent plugin installation requires a project id'
    )
  }
}
