import crypto from 'node:crypto'
import { AgentInstructionProfile } from '../../models/AgentInstructionProfile.mjs'
import { AgentPluginSetting } from '../../models/AgentPluginSetting.mjs'
import { AgentSkillSetting } from '../../models/AgentSkillSetting.mjs'
import { listBuiltinPluginDefinitions } from './AiAgentPluginManager.mjs'
import {
  listBuiltinSkillDefinitions,
  selectSkillsForTask,
} from './AiAgentSkillManager.mjs'
import {
  getDefaultPermissionProfile,
  listToolPolicyDefinitions,
} from './AiAgentPermissionManager.mjs'
import { listToolDefinitions } from './AiAgentToolRegistry.mjs'

const KNOWN_TOOL_NAMES = new Set(listToolDefinitions().map(tool => tool.name))
const MAX_PLUGIN_MANIFEST_BYTES = 32 * 1024
const BLOCKED_PLUGIN_MANIFEST_KEYS = new Set([
  'command',
  'commands',
  'exec',
  'executable',
  'hook',
  'hooks',
  'mcp',
  'mcpServer',
  'mcpServers',
  'script',
  'scripts',
  'shell',
  'subprocess',
].map(normalizePluginManifestKey))

export class AgentSettingsValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AgentSettingsValidationError'
  }
}

function normalizeScope(scope) {
  return scope === 'project' ? 'project' : 'global'
}

function publicSkillDefinition(skill, { includeContent = false } = {}) {
  const definition = {
    id: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    modelInvocable: skill.modelInvocable,
    requiredTools: skill.requiredTools,
    enabled: skill.enabled !== false,
    scope: skill.scope || 'builtin',
    pluginId: skill.pluginId || null,
  }
  if (includeContent) {
    definition.content = skill.content || ''
    definition.keywords = Array.isArray(skill.keywords) ? [...skill.keywords] : []
  }
  return definition
}

function publicPluginDefinition(plugin) {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    displayName: plugin.displayName || plugin.name,
    description: plugin.description,
    enabled: plugin.enabled !== false,
    skills: Array.isArray(plugin.skills) ? [...plugin.skills] : [],
    toolPresets: Array.isArray(plugin.toolPresets) ? [...plugin.toolPresets] : [],
    scope: plugin.scope || 'builtin',
  }
}

function publicInstructionProfile(profile, { includeContent = false } = {}) {
  const definition = {
    id: profile._id?.toString?.() || profile.id || profile.name,
    scope: profile.scope,
    projectId: profile.projectId?.toString?.() || profile.projectId || null,
    name: profile.name,
    enabled: profile.enabled !== false,
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || null,
  }
  if (includeContent) {
    const content = String(profile.content || '')
    definition.content = content
    definition.sha256 = profile.sha256 || profileContentHash(content)
    definition.bytes =
      typeof profile.bytes === 'number'
        ? profile.bytes
        : Buffer.byteLength(content, 'utf8')
  }
  return definition
}

function publicInstructionSource(profile) {
  return {
    type: 'instruction-profile',
    scope: profile.scope,
    path: profile.name,
    sha256: profile.sha256,
    bytes: profile.bytes,
    content: profile.content,
  }
}

export async function getAgentConfig({
  projectId,
  includeContent = false,
  includeAllInstructionProfiles = false,
} = {}) {
  const [skills, plugins, instructionProfiles] = await Promise.all([
    listEffectiveSkillCatalog({ projectId }),
    listEffectivePluginCatalog({ projectId }),
    includeAllInstructionProfiles
      ? listInstructionProfiles({ projectId, enabledOnly: false })
      : listEnabledInstructionProfiles({ projectId }),
  ])
  const effectiveSkills = applyPluginAvailabilityToSkills(skills, plugins)

  return {
    permissionProfile: getDefaultPermissionProfile(),
    tools: listToolDefinitions(),
    toolPolicies: listToolPolicyDefinitions(),
    skills: effectiveSkills.map(skill =>
      publicSkillDefinition(skill, { includeContent })
    ),
    plugins: plugins.map(publicPluginDefinition),
    enabledSkillIds: effectiveSkills
      .filter(skill => skill.enabled !== false)
      .map(skill => skill.id),
    enabledPluginIds: plugins
      .filter(plugin => plugin.enabled !== false)
      .map(plugin => plugin.id),
    instructionProfiles: instructionProfiles.map(profile =>
      publicInstructionProfile(profile, { includeContent })
    ),
  }
}

