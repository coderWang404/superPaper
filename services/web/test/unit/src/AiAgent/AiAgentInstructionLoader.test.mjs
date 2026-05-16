import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentInstructionLoader.mjs'

describe('AiAgentInstructionLoader', function () {
  beforeEach(async function (ctx) {
    ctx.ProjectEntityHandler = {
      promises: {
        getAllDocs: sinon.stub().resolves({
          '/AGENTS.md': {
            lines: ['Global project instruction'],
          },
          '/chapters/AGENTS.md': {
            lines: ['Chapter instruction'],
          },
          '/chapters/SUPERPAPER_AGENTS.md': {
            lines: ['superPaper-specific instruction'],
          },
          '/chapters/intro.tex': {
            lines: ['\\section{Intro}'],
          },
        }),
      },
    }
    ctx.SettingsManager = {
      listEnabledInstructionProfiles: sinon.stub().resolves([]),
    }

    vi.doMock(
      '../../../../app/src/Features/Project/ProjectEntityHandler',
      () => ({
        default: ctx.ProjectEntityHandler,
      })
    )
    vi.doMock(
      '../../../../app/src/Features/AiAgent/AiAgentSettingsManager',
      () => ctx.SettingsManager
    )

    ctx.Loader = await import(modulePath)
  })

  it('loads root and nearest directory instruction files in order', async function (ctx) {
    const result = await ctx.Loader.loadAgentInstructions({
      projectId: 'project-id',
      currentPath: '/chapters/intro.tex',
    })

    expect(result.sources.map(source => source.path)).to.deep.equal([
      '/AGENTS.md',
      '/chapters/AGENTS.md',
      '/chapters/SUPERPAPER_AGENTS.md',
    ])
    expect(result.sources[0].sha256).to.match(/^[a-f0-9]{64}$/)
    expect(result.truncated).to.equal(false)
  })

  it('loads enabled instruction profiles before project instruction files', async function (ctx) {
    ctx.SettingsManager.listEnabledInstructionProfiles.resolves([
      {
        scope: 'global',
        name: 'Global Agent Rules',
        content: 'Never expose secrets.',
      },
    ])

    const result = await ctx.Loader.loadAgentInstructions({
      projectId: 'project-id',
      currentPath: '/chapters/intro.tex',
    })

    expect(result.sources.map(source => source.path)).to.deep.equal([
      'Global Agent Rules',
      '/AGENTS.md',
      '/chapters/AGENTS.md',
      '/chapters/SUPERPAPER_AGENTS.md',
    ])
    expect(result.sources[0]).to.include({
      type: 'instruction-profile',
      scope: 'global',
    })
  })

  it('respects the instruction byte budget', async function (ctx) {
    const result = await ctx.Loader.loadAgentInstructions({
      projectId: 'project-id',
      currentPath: '/chapters/intro.tex',
      maxBytes: 10,
    })

    expect(result.sources).to.have.length(1)
    expect(Buffer.byteLength(result.sources[0].content, 'utf8')).to.equal(10)
    expect(result.truncated).to.equal(true)
  })

  it('builds deterministic candidate paths', function (ctx) {
    expect(ctx.Loader.instructionCandidatePaths('/chapters/intro.tex')).to.deep.equal([
      '/AGENTS.md',
      '/SUPERPAPER_AGENTS.md',
      '/chapters/AGENTS.md',
      '/chapters/SUPERPAPER_AGENTS.md',
    ])
  })
})
