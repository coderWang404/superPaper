import { AgentEvent } from '../../models/AgentEvent.mjs'
import { AgentSession } from '../../models/AgentSession.mjs'
import { AiProvider } from '../../models/AiProvider.mjs'
import logger from '@superpaper/logger'
import AuthorizationManager from '../Authorization/AuthorizationManager.mjs'
import ProjectGetter from '../Project/ProjectGetter.mjs'
import ProjectCheckpointService from '../Project/ProjectCheckpointService.mjs'
import ProjectStorageMigrationService from '../Project/ProjectStorageMigrationService.mjs'
import ProjectWorkspaceManager from '../Project/ProjectWorkspaceManager.mjs'
import ProjectWorkspaceWatcher from '../Project/ProjectWorkspaceWatcher.mjs'
import { decryptApiKey } from '../AiAssistant/AiProviderSecrets.mjs'
import * as ClineAgentRuntimeAdapter from './ClineAgentRuntimeAdapter.mjs'
import { AiAgentPatchError } from './AiAgentPatchManager.mjs'
import { getDefaultPermissionProfile } from './AiAgentPermissionManager.mjs'
import {
  getAgentConfig as getAgentSettingsConfig,
  getSelectedSkillsForTask,
} from './AiAgentSettingsManager.mjs'

const RUNNABLE_SESSION_STATUSES = new Set([
  'planning',
  'waiting_for_act',
  'ready_for_act',
  'completed',
])
const TERMINAL_SESSION_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export class AiAgentError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AiAgentError'
    this.code = code
  }
}

export async function getAgentConfig({ projectId } = {}) {
  return getAgentSettingsConfig({ projectId })
}

export async function createSession({
  projectId,
  userId,
  task,
  providerId,
  model,
}) {
  const session = await AgentSession.create({
    projectId,
    userId,
    task,
    providerId: providerId || null,
    model: model || null,
    status: 'planning',
    mode: 'plan',
    permissionProfileId: getDefaultPermissionProfile().id,
  })
  return publicSession(session)
}

export async function startAct({ projectId, userId, sessionId }) {
  const session = await findSession({ sessionId, projectId, userId })
  if (!session) {
    throw new AiAgentError('AGENT_SESSION_NOT_FOUND', 'Agent session not found')
  }
  if (session.mode === 'act') {
    return publicSession(session)
  }
  if (!['waiting_for_act', 'completed'].includes(session.status)) {
    throw new AiAgentError(
      'AGENT_SESSION_NOT_READY_FOR_ACT',
      'Agent session is not ready for act mode'
    )
  }

  const eventRecorder = await createEventRecorder({
    session,
    projectId,
    userId,
  })
  const previousMode = session.mode || 'plan'
  session.mode = 'act'
  session.status = 'ready_for_act'
  session.completedAt = null
  session.permissionProfileId =
    session.permissionProfileId || getDefaultPermissionProfile().id
  await persistSessionMetadata(session)
  await eventRecorder.record('mode_changed', {
    from: previousMode,
    to: 'act',
  })
  return publicSession(session)
}

export async function runTurn({
  projectId,
  userId,
  sessionId,
  prompt,
  providerId,
  model,
  onEvent,
}) {
  const session = sessionId
    ? await findSession({ sessionId, projectId, userId })
    : await AgentSession.create({
        projectId,
        userId,
        task: prompt,
        providerId: providerId || null,
        model: model || null,
        status: 'planning',
        mode: 'plan',
        permissionProfileId: getDefaultPermissionProfile().id,
      })

  if (!session) {
    throw new AiAgentError('AGENT_SESSION_NOT_FOUND', 'Agent session not found')
  }
  if (sessionId && !RUNNABLE_SESSION_STATUSES.has(session.status)) {
    throw new AiAgentError(
      'AGENT_SESSION_NOT_RUNNABLE',
      'Agent session is not ready for another turn'
    )
  }
  await assertUserCanAct({ projectId, userId })

  await ensureFilesystemAgentProject({ projectId, userId })
  return await runClineFilesystemTurn({
    projectId,
    userId,
    session,
    prompt,
    providerId,
    model,
    onEvent,
  })
}

