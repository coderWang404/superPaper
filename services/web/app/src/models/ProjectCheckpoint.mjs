import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const ProjectCheckpointSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, required: true, index: true },
    commitHash: { type: String, required: true },
    actorType: {
      type: String,
      enum: ['user', 'agent', 'migration', 'system'],
      required: true,
      index: true,
    },
    actorUserId: { type: Schema.Types.ObjectId, default: null },
    agentSessionId: { type: Schema.Types.ObjectId, default: null },
    summary: { type: String, default: '' },
  },
  {
    collection: 'projectCheckpoints',
    minimize: false,
    timestamps: true,
  }
)

ProjectCheckpointSchema.index({ projectId: 1, createdAt: -1 })

export const ProjectCheckpoint = mongoose.model(
  'ProjectCheckpoint',
  ProjectCheckpointSchema
)
