import { z } from 'zod'
import {
  AiProjectChatError,
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
      })
    )
  } catch (err) {
    handleControllerError(err, res, next)
  }
}

export default {
  config,
  chat,
}
