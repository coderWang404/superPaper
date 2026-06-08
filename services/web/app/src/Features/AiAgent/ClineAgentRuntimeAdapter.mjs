import ProjectWorkspaceManager from '../Project/ProjectWorkspaceManager.mjs'
import ProjectCheckpointService from '../Project/ProjectCheckpointService.mjs'

const CLINE_CLIENT_NAME = 'superpaper'
const CLINE_GATEWAY_PROVIDER_ID = 'aihubmix'
const CLINE_SYSTEM_PROMPT =
  'You are superPaper Agent, a Cline-powered coding agent embedded in an Overleaf-style LaTeX editor. Modify only the current project workspace unless the user explicitly asks otherwise. Prefer direct, minimal file edits and verify changed LaTeX when possible.'
const CLINE_PROVIDER_CLIENT = 'openai-compatible'
const CLINE_PROVIDER_CAPABILITIES = ['tools', 'streaming']
const CLINE_DIRECT_WORKSPACE_TOOLS = [
  'read_files',
  'search_codebase',
  'run_commands',
  'apply_patch',
  'editor',
  'skills',
  'submit_and_exit',
]
const CLINE_PLAN_MODE_TOOLS = [
  'read_files',
  'search_codebase',
  'skills',
  'submit_and_exit',
]

export async function* runTurn({
  projectId,
  userId,
  sessionId,
  prompt,
  provider,
  agentContext = {},
  mode = 'act',
  signal,
}) {
  const runtimeMode = mode === 'plan' ? 'plan' : 'act'
  const workspaceRoot = ProjectWorkspaceManager.getWorkspaceRoot(projectId)
  const before = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'agent',
    actorUserId: userId,
    agentSessionId: sessionId,
    summary: 'Before Cline agent run',
  })
  yield {
    type: 'checkpoint_created',
    payload: {
      phase: 'before',
      commitHash: before.commitHash,
    },
  }

  const clineSdk = await import('@cline/sdk')
  const eventQueue = createAsyncEventQueue()
  const providerConfig = buildClineProviderConfig(provider)
  const clineSessionId = normalizeClineSessionId(sessionId)
  const selectedSkillIds = getSelectedClineSkillIds(agentContext)
  const cline = await clineSdk.ClineCore.create({
    clientName: CLINE_CLIENT_NAME,
    backendMode: 'local',
    toolPolicies: buildClineToolPolicies(agentContext, clineSdk, runtimeMode),
  })
  const unsubscribe = cline.subscribe(event => {
    if (
      event.payload?.sessionId &&
      String(event.payload.sessionId) !== clineSessionId
    ) {
      return
    }
    for (const mapped of mapClineEvent(event)) {
      eventQueue.push(mapped)
    }
  })
  const abort = createClineAbortHandler({ cline, eventQueue, signal })

  try {
    abort.throwIfAborted()
    let startResult
    let startError
    const startPromise = cline.start({
      prompt,
      interactive: false,
      source: 'superpaper',
      sessionMetadata: {
        superpaperProjectId: projectId,
        superpaperUserId: userId,
        superpaperAgentSessionId: clineSessionId,
      },
      config: {
        ...providerConfig,
        providerConfig,
        knownModels: providerConfig.knownModels,
        sessionId: clineSessionId,
        cwd: workspaceRoot,
        workspaceRoot,
        mode: runtimeMode,
        systemPrompt: buildClineSystemPrompt(agentContext, runtimeMode),
        enableTools: true,
        enableSpawnAgent: false,
        enableAgentTeams: false,
        disableMcpSettingsTools: true,
        yolo: runtimeMode === 'act',
        skills: selectedSkillIds,
        workspaceMetadata: buildClineWorkspaceMetadata({
          projectId,
          userId,
          agentContext,
          mode: runtimeMode,
        }),
        checkpoint: { enabled: false },
        compaction: {
          enabled: true,
          strategy: 'basic',
        },
        execution: {
          loopDetection: {
            softThreshold: 3,
            hardThreshold: 5,
          },
        },
      },
    })
      .then(result => {
        startResult = result
      })
      .catch(err => {
        startError = err
      })
      .finally(() => {
        eventQueue.close()
      })

    while (true) {
      abort.throwIfAborted()
      const adapterEvent = await eventQueue.shift()
      abort.throwIfAborted()
      if (!adapterEvent) {
        break
      }
      yield adapterEvent
    }
    await Promise.race([startPromise, abort.promise])
    abort.throwIfAborted()
    if (startError) {
      throw startError
    }
    if (startResult?.result?.text) {
      yield {
        type: 'message',
        payload: {
          role: 'assistant',
          kind: 'final',
          content: startResult.result.text,
        },
      }
    }
  } finally {
    abort.clear()
    unsubscribe?.()
    await cline.dispose?.()
    eventQueue.close()
  }

  abort.throwIfAborted()

  const diff = await ProjectCheckpointService.diffWorktree({ projectId })
  if (diff) {
    yield {
      type: 'workspace_diff',
      payload: {
        diff,
      },
    }
  }
  const after = await ProjectCheckpointService.createCheckpoint({
    projectId,
    actorType: 'agent',
    actorUserId: userId,
    agentSessionId: sessionId,
    summary: 'After Cline agent run',
  })
  yield {
    type: 'checkpoint_created',
    payload: {
      phase: 'after',
      commitHash: after.commitHash,
    },
  }
}