export async function rollbackSessionToCheckpoint({
  projectId,
  userId,
  sessionId,
  commitHash,
}) {
  const session = await findSession({ sessionId, projectId, userId })
  if (!session) {
    throw new AiAgentError('AGENT_SESSION_NOT_FOUND', 'Agent session not found')
  }
  await assertUserCanAct({ projectId, userId })

  const eventRecorder = await createEventRecorder({
    session,
    projectId,
    userId,
  })
  const watcherState = await ProjectWorkspaceWatcher.start(projectId.toString())
  const restore = await ProjectCheckpointService.restoreCommit({
    projectId,
    commitHash,
  })
  if (watcherState) {
    await ProjectWorkspaceWatcher.poll(watcherState)
  }
  const event = await eventRecorder.record('checkpoint_restored', {
    commitHash: restore.commitHash,
    changedPaths: restore.changedPaths || [],
  })

  return {
    session: publicSession(session),
    restoredCommitHash: restore.commitHash,
    changedPaths: restore.changedPaths || [],
    event,
  }
}

async function ensureFilesystemAgentProject({ projectId, userId }) {
  const project = await ProjectGetter.promises.getProject(projectId, {
    storageBackend: 1,
  })
  const storageBackend = project?.storageBackend || 'mongo'
  if (storageBackend === 'filesystem') {
    const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
    const workspaceExists = await import('node:fs').then(m =>
      m.promises.access(workspaceRoot).then(() => true, () => false)
    )
    if (!workspaceExists) {
      await ProjectStorageMigrationService.migrateProjectToFilesystem({ projectId, userId })
    }
    await ProjectWorkspaceWatcher.start(projectId.toString())
    return
  }
  if (storageBackend === 'mongo') {
    await ProjectStorageMigrationService.migrateProjectToFilesystem({
      projectId,
      userId,
    })
    await ProjectWorkspaceWatcher.start(projectId.toString())
    return
  }
  throw new AiAgentError(
    'AGENT_STORAGE_BACKEND_UNSUPPORTED',
    'Project storage backend is not supported by the agent'
  )
}

async function runClineFilesystemTurn({
  projectId,
  userId,
  session,
  prompt,
  providerId,
  model,
  onEvent,
}) {
  const eventRecorder = await createEventRecorder({
    session,
    projectId,
    userId,
    onEvent,
  })
  await updateSessionStatus(session, 'running')
  try {
    const provider = await resolveProvider(providerId || session.providerId)
    const providerConfig = publicProviderConfig(provider)
    const selectedModel = model || session.model || providerConfig.defaultModel
    if (
      !providerConfig.models.some(
        availableModel => availableModel.id === selectedModel
      )
    ) {
      throw new AiAgentError(
        'AI_MODEL_NOT_AVAILABLE',
        'AI model is not available'
      )
    }
    const apiKey = await decryptApiKey(provider.encryptedApiKey)
    const agentContext = await buildClineAgentContext({ projectId, prompt })
    session.providerId = providerConfig.id
    session.model = selectedModel
    if (
      session.mode !== 'act' &&
      !session.plan &&
      !session.planOutput
    ) {
      throw new AiAgentError(
        'AGENT_PLAN_REQUIRED',
        'Cannot enter act mode without an approved plan. Complete the planning phase first.'
      )
    }
    session.mode = 'act'
    session.enabledSkillIds = agentContext.skills.map(skill => skill.id)
    session.enabledPluginIds = agentContext.enabledPluginIds
    session.instructionSources = agentContext.instructionProfiles.map(
      profile => ({
        type: 'instruction-profile',
        scope: profile.scope,
        path: profile.name,
        sha256: profile.sha256,
        bytes: profile.bytes,
      })
    )
    await persistSessionMetadata(session)
    await eventRecorder.record(
      'message',
      buildClineRuntimeContextPayload(agentContext)
    )

    let finalAnswer = ''
    for await (const adapterEvent of ClineAgentRuntimeAdapter.runTurn({
      projectId,
      userId,
      sessionId: session._id,
      prompt,
      provider: {
        providerId: providerConfig.id,
        baseURL: provider.baseURL,
        apiKey,
        model: selectedModel,
      },
      agentContext,
    })) {
      await eventRecorder.record(adapterEvent.type, adapterEvent.payload || {})
      if (
        adapterEvent.type === 'message' &&
        adapterEvent.payload?.role === 'assistant' &&
        adapterEvent.payload?.content
      ) {
        finalAnswer = adapterEvent.payload.content
      }
    }
    if (!finalAnswer) {
      finalAnswer = 'Cline agent run completed.'
    }
    await updateSessionStatus(session, 'completed')
    return {
      session: publicSession(session),
      answer: finalAnswer,
      events: eventRecorder.events,
    }
  } catch (err) {
    await updateSessionStatus(session, 'failed')
    logClineRuntimeFailure({
      err,
      projectId,
      userId,
      sessionId: session._id,
      providerId: providerId || session.providerId || null,
      model: model || session.model || null,
    })
    await eventRecorder.record('error', {
      code: err.code || err.name || 'CLINE_AGENT_ERROR',
      message: safeErrorMessage(err),
    })
    throw err
  }
}

