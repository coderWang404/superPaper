import { z } from 'zod'
import {
  AiProjectChatError,
  chatStream as projectChatStream,
  chat as projectChat,
  getProjectAiConfig,
} from './AiProjectChatManager.mjs'

const SelectionSchema = z
  .object({
    docId: z.string().min(1).max(200).optional(),
    path: z.string().min(1).max(500).optional(),
    text: z.string().min(1).max(20_000),
  })
  .optional()

const ChatRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  providerId: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  selection: SelectionSchema,
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(12_000),
      })
    )
    .max(20)
    .optional()
    .default([]),
})

function sendValidationError(res) {
  res.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid AI chat input',
    },
  })
}

function sendProviderMissingError(res) {
  res.status(503).json({
    error: {
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: 'AI provider is not configured',
    },
  })
}

function sendProviderRequestError(res) {
  res.status(502).json({
    error: {
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message: 'AI provider request failed',
    },
  })
}

function handleControllerError(err, res, next) {
  if (err instanceof z.ZodError || err.name === 'ZodError') {
    return sendValidationError(res)
  }
  if (
    err instanceof AiProjectChatError &&
    err.code === 'AI_PROVIDER_NOT_CONFIGURED'
  ) {
    return sendProviderMissingError(res)
  }
  if (err.name === 'AiProviderError') {
    return sendProviderRequestError(res)
  }
  return next(err)
}

async function config(req, res, next) {
  try {
    res.json(await getProjectAiConfig())
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function chat(req, res, next) {
  try {
    const body = ChatRequestSchema.parse(req.body)
    res.json(
      await projectChat({
        projectId: req.params.Project_id,
        prompt: body.prompt,
        providerId: body.providerId,
        model: body.model,
        selection: body.selection,
        history: body.history,
      })
    )
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

async function chatStream(req, res, next) {
  let streamStarted = false
  try {
    const body = ChatRequestSchema.parse(req.body)
    const result = await projectChatStream({
      projectId: req.params.Project_id,
      prompt: body.prompt,
      providerId: body.providerId,
      model: body.model,
      selection: body.selection,
      history: body.history,
    })

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    streamStarted = true

    for await (const delta of result.stream) {
      res.write(JSON.stringify({ type: 'delta', delta }) + '\n')
    }
    res.write(
      JSON.stringify({
        type: 'done',
        model: result.model,
        providerId: result.providerId,
        context: result.context,
      }) + '\n'
    )
    res.end()
  } catch (err) {
    if (streamStarted) {
      res.write(
        JSON.stringify({
          type: 'error',
          message: 'AI provider request failed',
        }) + '\n'
      )
      res.end()
      return
    }
    handleControllerError(err, res, next)
  }
}

export default {
  config,
  chat,
  chatStream,
}
