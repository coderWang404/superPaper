import { vi, expect } from 'vitest'

const modulePath = '../../../../app/src/infrastructure/Features.mjs'

describe('Features', function () {
  beforeEach(async function (ctx) {
    vi.doMock('@superpaper/settings', () => ({
      default: (ctx.settings = {
        moduleImportSequence: [],
        enabledLinkedFileTypes: [],
      }),
    }))

    ctx.Features = (await import(modulePath)).default
  })

  describe('hasFeature', function () {
    it('returns the current defaults', function (ctx) {
      expect(ctx.Features.hasFeature('registration-page')).to.be.true
      expect(ctx.Features.hasFeature('registration')).to.be.true
      expect(ctx.Features.hasFeature('chat')).to.be.true
      expect(ctx.Features.hasFeature('link-sharing')).to.be.true
      expect(ctx.Features.hasFeature('github-sync')).to.be.false
      expect(ctx.Features.hasFeature('git-bridge')).to.be.false
      expect(ctx.Features.hasFeature('homepage')).to.be.false
      expect(ctx.Features.hasFeature('link-url')).to.be.false
      expect(ctx.Features.hasFeature('oauth')).to.be.false
    })

    it('enables linked file features when configured', function (ctx) {
      ctx.settings.enabledLinkedFileTypes = ['url', 'project_file']
      ctx.settings.apis = {
        linkedUrlProxy: {
          url: 'https://www.superpaper.com',
        },
      }
      expect(ctx.Features.hasFeature('linked-project-file')).to.be.true
      expect(ctx.Features.hasFeature('link-url')).to.be.true
      expect(ctx.Features.hasFeature('linked-project-output-file')).to.be.false
    })
  })
})