async function buildClineAgentContext({ projectId, prompt }) {
  const [config, selectedSkills] = await Promise.all([
    getAgentSettingsConfig({ projectId, includeContent: true }),
    getSelectedSkillsForTask(prompt, { projectId }),
  ])
  return {
    permissionProfile: config.permissionProfile,
    instructionProfiles: (config.instructionProfiles || [])
      .filter(profile => profile.enabled !== false && profile.content)
      .map(profile => ({
        id: profile.id,
        scope: profile.scope,
        name: profile.name,
        content: profile.content,
        sha256: profile.sha256,
        bytes: profile.bytes,
      })),
    skills: selectedSkills.map(skill => ({
      id: skill.id,
      name: skill.name,
      displayName: skill.displayName || skill.name,
      description: skill.description || '',
      requiredTools: skill.requiredTools || [],
      content: skill.content || '',
    })),
    enabledPluginIds: config.enabledPluginIds || [],
    toolPolicies: config.toolPolicies || [],
  }
}

function buildClineRuntimeContextPayload(agentContext) {
  const enabledSkillIds = agentContext.skills.map(skill => skill.id)
  const enabledPluginIds = agentContext.enabledPluginIds || []
  const permissionProfile = agentContext.permissionProfile || {}
  const externalToolsEnabled = permissionProfile.externalToolsEnabled === true
  const toolPolicySummary = {
    directWorkspaceWrites: true,
    shellEnabled: true,
    externalToolsEnabled,
    mcpEnabled: false,
    spawnAgentEnabled: false,
    agentTeamsEnabled: false,
  }

  return {
    role: 'system',
    kind: 'context',
    content: [
      'Cline runtime: direct workspace writes enabled.',
      'Shell enabled for project-local commands.',
      `External tools ${externalToolsEnabled ? 'enabled' : 'disabled'}.`,
      'MCP settings tools disabled.',
      'Spawn-agent and agent-team tools disabled.',
    ].join(' '),
    enabledSkillIds,
    enabledPluginIds,
    permissionProfileId:
      permissionProfile.id || getDefaultPermissionProfile().id,
    toolPolicySummary,
  }
}

async function assertUserCanAct({ projectId, userId }) {
  const canWrite =
    await AuthorizationManager.promises.canUserWriteProjectContent(
      userId,
      projectId,
      null
    )
  if (!canWrite) {
    throw new AiAgentError(
      'AGENT_ACT_PERMISSION_DENIED',
      'Agent act mode requires project write access'
    )
  }
}

async function createEventRecorder({ session, projectId, userId, onEvent }) {
  const countResult = AgentEvent.countDocuments?.({ sessionId: session._id })
  let sequence =
    typeof countResult?.exec === 'function' ? await countResult.exec() : 0
  const events = []

  return {
    events,
    async record(type, payload) {
      sequence += 1
      const event = await AgentEvent.create({
        sessionId: session._id,
        projectId,
        userId,
        sequence,
        type,
        payload: redactPayload(payload),
        redactionVersion: 1,
      })
      const publicEvent = publicAgentEvent(event)
      events.push(publicEvent)
      await onEvent?.(publicEvent)
      return publicEvent
    },
  }
}

async function resolveProvider(providerIdInput) {
  if (providerIdInput) {
    const provider = await AiProvider.findById(providerIdInput).exec()
    if (provider?.enabled && enabledModels(provider).length > 0) {
      return provider
    }
    throw new AiAgentError('AI_PROVIDER_NOT_CONFIGURED', 'AI provider is not configured')
  }

  const providers = await AiProvider.find({ enabled: true }).sort({ name: 1 }).exec()
  const provider = providers.find(currentProvider => enabledModels(currentProvider).length > 0)
  if (!provider) {
    throw new AiAgentError('AI_PROVIDER_NOT_CONFIGURED', 'AI provider is not configured')
  }
  return provider
}

function enabledModels(provider) {
  return (provider.models || []).filter(currentModel => currentModel.enabled !== false)
}

