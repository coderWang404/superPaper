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

    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )

    ctx.Registry = await import(modulePath)
  })

  it('lists read-only tool definitions without implementation details', function (ctx) {
    expect(ctx.Registry.listToolDefinitions()).to.deep.include({
      name: 'project.read_file',
      description: 'Read a text document from the current project.',
      access: 'read',
      requiresApproval: false,
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
})
