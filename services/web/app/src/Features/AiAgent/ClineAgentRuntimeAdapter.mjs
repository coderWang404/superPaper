import ProjectWorkspaceManager from '../Project/ProjectWorkspaceManager.mjs'
import ProjectCheckpointService from '../Project/ProjectCheckpointService.mjs'

export async function* runTurn({
  projectId,
  userId,
  sessionId,
  prompt,
  provider,
}) {
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
  const runtimeFactory = clineSdk.ClineCore || clineSdk.Agent
  const runtime = runtimeFactory.start({
    config: {
      cwd: workspaceRoot,
      workspaceRoot,
      enableSpawnAgent: false,
      enableAgentTeams: false,
    },
    provider,
  })

  try {
    for await (const event of runtime.run({ prompt })) {
      for (const mapped of mapClineEvent(event)) {
        yield mapped
      }
    }
  } finally {
    await runtime.dispose?.()
  }

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

export function mapClineEvent(event) {
  if (event.type === 'message' || event.type === 'assistant') {
    return [
      {
        type: 'message',
        payload: {
          role: event.role || 'assistant',
          content: event.content || '',
        },
      },
    ]
  }
  if (event.type === 'tool') {
    return [
      {
        type: 'tool_call',
        payload: {
          name: event.name,
          input: event.input || {},
        },
      },
      {
        type: 'tool_result',
        payload: {
          name: event.name,
          ok: event.error == null,
          result: event.output || null,
          error: event.error || null,
        },
      },
    ]
  }
  if (event.type === 'error') {
    return [
      {
        type: 'error',
        payload: {
          code: event.code || 'CLINE_AGENT_ERROR',
          message: event.message || 'Cline agent failed',
        },
      },
    ]
  }
  return [
    {
      type: 'message',
      payload: {
        role: 'assistant',
        kind: event.type || 'cline_event',
        content: JSON.stringify(event),
      },
    },
  ]
}
