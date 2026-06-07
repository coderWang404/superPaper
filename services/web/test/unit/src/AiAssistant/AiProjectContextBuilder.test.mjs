import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAssistant/AiProjectContextBuilder.mjs'

describe('AiProjectContextBuilder', function () {
  beforeEach(async function (ctx) {
    ctx.ProjectEntityHandler = {
      promises: {
        getAllDocs: sinon.stub().resolves({
          '/main.tex': {
            lines: ['\\documentclass{article}', '\\begin{document}', 'Hello'],
          },
          '/refs.bib': {
            lines: ['@article{key,', 'title={Example}', '}'],
          },
          '/notes.txt': {
            lines: ['This should not be included'],
          },
        }),
      },
    }

    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )

    ctx.Builder = await import(modulePath)
  })

  it('puts selected text before project files', async function (ctx) {
    const context = await ctx.Builder.buildProjectContext('project-id', {
      selection: {
        path: '/main.tex',
        text: '\\section{Selected}',
      },
      maxChars: 10_000,
    })

    expect(context.messages[0].content).to.include('\\section{Selected}')
    expect(context.includedFiles).to.deep.equal(['/main.tex', '/refs.bib'])
    expect(context.selectionIncluded).to.equal(true)
    expect(context.truncated).to.equal(false)
  })

  it('filters unsupported file extensions', async function (ctx) {
    const context = await ctx.Builder.buildProjectContext('project-id', {
      maxChars: 10_000,
    })

    expect(context.messages.map(message => message.content).join('\n')).not.to.include(
      'This should not be included'
    )
    expect(context.includedFiles).not.to.include('/notes.txt')
  })

  it('prioritizes manuscript tex files before bibliography and style files', async function (ctx) {
    ctx.ProjectEntityHandler.promises.getAllDocs.resolves({
      '/reference.bib': {
        lines: ['@article{key,', `title={${'x'.repeat(5_000)}}`, '}'],
      },
      '/doc/pdfwidgets.sty': {
        lines: ['\\ProvidesPackage{pdfwidgets}'],
      },
      '/chapters/method.tex': {
        lines: ['\\section{Method}', 'Full manuscript text'],
      },
    })

    const context = await ctx.Builder.buildProjectContext('project-id', {
      maxChars: 300,
    })

    expect(context.messages[0].content).to.include(
      '### Project file /chapters/method.tex'
    )
    expect(context.messages[0].content).to.include('Full manuscript text')
    expect(context.includedFiles[0]).to.equal('/chapters/method.tex')
    expect(context.truncated).to.equal(true)
  })

  it('allows a zero context character budget', async function (ctx) {
    const context = await ctx.Builder.buildProjectContext('project-id', {
      maxChars: 0,
    })

    expect(context.messages).to.deep.equal([])
    expect(context.includedFiles).to.deep.equal([])
    expect(context.selectionIncluded).to.equal(false)
    expect(context.truncated).to.equal(true)
  })

  it('reports selection omitted when the context budget is exhausted before selection', async function (ctx) {
    const context = await ctx.Builder.buildProjectContext('project-id', {
      selection: {
        path: '/main.tex',
        text: '\\section{Selected}',
      },
      maxChars: 0,
    })

    expect(context.messages).to.deep.equal([])
    expect(context.selectionIncluded).to.equal(false)
    expect(context.truncated).to.equal(true)
  })

  it('respects the context character budget', async function (ctx) {
    const context = await ctx.Builder.buildProjectContext('project-id', {
      maxChars: 40,
    })

    const totalChars = context.messages.reduce(
      (sum, message) => sum + message.content.length,
      0
    )
    expect(totalChars).to.be.at.most(40)
    expect(context.truncated).to.equal(true)
  })
})
