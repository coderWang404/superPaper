import { z } from 'zod'
import SessionManager from '../Authentication/SessionManager.mjs'
import ProjectAuditLogHandler from '../Project/ProjectAuditLogHandler.mjs'
import UserAuditLogHandler from '../User/UserAuditLogHandler.mjs'
import {
  AgentSettingsValidationError,
  getAgentConfig,
  updateAgentSettings,
} from './AiAgentSettingsManager.mjs'
import {
  AgentPluginInstallationError,
  installAgentPluginPackage,
  listInstalledAgentPlugins,
  previewAgentPluginPackage,
  setInstalledAgentPluginEnabled,
  summarizePluginInstallation,
} from './AiAgentPluginInstallationManager.mjs'
import { AgentPluginPackageValidationError } from './AiAgentPluginPackageManager.mjs'

const SettingIdSchema = z.string().trim().min(1).max(120)
const RequiredToolsSchema = z.array(SettingIdSchema).max(20).optional()
const KeywordsSchema = z.array(z.string().trim().min(1).max(80)).max(40).optional()

const SkillSettingSchema = z.object({
  id: SettingIdSchema,
  enabled: z.boolean(),
  displayName: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  modelInvocable: z.boolean().optional(),
  requiredTools: RequiredToolsSchema,
  keywords: KeywordsSchema,
  content: z.string().max(16_000).optional(),
  pluginId: SettingIdSchema.optional(),
})

const PluginSettingSchema = z.object({
  id: SettingIdSchema,
  enabled: z.boolean(),
  name: SettingIdSchema.optional(),
  version: z.string().trim().min(1).max(80).optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  manifest: z.record(z.string(), z.unknown()).optional(),
  skills: z.array(SettingIdSchema).max(50).optional(),
  toolPresets: z.array(SettingIdSchema).max(50).optional(),
})

const InstructionProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  content: z.string().max(32_000),
  enabled: z.boolean(),
})

const SettingsUpdateSchema = z.object({
  skills: z.array(SkillSettingSchema).max(50).optional().default([]),
  plugins: z.array(PluginSettingSchema).max(50).optional().default([]),
  instructionProfiles: z
    .array(InstructionProfileSchema)
    .max(20)
    .optional()
    .default([]),
})

const PluginSourceSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('local_directory'),
    path: z.string().trim().min(1).max(1000),
  }),
  z.object({
    sourceType: z.literal('zip_url'),
    url: z.string().trim().url().max(2000),
  }),
])

const PluginInstallSchema = PluginSourceSchema.and(
  z.object({
    enabled: z.boolean().optional().default(true),
  })
)

const PluginEnabledSchema = z.object({
  enabled: z.boolean(),
})

async function projectConfig(req, res, next) {
  try {
    res.json(await getAgentConfig({ projectId: req.params.Project_id }))
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function globalConfig(req, res, next) {
  try {
    res.json(
      await getAgentConfig({
        includeContent: true,
        includeAllInstructionProfiles: true,
      })
    )
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function updateProjectSettings(req, res, next) {
  try {
    const body = SettingsUpdateSchema.parse(req.body)
    const userId = SessionManager.getLoggedInUserId(req.session)
    const config = await updateAgentSettings({
      scope: 'project',
      projectId: req.params.Project_id,
      userId,
      ...body,
    })
    ProjectAuditLogHandler.addEntryInBackground(
      req.params.Project_id,
      'agent-settings-changed',
      userId,
      req.ip,
      summarizeSettingsChange(body)
    )
    res.json(config)
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function updateGlobalSettings(req, res, next) {
  try {
    const body = SettingsUpdateSchema.parse(req.body)
    const config = await updateAgentSettings({
      scope: 'global',
      userId: SessionManager.getLoggedInUserId(req.session),
      includeContent: true,
      includeAllInstructionProfiles: true,
      ...body,
    })
    res.json(config)
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function listGlobalPlugins(req, res, next) {
  try {
    res.json({ plugins: await listInstalledAgentPlugins() })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function previewGlobalPlugin(req, res, next) {
  try {
    const source = PluginSourceSchema.parse(req.body)
    res.json({ preview: await previewAgentPluginPackage(source) })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function installGlobalPlugin(req, res, next) {
  try {
    const body = PluginInstallSchema.parse(req.body)
    const userId = SessionManager.getLoggedInUserId(req.session)
    const installation = await installAgentPluginPackage({
      source: body,
      userId,
      enabled: body.enabled,
    })
    UserAuditLogHandler.addEntryInBackground(
      userId,
      'agent-plugin-installed',
      userId,
      req.ip,
      summarizePluginInstallation(installation)
    )
    res.json({
      plugin: installation,
      config: await getAgentConfig({
        includeContent: true,
        includeAllInstructionProfiles: true,
      }),
    })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function setGlobalPluginEnabled(req, res, next) {
  try {
    const body = PluginEnabledSchema.parse(req.body)
    const userId = SessionManager.getLoggedInUserId(req.session)
    const plugin = await setInstalledAgentPluginEnabled({
      pluginId: req.params.pluginId,
      enabled: body.enabled,
      userId,
    })
    UserAuditLogHandler.addEntryInBackground(
      userId,
      'agent-plugin-enabled-changed',
      userId,
      req.ip,
      summarizePluginInstallation(plugin)
    )
    res.json({
      plugin,
      config: await getAgentConfig({
        includeContent: true,
        includeAllInstructionProfiles: true,
      }),
    })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

function summarizeSettingsChange(body) {
  return {
    skills: body.skills.map(skill => ({
      id: skill.id,
      enabled: skill.enabled,
    })),
    plugins: body.plugins.map(plugin => ({
      id: plugin.id,
      enabled: plugin.enabled,
    })),
    instructionProfiles: body.instructionProfiles.map(profile => ({
      name: profile.name,
      enabled: profile.enabled,
      bytes: Buffer.byteLength(profile.content || '', 'utf8'),
    })),
  }
}

function handleControllerError(err, res, next) {
  if (err instanceof z.ZodError || err.name === 'ZodError') {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid agent settings input',
      },
    })
    return
  }
  if (
    err instanceof AgentSettingsValidationError ||
    err.name === 'AgentSettingsValidationError' ||
    err instanceof AgentPluginPackageValidationError ||
    err.name === 'AgentPluginPackageValidationError'
  ) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
      },
    })
    return
  }
  if (err instanceof AgentPluginInstallationError) {
    const status = err.code === 'AGENT_PLUGIN_NOT_FOUND' ? 404 : 422
    res.status(status).json({
      error: {
        code: err.code,
        message: err.message,
      },
    })
    return
  }
  next(err)
}

export default {
  projectConfig,
  globalConfig,
  updateProjectSettings,
  updateGlobalSettings,
  listGlobalPlugins,
  previewGlobalPlugin,
  installGlobalPlugin,
  setGlobalPluginEnabled,
}
