import { expect, vi } from 'vitest'
import sinon from 'sinon'

const modulePath =
  '../../../../app/src/Features/AiAgent/AiAgentSkillImportManager.mjs'

describe('AiAgentSkillImportManager', function () {
  beforeEach(async function (ctx) {
    ctx.fetchStream = sinon.stub().callsFake(async function* () {
      yield Buffer.from(`---
name: literature-review
description: Review related work.
---

# Literature Review
`)
    })
    vi.doMock('@superpaper/fetch-utils', () => ({
      fetchStream: ctx.fetchStream,
    }))
    ctx.Manager = await import(modulePath)
  })

  it('normalizes a GitHub SKILL.md file URL to raw GitHub content', async function (ctx) {
    const preview = await ctx.Manager.previewAgentSkillImport({
      sourceType: 'github_file',
      url: 'https://github.com/example/skills/blob/main/SKILL.md',
    })

    expect(ctx.fetchStream).to.have.been.calledWith(
      'https://raw.githubusercontent.com/example/skills/main/SKILL.md'
    )
    expect(preview.metadata).to.deep.equal({
      name: 'literature-review',
      description: 'Review related work.',
      displayName: '',
    })
    expect(preview.content).to.contain('# Literature Review')
    expect(preview.sha256).to.match(/^[a-f0-9]{64}$/)
  })

  it('normalizes a GitHub skill directory URL by appending SKILL.md', async function (ctx) {
    await ctx.Manager.previewAgentSkillImport({
      sourceType: 'github_file',
      url: 'https://github.com/example/skills/tree/main/latex-review',
    })

    expect(ctx.fetchStream).to.have.been.calledWith(
      'https://raw.githubusercontent.com/example/skills/main/latex-review/SKILL.md'
    )
  })

  it('rejects non-raw arbitrary HTTPS URLs', async function (ctx) {
    let error
    try {
      await ctx.Manager.previewAgentSkillImport({
        sourceType: 'url',
        url: 'https://example.com/SKILL.md',
      })
    } catch (err) {
      error = err
    }

    expect(error).to.exist
    expect(error.name).to.equal('AgentSkillImportValidationError')
    expect(ctx.fetchStream).to.not.have.been.called
  })

  it('returns a validation error when a SKILL.md download times out', async function (ctx) {
    vi.useFakeTimers()
    try {
      ctx.fetchStream.callsFake((_url, opts) => {
        let pending = true
        return {
          [Symbol.asyncIterator]() {
            return this
          },
          async next() {
            if (!pending) {
              return { done: true }
            }
            pending = false
            await new Promise(resolve => {
              opts.signal.addEventListener('abort', resolve, { once: true })
            })
            throw opts.signal.reason
          },
        }
      })
      const promise = ctx.Manager.previewAgentSkillImport({
        sourceType: 'url',
        url: 'https://raw.githubusercontent.com/example/repo/main/SKILL.md',
      })
      const observedError = promise.then(
        () => null,
        err => err
      )
      await vi.advanceTimersByTimeAsync(20_001)

      const error = await observedError

      expect(error).to.exist
      expect(error.name).to.equal('AgentSkillImportValidationError')
      expect(error.message).to.equal('SKILL.md download timed out')
    } finally {
      vi.useRealTimers()
    }
  })
})
