import { expect, describe, it, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import Path from 'node:path'

const require = createRequire(import.meta.url)
const settingsPath = Path.join(
  import.meta.dirname,
  '../../../config/settings.defaults.cjs'
)
const originalDownloadHost = process.env.DOWNLOAD_HOST

function loadSettingsWithDownloadHost(downloadHost) {
  if (downloadHost == null) {
    delete process.env.DOWNLOAD_HOST
  } else {
    process.env.DOWNLOAD_HOST = downloadHost
  }

  delete require.cache[require.resolve(settingsPath)]
  return require(settingsPath)
}

describe('CLSI default settings', () => {
  afterEach(() => {
    if (originalDownloadHost == null) {
      delete process.env.DOWNLOAD_HOST
    } else {
      process.env.DOWNLOAD_HOST = originalDownloadHost
    }
    delete require.cache[require.resolve(settingsPath)]
  })

  it('normalizes bare DOWNLOAD_HOST values into absolute output URLs', () => {
    const settings = loadSettingsWithDownloadHost('clsi-nginx')

    expect(settings.apis.clsi.downloadHost).to.equal('http://clsi-nginx:8080')
  })

  it('preserves absolute DOWNLOAD_HOST values', () => {
    const settings = loadSettingsWithDownloadHost('http://clsi-nginx:8080')

    expect(settings.apis.clsi.downloadHost).to.equal('http://clsi-nginx:8080')
  })

  it('keeps the localhost default when DOWNLOAD_HOST is unset', () => {
    const settings = loadSettingsWithDownloadHost(null)

    expect(settings.apis.clsi.downloadHost).to.equal('http://localhost:8080')
  })
})