function createClineAbortHandler({ cline, eventQueue, signal }) {
  let abortError = null
  const abort = () => {
    abortError = toAbortError(signal?.reason)
    eventQueue.close()
    ignoreRejection(cline.abort?.(abortError))
    ignoreRejection(cline.cancel?.(abortError))
    resolveAbort?.()
  }
  let resolveAbort
  const promise = new Promise(resolve => {
    resolveAbort = resolve
  })
  if (signal?.aborted) {
    abort()
  } else if (signal) {
    signal.addEventListener('abort', abort, { once: true })
  }
  return {
    clear() {
      signal?.removeEventListener?.('abort', abort)
    },
    promise,
    throwIfAborted() {
      if (abortError) {
        throw abortError
      }
    },
  }
}

function ignoreRejection(promise) {
  if (promise?.catch) {
    promise.catch(() => {})
  }
}

function toAbortError(reason) {
  if (reason?.name === 'AbortError') {
    return reason
  }
  return new DOMException('The operation was aborted.', 'AbortError')
}

function buildClineSystemPrompt(agentContext, mode = 'act') {
  const sections = [CLINE_SYSTEM_PROMPT]
  const instructionProfiles = Array.isArray(agentContext.instructionProfiles)
    ? agentContext.instructionProfiles
    : []
  const skills = Array.isArray(agentContext.skills) ? agentContext.skills : []
  const toolPolicies = Array.isArray(agentContext.toolPolicies)
    ? agentContext.toolPolicies
    : []
  const enabledPluginIds = Array.isArray(agentContext.enabledPluginIds)
    ? agentContext.enabledPluginIds
    : []

  if (mode === 'plan') {
    sections.push(
      [
        'Current superPaper mode: Plan.',
        'Inspect the project and produce a concise, reviewable plan.',
        'Do not edit files, run shell commands, or apply patches in Plan mode.',
        'The user must explicitly start Act mode before any workspace write.',
      ].join(' ')
    )
  }

  if (instructionProfiles.length > 0) {
    sections.push(
      [
        'Project agent rules:',
        ...instructionProfiles.map(profile =>
          [
            `- ${profile.name || profile.id || 'Rules'}`,
            String(profile.content || '').trim(),
          ]
            .filter(Boolean)
            .join('\n')
        ),
      ].join('\n')
    )
  }

  if (skills.length > 0) {
    sections.push(
      [
        'Selected superPaper skills:',
        ...skills.map(skill =>
          [
            `- ${skill.displayName || skill.name || skill.id}`,
            skill.description ? `Description: ${skill.description}` : '',
            Array.isArray(skill.requiredTools) && skill.requiredTools.length > 0
              ? `Tools: ${skill.requiredTools.join(', ')}`
              : '',
            String(skill.content || '').trim(),
          ]
            .filter(Boolean)
            .join('\n')
        ),
      ].join('\n')
    )
  }

  if (enabledPluginIds.length > 0 || toolPolicies.length > 0) {
    sections.push(
      [
        'superPaper tool policy:',
        enabledPluginIds.length > 0
          ? `Enabled plugins: ${enabledPluginIds.join(', ')}`
          : '',
        ...toolPolicies.map(policy =>
          [
            `- ${policy.name}`,
            policy.requiresApproval == null
              ? ''
              : `requiresApproval=${Boolean(policy.requiresApproval)}`,
            Array.isArray(policy.allowedModes)
              ? `modes=${policy.allowedModes.join(',')}`
              : '',
          ]
            .filter(Boolean)
            .join(' ')
        ),
      ]
        .filter(Boolean)
        .join('\n')
    )
  }

  return sections.filter(Boolean).join('\n\n')
}

