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