function publicProviderConfig(provider) {
  const models = enabledModels(provider).map(currentModel => ({
    id: currentModel.id,
    displayName: currentModel.displayName || currentModel.id,
    enabled: currentModel.enabled !== false,
  }))
  return {
    id: provider._id?.toString?.() || provider.id,
    name: provider.name,
    models,
    defaultModel: provider.defaultModel || models[0]?.id || null,
  }
}

async function findSession({ sessionId, projectId, userId }) {
  return AgentSession.findOne({
    _id: sessionId,
    projectId,
    userId,
  }).exec()
}

async function updateSessionStatus(session, status) {
  if (typeof session.save === 'function') {
    session.status = status
    if (TERMINAL_SESSION_STATUSES.has(status)) {
      session.completedAt = new Date()
    } else {
      session.completedAt = null
    }
    await session.save()
    return
  }
  await AgentSession.updateOne(
    { _id: session._id },
    {
      $set: {
        status,
        completedAt: TERMINAL_SESSION_STATUSES.has(status) ? new Date() : null,
      },
    }
  ).exec()
}

async function persistSessionMetadata(session) {
  if (typeof session.save === 'function') {
    await session.save()
    return
  }
  await AgentSession.updateOne(
    { _id: session._id },
    {
      $set: {
        instructionSources: session.instructionSources,
        enabledSkillIds: session.enabledSkillIds,
        enabledPluginIds: session.enabledPluginIds,
        mode: session.mode,
        status: session.status,
        completedAt: session.completedAt || null,
        permissionProfileId: session.permissionProfileId,
        providerId: session.providerId || null,
        model: session.model || null,
      },
    }
  ).exec()
}

function publicSession(session) {
  return {
    id: session._id?.toString?.() || session.id,
    projectId: session.projectId?.toString?.() || session.projectId,
    userId: session.userId?.toString?.() || session.userId,
    status: session.status,
    mode: session.mode,
    providerId: session.providerId?.toString?.() || session.providerId || null,
    model: session.model || null,
    task: session.task,
    instructionSources: session.instructionSources || [],
    enabledSkillIds: session.enabledSkillIds || [],
    enabledPluginIds: session.enabledPluginIds || [],
    permissionProfileId:
      session.permissionProfileId || getDefaultPermissionProfile().id,
  }
}

function publicAgentEvent(event) {
  return {
    id: event._id?.toString?.() || event.id,
    sessionId: event.sessionId?.toString?.() || event.sessionId,
    sequence: event.sequence,
    type: event.type,
    payload: event.payload || {},
    createdAt: event.createdAt || null,
  }
}

function redactPayload(payload) {
  return JSON.parse(
    JSON.stringify(payload, (key, value) => {
      if (/api[_-]?key|authorization|token|secret|password/i.test(key)) {
        return '[redacted]'
      }
      if (typeof value === 'string' && value.length > 60_000) {
        return `${value.slice(0, 60_000)}\n[truncated]`
      }
      return value
    })
  )
}

function safeErrorMessage(err) {
  if (err instanceof AiAgentError || err instanceof AiAgentPatchError) {
    return err.message
  }
  if (err.name === 'AiProviderError') {
    return 'AI provider request failed'
  }
  return 'Agent request failed'
}

function logClineRuntimeFailure({
  err,
  projectId,
  userId,
  sessionId,
  providerId,
  model,
}) {
  logger.error(
    {
      projectId: projectId?.toString?.() || projectId,
      userId: userId?.toString?.() || userId,
      sessionId: sessionId?.toString?.() || sessionId,
      providerId: providerId?.toString?.() || providerId,
      model,
      errorName: err?.name || 'Error',
      errorCode: err?.code || null,
      errorMessage: sanitizeDiagnosticString(err?.message || String(err)),
    },
    'cline agent runtime failed'
  )
}

function sanitizeDiagnosticString(value) {
  return String(value)
    .replace(/api[_-]?key\s+[^,\s;]+/gi, 'apiKey [redacted]')
    .replace(/api[_-]?key\s*[:=]\s*[^,\s;]+/gi, 'apiKey=[redacted]')
    .replace(
      /authorization\s+bearer\s+[^,\s;]+/gi,
      'Authorization Bearer [redacted]'
    )
    .replace(/bearer\s+[^,\s;]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|password)\s*[:=]\s*[^,\s;]+/gi, '$1=[redacted]')
}