function buildClineToolPolicies(agentContext, clineSdk, mode = 'act') {
  const externalToolsEnabled =
    agentContext.permissionProfile?.externalToolsEnabled === true
  const policies = {
    '*': disabledToolPolicy(),
    fetch_web_content: externalToolsEnabled
      ? autoApprovedToolPolicy()
      : disabledToolPolicy(),
    ask_question: disabledToolPolicy(),
  }

  const enabledWorkspaceTools =
    mode === 'plan' ? CLINE_PLAN_MODE_TOOLS : CLINE_DIRECT_WORKSPACE_TOOLS
  for (const toolName of enabledWorkspaceTools) {
    policies[toolName] = autoApprovedToolPolicy()
  }
  for (const toolName of clineSdk.TEAM_TOOL_NAMES || []) {
    policies[toolName] = disabledToolPolicy()
  }

  return policies
}

function autoApprovedToolPolicy() {
  return { enabled: true, autoApprove: true }
}

function disabledToolPolicy() {
  return { enabled: false, autoApprove: false }
}

function getSelectedClineSkillIds(agentContext) {
  const skills = Array.isArray(agentContext.skills) ? agentContext.skills : []
  return skills
    .map(skill => skill.id || skill.name)
    .filter(skillId => typeof skillId === 'string' && skillId.trim())
}

function buildClineWorkspaceMetadata({ projectId, userId, agentContext, mode }) {
  const skillIds = getSelectedClineSkillIds(agentContext)
  const enabledPluginIds = Array.isArray(agentContext.enabledPluginIds)
    ? agentContext.enabledPluginIds
    : []
  const externalToolsEnabled =
    agentContext.permissionProfile?.externalToolsEnabled === true

  return [
    `superPaper project ${projectId?.toString?.() || projectId}`,
    `user ${userId?.toString?.() || userId}`,
    `direct workspace writes: ${mode === 'act' ? 'enabled' : 'disabled'}`,
    `shell: ${mode === 'act' ? 'enabled' : 'disabled'}`,
    `external tools: ${externalToolsEnabled ? 'enabled' : 'disabled'}`,
    'mcp settings tools: disabled',
    'spawn agent: disabled',
    'agent teams: disabled',
    `selected skills: ${skillIds.join(', ') || 'none'}`,
    `enabled plugins: ${enabledPluginIds.join(', ') || 'none'}`,
  ].join('\n')
}

function normalizeClineSessionId(sessionId) {
  return String(sessionId)
}

export function buildClineProviderConfig(provider) {
  const modelId = provider.model
  return {
    providerId: CLINE_GATEWAY_PROVIDER_ID,
    superpaperProviderId: provider.providerId || null,
    clientType: CLINE_PROVIDER_CLIENT,
    modelId,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl || provider.baseURL,
    knownModels: buildClineKnownModels(modelId),
  }
}

function buildClineKnownModels(modelId) {
  return {
    [modelId]: {
      id: modelId,
      name: modelId,
      capabilities: CLINE_PROVIDER_CAPABILITIES,
      status: 'active',
    },
  }
}

function createAsyncEventQueue() {
  const values = []
  const waiters = []
  let closed = false

  return {
    get size() {
      return values.length
    },
    push(value) {
      if (closed) {
        return
      }
      const waiter = waiters.shift()
      if (waiter) {
        waiter(value)
        return
      }
      values.push(value)
    },
    close() {
      closed = true
      while (waiters.length > 0) {
        waiters.shift()(null)
      }
    },
    async shift() {
      if (values.length > 0) {
        return values.shift()
      }
      if (closed) {
        return null
      }
      return await new Promise(resolve => waiters.push(resolve))
    },
  }
}

/*
 * Left intentionally close to Cline's event vocabulary. The superPaper UI only
 * knows a small AgentEvent enum, so the adapter narrows Cline's richer stream
 * into durable, audit-friendly events.
 */
