import { z } from 'zod'
import SessionManager from '../Authentication/SessionManager.mjs'
import {
  AiAgentError,
  createSession as createAgentSession,
  getAgentConfig,
  runTurn,
} from './AiAgentRuntime.mjs'
import {
  AiAgentPatchError,
  applyPatch as applyAgentPatch,
  rejectPatch as rejectAgentPatch,
} from './AiAgentPatchManager.mjs'

const SelectionSchema = z
  .object({
    docId: z.string().min(1).max(200).optional(),
    path: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(20_000),
  })
  .optional()

const CreateSessionSchema = z.object({
  task: z.string().trim().min(1).max(8_000),
  providerId: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(200).optional(),
})

const TurnSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  providerId: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  selection: SelectionSchema,
})

function config(req, res) {
  res.json(getAgentConfig())
}

async function createSession(req, res, next) {
  try {
    const body = CreateSessionSchema.parse(req.body)
    const session = await createAgentSession({
      projectId: req.params.Project_id,
      userId: SessionManager.getLoggedInUserId(req.session),
      task: body.task,
      providerId: body.providerId,
      model: body.model,
    })
    res.json({ session })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function turnStream(req, res, next) {
  let streamStarted = false
  try {
    const body = TurnSchema.parse(req.body)
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    streamStarted = true

    const result = await runTurn({
      projectId: req.params.Project_id,
      userId: SessionManager.getLoggedInUserId(req.session),
      sessionId: req.params.sessionId,
      prompt: body.prompt,
      providerId: body.providerId,
      model: body.model,
      selection: body.selection,
      onEvent: event => {
        res.write(JSON.stringify({ type: 'event', event }) + '\n')
      },
    })

    res.write(
      JSON.stringify({
        type: 'done',
        session: result.session,
        answer: result.answer,
      }) + '\n'
    )
    res.end()
  } catch (err) {
    if (streamStarted) {
      res.write(
        JSON.stringify({
          type: 'error',
          error: safeControllerError(err),
        }) + '\n'
      )
      res.end()
      return
    }
    handleControllerError(err, res, next)
  }
}

async function applyPatch(req, res, next) {
  try {
    const patch = await applyAgentPatch({
      projectId: req.params.Project_id,
      userId: SessionManager.getLoggedInUserId(req.session),
      patchId: req.params.patchId,
    })
    res.json({ patch })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function rejectPatch(req, res, next) {
  try {
    const patch = await rejectAgentPatch({
      projectId: req.params.Project_id,
      userId: SessionManager.getLoggedInUserId(req.session),
      patchId: req.params.patchId,
    })
    res.json({ patch })
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

function handleControllerError(err, res, next) {
  if (err instanceof z.ZodError || err.name === 'ZodError') {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid agent input',
      },
    })
    return
  }
  if (err instanceof AiAgentError && err.code === 'AI_PROVIDER_NOT_CONFIGURED') {
    res.status(503).json({
      error: {
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        message: 'AI provider is not configured',
      },
    })
    return
  }
  if (err.name === 'AiProviderError') {
    res.status(502).json({
      error: {
        code: 'AI_PROVIDER_REQUEST_FAILED',
        message: 'AI provider request failed',
      },
    })
    return
  }
  if (err instanceof AiAgentPatchError) {
    const status = err.code === 'AGENT_PATCH_CONFLICT' ? 409 : 422
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

function safeControllerError(err) {
  if (err instanceof AiAgentError) {
    return {
      code: err.code,
      message: err.message,
    }
  }
  if (err.name === 'AiProviderError') {
    return {
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI provider request failed',
    }
  }
  return {
    code: 'AGENT_REQUEST_FAILED',
    message: 'Agent request failed',
  }
}

export default {
  config,
  createSession,
  turnStream,
  applyPatch,
  rejectPatch,
}