export async function listEnabledSkillDefinitions({ projectId } = {}) {
  const [skills, plugins] = await Promise.all([
    listEffectiveSkillCatalog({ projectId }),
    listEffectivePluginCatalog({ projectId }),
  ])
  return applyPluginAvailabilityToSkills(skills, plugins).filter(
    skill => skill.enabled !== false
  )
}

export async function getSelectedSkillsForTask(task, { projectId } = {}) {
  const availableSkills = await listEnabledSkillDefinitions({ projectId })
  return selectSkillsForTask(task, { availableSkills })
}

export async function listEnabledPluginDefinitions({ projectId } = {}) {
  const plugins = await listEffectivePluginCatalog({ projectId })
  return plugins.filter(plugin => plugin.enabled !== false)
}

export async function listEnabledInstructionProfiles({ projectId } = {}) {
  return listInstructionProfiles({ projectId, enabledOnly: true })
}

async function listInstructionProfiles({ projectId, enabledOnly = true } = {}) {
  const query = projectId
    ? { scope: 'project', projectId }
    : { scope: 'global' }
  if (enabledOnly) {
    query.enabled = true
  }
  const profiles = await AgentInstructionProfile.find(query)
    .sort({ scope: 1, name: 1 })
    .exec()
  return profiles.map(profile => {
    const content = String(profile.content || '')
    return {
      ...toPlainObject(profile),
      sha256: profileContentHash(content),
      bytes: Buffer.byteLength(content, 'utf8'),
      content,
    }
  })
}

export async function updateAgentSettings({
  scope,
  projectId = null,
  userId = null,
  skills = [],
  plugins = [],
  instructionProfiles = [],
  includeContent = false,
  includeAllInstructionProfiles = false,
}) {
  const normalizedScope = normalizeScope(scope)
  const normalizedProjectId = normalizedScope === 'project' ? projectId : null

  await Promise.all([
    ...skills.map(skill =>
      upsertSkillSetting({
        scope: normalizedScope,
        projectId: normalizedProjectId,
        userId,
        skill,
      })
    ),
    ...plugins.map(plugin =>
      upsertPluginSetting({
        scope: normalizedScope,
        projectId: normalizedProjectId,
        userId,
        plugin,
      })
    ),
    ...instructionProfiles.map(profile =>
      upsertInstructionProfile({
        scope: normalizedScope,
        projectId: normalizedProjectId,
        userId,
        profile,
      })
    ),
  ])

  return getAgentConfig({
    projectId: normalizedProjectId,
    includeContent,
    includeAllInstructionProfiles,
  })
}