export function mapClineEvent(event) {
  if (event.type === 'agent_event') {
    return mapClineAgentEvent(event.payload?.event)
  }
  if (event.type === 'chunk') {
    return [
      {
        type: 'message',
        payload: {
          role: event.payload?.stream === 'stderr' ? 'system' : 'assistant',
          kind: `cline_${event.payload?.stream || 'chunk'}`,
          content: event.payload?.chunk || '',
        },
      },
    ]
  }
  if (event.type === 'hook' && event.payload?.hookEventName) {
    return mapClineHookEvent(event.payload)
  }
  if (event.type === 'status') {
    return [
      {
        type: 'message',
        payload: {
          role: 'system',
          kind: 'cline_status',
          content: event.payload?.status || '',
        },
      },
    ]
  }
  if (event.type === 'ended') {
    return [
      {
        type: 'message',
        payload: {
          role: 'system',
          kind: 'cline_ended',
          content: event.payload?.reason || 'ended',
        },
      },
    ]
  }
  return []
}

function mapClineAgentEvent(agentEvent) {
  if (!agentEvent) {
    return []
  }
  if (agentEvent.type === 'content_start' && agentEvent.contentType === 'text') {
    return messageEvent({
      kind: 'cline_text',
      content: agentEvent.text || agentEvent.accumulated || '',
    })
  }
  if (
    agentEvent.type === 'content_end' &&
    agentEvent.contentType === 'text' &&
    agentEvent.text
  ) {
    return messageEvent({
      kind: 'cline_text',
      content: agentEvent.text,
    })
  }
  if (
    (agentEvent.type === 'content_start' ||
      agentEvent.type === 'content_update') &&
    agentEvent.contentType === 'tool'
  ) {
    return [
      {
        type: 'tool_call',
        payload: {
          name: agentEvent.toolName,
          input: agentEvent.input || agentEvent.update || {},
          toolCallId: agentEvent.toolCallId || null,
        },
      },
    ]
  }
  if (agentEvent.type === 'content_end' && agentEvent.contentType === 'tool') {
    return [
      {
        type: 'tool_result',
        payload: {
          name: agentEvent.toolName,
          ok: !agentEvent.error,
          result: agentEvent.output || null,
          error: agentEvent.error || null,
          toolCallId: agentEvent.toolCallId || null,
          durationMs: agentEvent.durationMs || null,
        },
      },
    ]
  }
  if (agentEvent.type === 'notice') {
    return messageEvent({
      role: agentEvent.displayRole === 'system' ? 'system' : 'assistant',
      kind: `cline_notice_${agentEvent.noticeType || 'status'}`,
      content: agentEvent.message || '',
    })
  }
  if (agentEvent.type === 'done') {
    return messageEvent({
      kind: 'final',
      content: agentEvent.text || '',
      iterations: agentEvent.iterations,
      usage: agentEvent.usage,
    })
  }
  if (agentEvent.type === 'error') {
    return [
      {
        type: 'error',
        payload: {
          code: 'CLINE_AGENT_ERROR',
          message: agentEvent.error?.message || 'Cline agent failed',
          recoverable: agentEvent.recoverable,
          iteration: agentEvent.iteration,
        },
      },
    ]
  }
  return []
}

function mapClineHookEvent(event) {
  if (event.hookEventName === 'tool_call') {
    return [
      {
        type: 'tool_call',
        payload: {
          name: event.toolName,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          iteration: event.iteration,
        },
      },
    ]
  }
  if (event.hookEventName === 'tool_result') {
    return [
      {
        type: 'tool_result',
        payload: {
          name: event.toolName,
          ok: true,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          iteration: event.iteration,
        },
      },
    ]
  }
  if (event.hookEventName === 'agent_error') {
    return [
      {
        type: 'error',
        payload: {
          code: 'CLINE_AGENT_ERROR',
          message: 'Cline agent failed',
          iteration: event.iteration,
        },
      },
    ]
  }
  return []
}

function messageEvent({
  role = 'assistant',
  kind,
  content,
  iterations,
  usage,
}) {
  if (!content) {
    return []
  }
  return [
    {
      type: 'message',
      payload: {
        role,
        kind,
        content,
        ...(iterations == null ? {} : { iterations }),
        ...(usage == null ? {} : { usage }),
      },
    },
  ]
}
