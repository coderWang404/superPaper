import { expect } from 'vitest'
import mongoose from '../../../../app/src/infrastructure/Mongoose.mjs'
import { AgentEvent } from '../../../../app/src/models/AgentEvent.mjs'

describe('AgentEvent model', function () {
  it('accepts checkpoint restored events emitted by rollback', function () {
    const event = new AgentEvent({
      sessionId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      sequence: 1,
      type: 'checkpoint_restored',
      payload: {
        commitHash: 'a'.repeat(40),
        changedPaths: ['/main.tex'],
      },
    })

    expect(event.validateSync()).to.equal(undefined)
  })
})
