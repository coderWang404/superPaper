import { beforeEach, describe, expect, it, vi } from 'vitest'

const modulePath = '../../../app/js/KeyBuilder.js'

describe('KeybuilderTests', function () {
  let KeyBuilder
  let settings
  const key = 'wombat/potato'

  beforeEach(async function () {
    settings = {
      filestore: {
        stores: {
          global_blobs: '/buckets/blobs',
          project_blobs: '/buckets/project_blobs',
        },
      },
    }

    vi.doMock('@superpaper/settings', () => ({
      default: settings,
    }))

    KeyBuilder = (await import(modulePath)).default
  })

  describe('cachedKey', function () {
    it('should add the format to the key', function () {
      const opts = { format: 'png' }
      const newKey = KeyBuilder.addCachingToKey(key, opts)
      expect(newKey).to.equal(`${key}-converted-cache/format-png`)
    })

    it('should add the style to the key', function () {
      const opts = { style: 'thumbnail' }
      const newKey = KeyBuilder.addCachingToKey(key, opts)
      expect(newKey).to.equal(`${key}-converted-cache/style-thumbnail`)
    })

    it('should add format first, then style', function () {
      const opts = {
        style: 'thumbnail',
        format: 'png',
      }
      const newKey = KeyBuilder.addCachingToKey(key, opts)
      expect(newKey).to.equal(
        `${key}-converted-cache/format-png-style-thumbnail`
      )
    })
  })

  describe('history blob keys', function () {
    it('builds project blob keys without forcing filesystem subdirectories', function () {
      const req = {
        params: {
          historyId: '6a03e76f4a30819dff2ed36c',
          hash: '5b889ef3cf71c83a4c027c4e4dc3d1a106b27809',
        },
      }
      const next = vi.fn()

      KeyBuilder.projectBlobFileKeyMiddleware(req, {}, next)

      expect(req.bucket).to.equal('/buckets/project_blobs')
      expect(req.key).to.equal(
        'c63/de2/ffd91803a4f67e30a6/5b/889ef3cf71c83a4c027c4e4dc3d1a106b27809'
      )
      expect(req.useSubdirectories).to.be.undefined
      expect(next).toHaveBeenCalled()
    })

    it('builds global blob keys without forcing filesystem subdirectories', function () {
      const req = {
        params: {
          hash: 'a304dc8732513e79ca1eab83c1896761bd0b0d06',
        },
      }
      const next = vi.fn()

      KeyBuilder.globalBlobFileKeyMiddleware(req, {}, next)

      expect(req.bucket).to.equal('/buckets/blobs')
      expect(req.key).to.equal('a3/04/dc8732513e79ca1eab83c1896761bd0b0d06')
      expect(req.useSubdirectories).to.be.undefined
      expect(next).toHaveBeenCalled()
    })
  })
})
