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

  it('accepts patch rejected events emitted by selected hunk review', function () {
    const event = new AgentEvent({
      sessionId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      sequence: 2,
      type: 'patch_rejected',
      payload: {
        patchId: 'patch-one',
        hunkIds: ['op-0001:h-0001:abc123def456'],
      },
    })

    expect(event.validateSync()).to.equal(undefined)
  })

  it('accepts patch rolled back events emitted by patch rollback', function () {
    const event = new AgentEvent({
      sessionId: new mongoose.Types.ObjectId(),
      projectId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      sequence: 3,
      type: 'patch_rolled_back',
      payload: {
        patchId: 'patch-one',
        operations: [{ type: 'restore_doc_text', path: '/main.tex' }],
      },
    })

    expect(event.validateSync()).to.equal(undefined)
  })
})
