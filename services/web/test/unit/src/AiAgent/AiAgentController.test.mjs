import { expect, vi } from 'vitest'
import sinon from 'sinon'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath = '../../../../app/src/Features/AiAgent/AiAgentController.mjs'

function jsonBody(res) {
  return JSON.parse(res.body)
}

describe('AiAgentController', function () {
  beforeEach(async function (ctx) {
    ctx.config = {
      permissionProfile: {
        id: 'project-agent-default',
        writeToolsRequireApproval: true,
        externalToolsEnabled: false,
        actRequiredForWriteTools: true,
      },
      tools: [],
    }
    ctx.session = {
      id: 'session-id',
      projectId: 'project-id',
      userId: 'user-id',
      status: 'planning',
      mode: 'plan',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      task: 'Explain',
      permissionProfileId: 'project-agent-default',
    }
    ctx.Runtime = {
      getAgentConfig: sinon.stub().resolves(ctx.config),
      createSession: sinon.stub().resolves(ctx.session),
      startAct: sinon.stub().resolves({
        ...ctx.session,
        mode: 'act',
        status: 'ready_for_act',
      }),
      runTurn: sinon.stub().callsFake(async ({ onEvent }) => {
        await onEvent({
          id: 'event-1',
          sessionId: 'session-id',
          sequence: 1,
          type: 'message',
          payload: { role: 'assistant', content: 'Working' },
        })
        return {
          session: { ...ctx.session, status: 'completed' },
          answer: 'Done',
        }
      }),
      rollbackSessionToCheckpoint: sinon.stub().resolves({
        session: ctx.session,
        restoredCommitHash: 'a'.repeat(40),
        changedPaths: ['/main.tex'],
        event: {
          id: 'event-restore',
          sessionId: 'session-id',
          sequence: 4,
          type: 'checkpoint_restored',
          payload: {
            commitHash: 'a'.repeat(40),
            changedPaths: ['/main.tex'],
          },
        },
      }),
      AiAgentError: class AiAgentError extends Error {
        constructor(code, message) {
          super(message)
          this.name = 'AiAgentError'
          this.code = code
        }
      },
    }
    ctx.PatchManager = {
      applyPatch: sinon.stub().resolves({
        id: 'patch-one',
        status: 'applied',
      }),
      rejectPatch: sinon.stub().resolves({
        id: 'patch-one',
        status: 'rejected',
      }),
      rollbackPatch: sinon.stub().resolves({
        id: 'patch-one',
        status: 'rolled_back',
      }),
      AiAgentPatchError: class AiAgentPatchError extends Error {
        constructor(code, message) {
          super(message)
          this.name = 'AiAgentPatchError'
          this.code = code
        }
      },
    }
    ctx.SessionManager = {
      getLoggedInUserId: sinon.stub().returns('user-id'),
    }

    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentRuntime',
      () => ctx.Runtime
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPatchManager',
      () => ctx.PatchManager
    )
    vi.doMock(
      '../../../../app/src/Features/Authentication/SessionManager',
      () => ({
        default: ctx.SessionManager,
      })
    )

    ctx.Controller = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.req.params.Project_id = 'project-id'
    ctx.res = new MockResponse(vi)
    ctx.next = sinon.stub()
  })

  it('starts act mode for a planned session', async function (ctx) {
    ctx.req.params.sessionId = 'session-id'

    await ctx.Controller.startAct(ctx.req, ctx.res, ctx.next)

    expect(ctx.Runtime.startAct).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
    })
    expect(jsonBody(ctx.res)).to.deep.equal({
      session: {
        ...ctx.session,
        mode: 'act',
        status: 'ready_for_act',
      },
    })
  })

  it('returns agent config', async function (ctx) {
    await ctx.Controller.config(ctx.req, ctx.res, ctx.next)

    expect(ctx.Runtime.getAgentConfig).to.have.been.calledWith({
      projectId: 'project-id',
    })
    expect(jsonBody(ctx.res)).to.deep.equal(ctx.config)
  })

  it('creates an agent session for the logged in user', async function (ctx) {
    ctx.req.body = {
      task: 'Explain the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    }

    await ctx.Controller.createSession(ctx.req, ctx.res, ctx.next)

    expect(ctx.Runtime.createSession).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      task: 'Explain the project',
      providerId: 'provider-id',
      model: 'gpt-4.1',
    })
    expect(jsonBody(ctx.res)).to.deep.equal({ session: ctx.session })
  })

  it('returns validation errors without leaking task content', async function (ctx) {
    ctx.req.body = { task: '' }

    await ctx.Controller.createSession(ctx.req, ctx.res, ctx.next)

    expect(ctx.res.statusCode).to.equal(422)
    expect(jsonBody(ctx.res)).to.deep.equal({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid agent input',
      },
    })
  })

  it('streams agent events as ndjson', async function (ctx) {
    ctx.req.params.sessionId = 'session-id'
    ctx.req.body = {
      prompt: 'Explain',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
    }
    ctx.res.write = sinon.stub()
    ctx.res.end = sinon.stub()

    await ctx.Controller.turnStream(ctx.req, ctx.res, ctx.next)

    expect(ctx.Runtime.runTurn).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      prompt: 'Explain',
      providerId: 'provider-id',
      model: 'gpt-4.1',
      selection: { path: '/main.tex', text: 'Hello' },
      signal: sinon.match.instanceOf(AbortSignal),
      onEvent: sinon.match.func,
    })
    expect(ctx.res.headers['Content-Type']).to.equal(
      'application/x-ndjson; charset=utf-8'
    )
    expect(ctx.res.write.firstCall.args[0]).to.equal(
      JSON.stringify({
        type: 'event',
        event: {
          id: 'event-1',
          sessionId: 'session-id',
          sequence: 1,
          type: 'message',
          payload: { role: 'assistant', content: 'Working' },
        },
      }) + '\n'
    )
    expect(ctx.res.write.secondCall.args[0]).to.equal(
      JSON.stringify({
        type: 'done',
        session: { ...ctx.session, status: 'completed' },
        answer: 'Done',
      }) + '\n'
    )
    expect(ctx.res.end).to.have.been.calledOnce
  })

  it('passes a response-close abort signal to agent turns', async function (ctx) {
    let closeHandler
    ctx.res.on = sinon.stub().callsFake((event, handler) => {
      if (event === 'close') {
        closeHandler = handler
      }
      return ctx.res
    })
    ctx.Runtime.runTurn.callsFake(async ({ signal }) => {
      expect(signal).to.be.instanceOf(AbortSignal)
      expect(signal.aborted).to.equal(false)
      closeHandler()
      expect(signal.aborted).to.equal(true)
      return {
        session: { ...ctx.session, status: 'completed' },
        answer: 'Done',
      }
    })
    ctx.req.params.sessionId = 'session-id'
    ctx.req.body = {
      prompt: 'Explain',
    }
    ctx.res.write = sinon.stub()
    ctx.res.end = sinon.stub()

    await ctx.Controller.turnStream(ctx.req, ctx.res, ctx.next)

    expect(ctx.Runtime.runTurn.firstCall.args[0].signal).to.be.instanceOf(
      AbortSignal
    )
  })

  it('applies a reviewed patch for the logged in user', async function (ctx) {
    ctx.req.params.patchId = 'patch-one'

    await ctx.Controller.applyPatch(ctx.req, ctx.res, ctx.next)

    expect(ctx.PatchManager.applyPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      patchId: 'patch-one',
    })
    expect(jsonBody(ctx.res)).to.deep.equal({
      patch: {
        id: 'patch-one',
        status: 'applied',
      },
    })
  })

  it('rejects a reviewed patch for the logged in user', async function (ctx) {
    ctx.req.params.patchId = 'patch-one'

    await ctx.Controller.rejectPatch(ctx.req, ctx.res, ctx.next)

    expect(ctx.PatchManager.rejectPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      patchId: 'patch-one',
    })
    expect(jsonBody(ctx.res)).to.deep.equal({
      patch: {
        id: 'patch-one',
        status: 'rejected',
      },
    })
  })

  it('rolls back an applied patch for the logged in user', async function (ctx) {
    ctx.req.params.patchId = 'patch-one'

    await ctx.Controller.rollbackPatch(ctx.req, ctx.res, ctx.next)

    expect(ctx.PatchManager.rollbackPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      patchId: 'patch-one',
    })
    expect(jsonBody(ctx.res)).to.deep.equal({
      patch: {
        id: 'patch-one',
        status: 'rolled_back',
      },
    })
  })

  it('rolls a direct agent session back to a checkpoint for the logged in user', async function (ctx) {
    ctx.req.params.sessionId = 'session-id'
    ctx.req.body = { commitHash: 'a'.repeat(40) }

    await ctx.Controller.rollbackSessionCheckpoint(ctx.req, ctx.res, ctx.next)

    expect(ctx.Runtime.rollbackSessionToCheckpoint).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      commitHash: 'a'.repeat(40),
    })
    expect(jsonBody(ctx.res)).to.deep.equal({
      session: ctx.session,
      restoredCommitHash: 'a'.repeat(40),
      changedPaths: ['/main.tex'],
      event: {
        id: 'event-restore',
        sessionId: 'session-id',
        sequence: 4,
        type: 'checkpoint_restored',
        payload: {
          commitHash: 'a'.repeat(40),
          changedPaths: ['/main.tex'],
        },
      },
    })
  })
})
