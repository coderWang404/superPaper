import mongoose from '../infrastructure/Mongoose.mjs'

const { Schema } = mongoose

export const AgentInstructionProfileSchema = new Schema(
  {
    scope: {
      type: String,
      enum: ['global', 'project'],
      required: true,
      index: true,
    },
    projectId: { type: Schema.Types.ObjectId, default: null, index: true },
    name: { type: String, required: true, index: true },
    content: { type: String, required: true, default: '' },
    enabled: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, default: null },
    updatedBy: { type: Schema.Types.ObjectId, default: null },
  },
  {
    collection: 'agentInstructionProfiles',
    minimize: false,
    timestamps: true,
  }
)

AgentInstructionProfileSchema.index(
  { scope: 1, projectId: 1, name: 1 },
  { unique: true }
)

export const AgentInstructionProfile = mongoose.model(
  'AgentInstructionProfile',
  AgentInstructionProfileSchema
)
