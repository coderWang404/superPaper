import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/ClineAgentRuntimeAdapter.mjs'

async function collect(generator) {
  const values = []
  for await (const value of generator) {
    values.push(value)
  }
  return values
}

describe('ClineAgentRuntimeAdapter', function () {
  beforeEach(async function (ctx) {
    ctx.workspaceRoot = '/tmp/superpaper-workspace/project-1/workspace'
    ctx.runtime = {
      run: sinon.stub().returns(
        (async function* () {
          yield {
            type: 'message',
            role: 'assistant',
            content: 'Reading files',
          }
          yield {
            type: 'tool',
            name: 'read_file',
            input: { path: 'main.tex' },
            output: 'ok',
          }
          yield { type: 'assistant', content: 'Updated the paper.' }
        })()
      ),
      dispose: sinon.stub().resolves(),
    }
    ctx.ClineCore = {
      start: sinon.stub().returns(ctx.runtime),
    }
    ctx.ProjectWorkspaceManager = {
      getWorkspaceRoot: sinon.stub().returns(ctx.workspaceRoot),
    }
    ctx.ProjectCheckpointService = {
      createCheckpoint: sinon
        .stub()
        .onFirstCall()
        .resolves({ commitHash: 'before-commit' })
        .onSecondCall()
        .resolves({ commitHash: 'after-commit' }),
      diffWorktree: sinon.stub().resolves('diff --git a/main.tex b/main.tex'),
    }
    vi.doMock('@cline/sdk', () => ({
      ClineCore: ctx.ClineCore,
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectWorkspaceManager.mjs',
      () => ({
        default: ctx.ProjectWorkspaceManager,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectCheckpointService.mjs',
      () => ({
        default: ctx.ProjectCheckpointService,
      })
    )
    ctx.Adapter = await import(modulePath)
  })

  afterEach(function () {
    vi.resetModules()
  })

  it('runs ClineCore in the project workspace with spawn/team features disabled', async function (ctx) {
    const events = await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
        },
      })
    )

    expect(ctx.ProjectWorkspaceManager.getWorkspaceRoot).to.have.been.calledWith(
      'project-1'
    )
    expect(ctx.ClineCore.start).to.have.been.calledWith(
      sinon.match({
        config: sinon.match({
          cwd: ctx.workspaceRoot,
          workspaceRoot: ctx.workspaceRoot,
          enableSpawnAgent: false,
          enableAgentTeams: false,
        }),
        provider: sinon.match({
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
        }),
      })
    )
    expect(ctx.runtime.run).to.have.been.calledWith({
      prompt: 'Improve abstract',
    })
    expect(events.map(event => event.type)).to.deep.equal([
      'checkpoint_created',
      'message',
      'tool_call',
      'tool_result',
      'message',
      'workspace_diff',
      'checkpoint_created',
    ])
    expect(events[0].payload.phase).to.equal('before')
    expect(events[6].payload.phase).to.equal('after')
  })

  it('disposes the Cline runtime after a run', async function (ctx) {
    await collect(
      ctx.Adapter.runTurn({
        projectId: 'project-1',
        userId: 'user-1',
        sessionId: 'session-1',
        prompt: 'Improve abstract',
        provider: {
          baseURL: 'https://ai.example.test/v1',
          apiKey: 'plain-key',
          model: 'claude-sonnet-4.5',
        },
      })
    )

    expect(ctx.runtime.dispose).to.have.been.calledOnce
  })
})
