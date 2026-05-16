import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentSessionSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: {
      type: String,
      enum: [
        'planning',
        'waiting_for_act',
        'ready_for_act',
        'running',
        'waiting_for_approval',
        'completed',
        'failed',
        'cancelled',
      ],
      default: 'planning',
      index: true,
    },
    mode: {
      type: String,
      enum: ['plan', 'act'],
      default: 'plan',
    },
    providerId: { type: Schema.Types.ObjectId, default: null },
    model: { type: String, default: null },
    task: { type: String, required: true },
    instructionSources: { type: Array, default: [] },
    enabledSkillIds: { type: Array, default: [] },
    enabledPluginIds: { type: Array, default: [] },
    permissionProfileId: { type: String, default: 'project-agent-default' },
    completedAt: { type: Date, default: null },
  },
  {
    collection: 'agentSessions',
    minimize: false,
    timestamps: true,
  }
)

export const AgentSession = mongoose.model('AgentSession', AgentSessionSchema)
