import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentEventSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    sequence: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'message',
        'tool_call',
        'tool_result',
        'approval_request',
        'approval_response',
        'patch_created',
        'patch_applied',
        'compile_started',
        'compile_result',
        'checkpoint_created',
        'workspace_diff',
        'mode_changed',
        'permission_denied',
        'settings_changed',
        'error',
      ],
      required: true,
      index: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    redactionVersion: { type: Number, default: 1 },
  },
  {
    collection: 'agentEvents',
    minimize: false,
    timestamps: true,
  }
)

AgentEventSchema.index({ sessionId: 1, sequence: 1 }, { unique: true })

export const AgentEvent = mongoose.model('AgentEvent', AgentEventSchema)
