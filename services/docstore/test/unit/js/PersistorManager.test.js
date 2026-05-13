import { describe, expect, it, vi } from 'vitest'

const modulePath = '../../../app/js/PersistorManager.js'

describe('PersistorManager', () => {
  class FakePersistor {
    async sendStream() {
      return 'sent'
    }
  }

  describe('configured', () => {
    it('should return fake persistor', async () => {
      const Settings = {
        docstore: {
          backend: 'gcs',
          bucket: 'wombat',
        },
      }
      vi.doMock('@superpaper/settings', () => ({
        default: Settings,
      }))
      vi.doMock('@superpaper/object-persistor', () => ({
        default: () => new FakePersistor(),
      }))
      vi.doMock('@superpaper/metrics', () => ({ default: {} }))
      const PersistorManger = (await import(modulePath)).default

      expect(PersistorManger).to.be.instanceof(FakePersistor)
      expect(PersistorManger.sendStream()).to.eventually.equal('sent')
    })
  })

  describe('not configured', () => {
    it('should return abstract persistor', async () => {
      const Settings = {
        docstore: {
          backend: undefined,
          bucket: 'wombat',
        },
      }
      vi.doMock('@superpaper/settings', () => ({
        default: Settings,
      }))
      vi.doMock('@superpaper/object-persistor', () => ({
        default: () => new FakePersistor(),
      }))
      vi.doMock('@superpaper/metrics', () => ({ default: {} }))
      const PersistorManger = (await import(modulePath)).default

      expect(PersistorManger.constructor.name).to.equal('AbstractPersistor')
      expect(PersistorManger.sendStream()).to.eventually.be.rejectedWith(
        /method not implemented in persistor/
      )
    })
  })
})
