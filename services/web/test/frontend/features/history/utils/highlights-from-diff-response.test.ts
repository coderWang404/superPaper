import { expect } from 'chai'
import { highlightsFromDiffResponse } from '../../../../../frontend/js/features/history/utils/highlights-from-diff-response'
import type { DocDiffChunk } from '../../../../../frontend/js/features/history/services/types/doc'

describe('highlightsFromDiffResponse', function () {
  it('keeps malformed diff chunks without meta in the document without highlighting them', function () {
    const chunks: DocDiffChunk[] = [
      { u: 'Existing ' },
      { i: 'inserted' },
      { u: ' text' },
      { d: ' removed' },
    ]

    const result = highlightsFromDiffResponse(chunks, key => key)

    expect(result.doc).to.equal('Existing inserted text removed')
    expect(result.highlights).to.deep.equal([])
  })
})
