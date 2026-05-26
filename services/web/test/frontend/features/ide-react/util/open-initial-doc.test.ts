import { expect } from 'chai'
import sinon from 'sinon'
import { openPreferredOrFallbackDoc } from '../../../../../frontend/js/features/ide-react/util/open-initial-doc'

describe('openPreferredOrFallbackDoc', function () {
  it('falls back when the stored document id no longer exists', async function () {
    const fallbackDoc = { _id: 'root-doc' }
    const openDocWithId = sinon.stub()
    openDocWithId.withArgs('stale-doc').resolves(undefined)
    openDocWithId.withArgs('root-doc').resolves(fallbackDoc)

    const opened = await openPreferredOrFallbackDoc({
      preferredDocId: 'stale-doc',
      fallbackDocId: 'root-doc',
      openDocWithId,
    })

    expect(opened).to.equal(fallbackDoc)
    expect(openDocWithId).to.have.been.calledWith('stale-doc')
    expect(openDocWithId).to.have.been.calledWith('root-doc')
  })

  it('keeps the stored document when it opens successfully', async function () {
    const storedDoc = { _id: 'stored-doc' }
    const openDocWithId = sinon.stub().withArgs('stored-doc').resolves(storedDoc)

    const opened = await openPreferredOrFallbackDoc({
      preferredDocId: 'stored-doc',
      fallbackDocId: 'root-doc',
      openDocWithId,
    })

    expect(opened).to.equal(storedDoc)
    expect(openDocWithId).to.have.been.calledOnceWith('stored-doc')
  })
})
