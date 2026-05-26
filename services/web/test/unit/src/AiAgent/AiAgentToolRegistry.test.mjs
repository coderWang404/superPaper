import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentToolRegistry.mjs'

describe('AiAgentToolRegistry', function () {
  beforeEach(async function (ctx) {
    ctx.ProjectEntityHandler = {
      promises: {
        getAllDocs: sinon.stub().resolves({
          '/main.tex': {
            _id: 'doc-main',
            lines: [
              '\\documentclass{article}',
              '\\begin{document}',
              '\\input{sections/intro}',
              '\\label{sec:intro}',
              '\\cite{paper-one}',
            ],
            rev: 3,
          },
          '/refs.bib': {
            _id: 'doc-bib',
            lines: ['@article{paper-one,', 'title={Example}', '}'],
          },
          '/notes.txt': {
            _id: 'doc-notes',
            lines: ['internal notes'],
          },
        }),
        getAllFiles: sinon.stub().resolves({
          '/figures/plot.pdf': { name: 'plot.pdf' },
        }),
      },
    }
    ctx.createPatch = sinon.stub().resolves({
      id: 'patch-one',
      status: 'pending',
      summary: 'Update wording',
      operations: [{ type: 'replace_text', path: '/main.tex' }],
    })
    ctx.CompileManager = {
      promises: {
        compile: sinon.stub().resolves({
          status: 'success',
          buildId: 'build-one',
          outputFiles: [{ path: 'output.pdf', type: 'pdf', size: 123 }],
          validationProblems: [],
          timings: { compileE2E: 42 },
        }),
      },
    }
    ctx.AgentEvent = {
      findOne: sinon.stub().returns({
        sort: sinon.stub().returns({
          exec: sinon.stub().resolves({
            payload: {
              patchId: 'patch-one',
              result: { ok: true, status: 'success' },
            },
          }),
        }),
      }),
    }

    vi.doMock('../../../../app/src/models/AgentEvent', () => ({
      AgentEvent: ctx.AgentEvent,
    }))
    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentPatchManager',
      () => ({
        createPatch: ctx.createPatch,
      })
    )
    vi.doMock('../../../../app/src/Features/Compile/CompileManager', () => ({
      default: ctx.CompileManager,
    }))

    ctx.Registry = await import(modulePath)
  })

  it('lists read-only tool definitions without implementation details', function (ctx) {
    const tools = ctx.Registry.listToolDefinitions()
    expect(tools.find(tool => tool.name === 'project.read_file')).to.include({
      name: 'project.read_file',
      description: 'Read a text document from the current project.',
      access: 'read',
      requiresApproval: false,
      category: 'project',
      riskLevel: 'low',
    })
    expect(tools.find(tool => tool.name === 'patch.propose')).to.include({
      name: 'patch.propose',
      description:
        'Create a pending replace_text, create_doc, delete_doc, rename_entity, or move_entity patch for user review. This does not edit files.',
      access: 'write',
      requiresApproval: true,
      category: 'patch',
      riskLevel: 'medium',
    })
    expect(tools.find(tool => tool.name === 'compile.run')).to.include({
      name: 'compile.run',
      description: 'Run a controlled project compile and return a compact result.',
      access: 'read',
      requiresApproval: false,
      category: 'compile',
      riskLevel: 'medium',
    })
  })

  it('includes model-facing input schemas and examples for tool calls', function (ctx) {
    const patchTool = ctx.Registry.listToolDefinitions().find(
      tool => tool.name === 'patch.propose'
    )

    expect(patchTool.inputSchema.type).to.equal('object')
    expect(patchTool.inputSchema.required).to.include('operations')
    expect(JSON.stringify(patchTool.inputSchema)).to.include('create_doc')
    expect(patchTool.inputExample).to.deep.equal({
      summary: 'Create a smoke-test file',
      operations: [
        {
          type: 'create_doc',
          path: '/agent-real-channel-smoke.tex',
          content: 'ROOT_CHANNEL_AGENT_ACT_OK\n',
        },
      ],
    })
  })

  it('lists project docs and files', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'project.list_files',
      projectId: 'project-id',
      input: { extensions: ['.tex', '.pdf'] },
    })

    expect(result.docs.map(doc => doc.path)).to.deep.equal(['/main.tex'])
    expect(result.files.map(file => file.path)).to.deep.equal([
      '/figures/plot.pdf',
    ])
  })

  it('reads project text docs with hashes and truncation metadata', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'project.read_file',
      projectId: 'project-id',
      input: { path: 'main.tex', maxChars: 20 },
    })

    expect(result).to.include({
      path: '/main.tex',
      docId: 'doc-main',
      rev: 3,
      truncated: true,
    })
    expect(result.content.length).to.equal(20)
    expect(result.sha256).to.match(/^[a-f0-9]{64}$/)
  })

  it('blocks sensitive project paths', async function (ctx) {
    await expect(
      ctx.Registry.executeTool({
        name: 'project.read_file',
        projectId: 'project-id',
        input: { path: '渠道.txt' },
      })
    ).to.be.rejectedWith(ctx.Registry.AiAgentToolError)
  })

  it('searches project docs by plain substring', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'project.search',
      projectId: 'project-id',
      input: { query: 'cite', maxResults: 5 },
    })

    expect(result.results).to.deep.equal([
      {
        path: '/main.tex',
        line: 5,
        preview: '\\cite{paper-one}',
      },
    ])
    expect(result.truncated).to.equal(false)
  })

  it('builds a compact latex project map', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'project.get_map',
      projectId: 'project-id',
      input: {},
    })

    const main = result.files.find(file => file.path === '/main.tex')
    const refs = result.files.find(file => file.path === '/refs.bib')
    expect(result.rootDoc).to.equal('/main.tex')
    expect(main.includes).to.deep.equal(['sections/intro'])
    expect(main.labels).to.deep.equal(['sec:intro'])
    expect(main.citations).to.deep.equal(['paper-one'])
    expect(refs.bibKeys).to.deep.equal(['paper-one'])
  })

  it('creates pending patches instead of editing files directly', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'patch.propose',
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      input: {
        summary: 'Update wording',
        operations: [
          {
            type: 'replace_text',
            path: '/main.tex',
            oldText: 'old',
            newText: 'new',
          },
        ],
      },
    })

    expect(ctx.createPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      summary: 'Update wording',
      operations: [
        {
          type: 'replace_text',
          path: '/main.tex',
          oldText: 'old',
          newText: 'new',
        },
      ],
    })
    expect(result).to.deep.equal({
      patchId: 'patch-one',
      requiresApproval: true,
      patch: {
        id: 'patch-one',
        status: 'pending',
        summary: 'Update wording',
        operations: [{ type: 'replace_text', path: '/main.tex' }],
      },
    })
  })

  it('accepts create_doc operations for pending patches', async function (ctx) {
    await ctx.Registry.executeTool({
      name: 'patch.propose',
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      input: {
        summary: 'Create methods',
        operations: [
          {
            type: 'create_doc',
            path: '/sections/methods.tex',
            content: '\\section{Methods}',
          },
        ],
      },
    })

    expect(ctx.createPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      summary: 'Create methods',
      operations: [
        {
          type: 'create_doc',
          path: '/sections/methods.tex',
          content: '\\section{Methods}',
        },
      ],
    })
  })

  it('accepts delete_doc operations for pending patches', async function (ctx) {
    await ctx.Registry.executeTool({
      name: 'patch.propose',
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      input: {
        summary: 'Remove obsolete note',
        operations: [
          {
            type: 'delete_doc',
            path: '/notes.txt',
          },
        ],
      },
    })

    expect(ctx.createPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      summary: 'Remove obsolete note',
      operations: [
        {
          type: 'delete_doc',
          path: '/notes.txt',
        },
      ],
    })
  })

  it('accepts rename_entity operations for pending patches', async function (ctx) {
    await ctx.Registry.executeTool({
      name: 'patch.propose',
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      input: {
        summary: 'Rename main',
        operations: [
          {
            type: 'rename_entity',
            path: '/main.tex',
            newName: 'paper.tex',
          },
        ],
      },
    })

    expect(ctx.createPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      summary: 'Rename main',
      operations: [
        {
          type: 'rename_entity',
          path: '/main.tex',
          newName: 'paper.tex',
        },
      ],
    })
  })

  it('accepts move_entity operations for pending patches', async function (ctx) {
    await ctx.Registry.executeTool({
      name: 'patch.propose',
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      input: {
        summary: 'Move main',
        operations: [
          {
            type: 'move_entity',
            path: '/main.tex',
            targetFolderPath: '/sections',
          },
        ],
      },
    })

    expect(ctx.createPatch).to.have.been.calledWith({
      projectId: 'project-id',
      userId: 'user-id',
      sessionId: 'session-id',
      summary: 'Move main',
      operations: [
        {
          type: 'move_entity',
          path: '/main.tex',
          targetFolderPath: '/sections',
        },
      ],
    })
  })

  it('returns the last compile result recorded on the agent session', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'compile.get_last_result',
      projectId: 'project-id',
      sessionId: 'session-id',
      input: {},
    })

    expect(ctx.AgentEvent.findOne).to.have.been.calledWith({
      projectId: 'project-id',
      sessionId: 'session-id',
      type: 'compile_result',
    })
    expect(result).to.deep.equal({
      available: true,
      patchId: 'patch-one',
      result: { ok: true, status: 'success' },
    })
  })

  it('runs a controlled project compile', async function (ctx) {
    const result = await ctx.Registry.executeTool({
      name: 'compile.run',
      projectId: 'project-id',
      userId: 'user-id',
      input: { stopOnFirstError: true },
    })

    expect(ctx.CompileManager.promises.compile).to.have.been.calledWith(
      'project-id',
      'user-id',
      {
        isAutoCompile: false,
        fileLineErrors: true,
        stopOnFirstError: true,
      }
    )
    expect(result).to.include({
      ok: true,
      status: 'success',
      buildId: 'build-one',
    })
    expect(result.outputFiles).to.deep.equal([
      { path: 'output.pdf', type: 'pdf', size: 123 },
    ])
  })
})