async function listEffectiveSkillCatalog({ projectId } = {}) {
  const [builtinSkills, skillSettings] = await Promise.all([
    Promise.resolve(listBuiltinSkillDefinitions()),
    listSkillSettings(projectId),
  ])

  const settingsBySkillId = new Map()
  for (const setting of skillSettings) {
    const existing = settingsBySkillId.get(setting.skillId)
    if (!existing || scopeRank(setting.scope) >= scopeRank(existing.scope)) {
      settingsBySkillId.set(setting.skillId, setting)
    }
  }

  const mergedSkills = builtinSkills.map(skill => {
    const setting = settingsBySkillId.get(skill.id)
    if (!setting) {
      return {
        ...skill,
        enabled: skill.enabled !== false,
      }
    }

    return {
      ...skill,
      enabled: setting.enabled ?? skill.enabled,
      displayName: setting.displayName || skill.displayName,
      description: setting.description || skill.description,
      modelInvocable:
        typeof setting.modelInvocable === 'boolean'
          ? setting.modelInvocable
          : skill.modelInvocable,
      requiredTools:
        Array.isArray(setting.requiredTools) && setting.requiredTools.length > 0
          ? setting.requiredTools
          : skill.requiredTools,
      keywords:
        Array.isArray(setting.keywords) && setting.keywords.length > 0
          ? setting.keywords
          : skill.keywords,
      content: setting.content || skill.content,
      pluginId: setting.pluginId || skill.pluginId || null,
      scope: setting.scope,
    }
  })

  const builtinSkillIds = new Set(builtinSkills.map(skill => skill.id))
  const customSkills = [...settingsBySkillId.values()]
    .filter(setting => !builtinSkillIds.has(setting.skillId))
    .map(setting => ({
      id: setting.skillId,
      name: setting.skillId,
      displayName: setting.displayName || setting.skillId,
      description: setting.description || '',
      modelInvocable: setting.modelInvocable !== false,
      requiredTools: Array.isArray(setting.requiredTools)
        ? [...setting.requiredTools]
        : [],
      keywords: Array.isArray(setting.keywords) ? [...setting.keywords] : [],
      content: setting.content || '',
      pluginId: setting.pluginId || null,
      enabled: setting.enabled !== false,
      scope: setting.scope,
    }))

  return [...mergedSkills, ...customSkills]
}

async function upsertSkillSetting({ scope, projectId, userId, skill }) {
  assertRequiredToolsAllowed(skill.requiredTools)
  const update = {
    enabled: skill.enabled,
    updatedBy: userId,
  }
  for (const field of [
    'displayName',
    'description',
    'modelInvocable',
    'requiredTools',
    'keywords',
    'content',
    'pluginId',
  ]) {
    if (Object.hasOwn(skill, field)) {
      update[field] = skill[field]
    }
  }

  return AgentSkillSetting.updateOne(
    { scope, projectId, skillId: skill.id },
    {
      $set: update,
      $setOnInsert: {
        scope,
        projectId,
        skillId: skill.id,
        createdBy: userId,
      },
    },
    { upsert: true }
  ).exec()
}

async function upsertPluginSetting({ scope, projectId, userId, plugin }) {
  assertPluginManifestSafe(plugin.manifest)
  const update = {
    enabled: plugin.enabled,
    updatedBy: userId,
  }
  for (const field of [
    'name',
    'version',
    'displayName',
    'description',
    'manifest',
    'skills',
    'toolPresets',
  ]) {
    if (Object.hasOwn(plugin, field)) {
      update[field] = plugin[field]
    }
  }

  return AgentPluginSetting.updateOne(
    { scope, projectId, pluginId: plugin.id },
    {
      $set: update,
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

async function upsertInstructionProfile({
  scope,
  projectId,
  userId,
  profile,
}) {
  return AgentInstructionProfile.updateOne(
    { scope, projectId, name: profile.name },
    {
      $set: {
        content: profile.content,
        enabled: profile.enabled,
        updatedBy: userId,
      },
      $setOnInsert: {
        scope,
        projectId,
        name: profile.name,
        createdBy: userId,
      },
    },
    { upsert: true }
  ).exec()
}

function assertRequiredToolsAllowed(requiredTools = []) {
  for (const toolName of requiredTools || []) {
    if (!KNOWN_TOOL_NAMES.has(toolName)) {
      throw new AgentSettingsValidationError(`Unknown agent tool: ${toolName}`)
    }
  }
}

function assertPluginManifestSafe(manifest) {
  if (!manifest) {
    return
  }
  const manifestText = JSON.stringify(manifest)
  if (Buffer.byteLength(manifestText, 'utf8') > MAX_PLUGIN_MANIFEST_BYTES) {
    throw new AgentSettingsValidationError('Agent plugin manifest is too large')
  }
  assertPluginManifestValueSafe(manifest)
}

function assertPluginManifestValueSafe(value, path = []) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertPluginManifestValueSafe(item, [...path, String(index)])
    }
    return
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (BLOCKED_PLUGIN_MANIFEST_KEYS.has(normalizePluginManifestKey(key))) {
      const manifestPath = [...path, key].join('.')
      throw new AgentSettingsValidationError(
        `Agent plugin manifest contains executable capability: ${manifestPath}`
      )
    }
    assertPluginManifestValueSafe(childValue, [...path, key])
  }
}

