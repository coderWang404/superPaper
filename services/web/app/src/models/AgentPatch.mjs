import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentPatchSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, index: true },
    approvedByUserId: { type: Schema.Types.ObjectId, default: null },
    appliedByUserId: { type: Schema.Types.ObjectId, default: null },
    rejectedByUserId: { type: Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: [
        'pending',
        'approved',
        'applied',
        'partially_applied',
        'rejected',
        'conflicted',
        'rolled_back',
      ],
      default: 'pending',
      index: true,
    },
    baseRevision: { type: Schema.Types.Mixed, default: {} },
    operations: { type: Array, default: [] },
    appliedOperations: { type: Array, default: [] },
    rollbackOperations: { type: Array, default: [] },
    summary: { type: String, default: '' },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'low',
    },
    approvedAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rolledBackByUserId: { type: Schema.Types.ObjectId, default: null },
    rolledBackAt: { type: Date, default: null },
  },
  {
    collection: 'agentPatches',
    minimize: false,
    timestamps: true,
  }
)

AgentPatchSchema.index({ projectId: 1, status: 1, createdAt: -1 })

export const AgentPatch = mongoose.model('AgentPatch', AgentPatchSchema)