function normalizePluginManifestKey(key) {
  return String(key).toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

async function listEffectivePluginCatalog({ projectId } = {}) {
  const [builtinPlugins, pluginSettings] = await Promise.all([
    Promise.resolve(listBuiltinPluginDefinitions()),
    listPluginSettings(projectId),
  ])

  const settingsByPluginId = new Map()
  for (const setting of pluginSettings) {
    const existing = settingsByPluginId.get(setting.pluginId)
    if (!existing || scopeRank(setting.scope) >= scopeRank(existing.scope)) {
      settingsByPluginId.set(setting.pluginId, setting)
    }
  }

  const mergedPlugins = builtinPlugins.map(plugin => {
    const setting = settingsByPluginId.get(plugin.id)
    if (!setting) {
      return {
        ...plugin,
        enabled: plugin.enabled !== false,
      }
    }

    return {
      ...plugin,
      enabled: setting.enabled ?? plugin.enabled,
      name: setting.name || plugin.name,
      version: setting.version || plugin.version,
      displayName: setting.displayName || plugin.displayName,
      description: setting.description || plugin.description,
      skills:
        Array.isArray(setting.skills) && setting.skills.length > 0
          ? setting.skills
          : plugin.skills,
      toolPresets:
        Array.isArray(setting.toolPresets) && setting.toolPresets.length > 0
          ? setting.toolPresets
          : plugin.toolPresets,
      manifest:
        setting.manifest && Object.keys(setting.manifest).length > 0
          ? setting.manifest
          : plugin.manifest,
      scope: setting.scope,
    }
  })

  const builtinPluginIds = new Set(builtinPlugins.map(plugin => plugin.id))
  const customPlugins = [...settingsByPluginId.values()]
    .filter(setting => !builtinPluginIds.has(setting.pluginId))
    .map(setting => ({
      id: setting.pluginId,
      name: setting.name || setting.pluginId,
      version: setting.version || '1.0.0',
      displayName: setting.displayName || setting.name || setting.pluginId,
      description: setting.description || '',
      enabled: setting.enabled !== false,
      skills: Array.isArray(setting.skills) ? [...setting.skills] : [],
      toolPresets: Array.isArray(setting.toolPresets)
        ? [...setting.toolPresets]
        : [],
      manifest: setting.manifest || {},
      scope: setting.scope,
    }))

  return [...mergedPlugins, ...customPlugins]
}

async function listSkillSettings(projectId) {
  const query = projectId
    ? { scope: 'project', projectId }
    : { scope: 'global' }
  const settings = await AgentSkillSetting.find(query)
    .sort({ scope: 1, skillId: 1 })
    .exec()
  return settings.map(toPlainObject)
}

async function listPluginSettings(projectId) {
  const query = projectId
    ? { scope: 'project', projectId }
    : { scope: 'global' }
  const settings = await AgentPluginSetting.find(query)
    .sort({ scope: 1, pluginId: 1 })
    .exec()
  return settings.map(toPlainObject)
}

function profileContentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function scopeRank(scope) {
  return normalizeScope(scope) === 'project' ? 2 : 1
}

function toPlainObject(document) {
  return typeof document.toObject === 'function' ? document.toObject() : document
}

function applyPluginAvailabilityToSkills(skills, plugins) {
  const disabledPluginIds = new Set(
    plugins
      .filter(plugin => plugin.enabled === false)
      .map(plugin => plugin.id)
  )
  return skills.map(skill => ({
    ...skill,
    enabled:
      skill.enabled !== false &&
      (!skill.pluginId || !disabledPluginIds.has(skill.pluginId)),
  }))
}

export {
  publicInstructionSource,
  publicInstructionProfile,
  publicPluginDefinition,
  publicSkillDefinition,
}
