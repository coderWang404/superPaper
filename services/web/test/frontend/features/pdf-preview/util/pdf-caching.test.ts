import { expect } from 'chai'
import sinon from 'sinon'

import { fetchRange } from '../../../../../frontend/js/features/pdf-preview/util/pdf-caching'
import type { PDFRange, ProcessedPDFFile } from '../../../../../types/compile'
import type { PdfCachingMetricsFull } from '../../../../../frontend/js/features/pdf-preview/util/types'

describe('pdf caching', function () {
  afterEach(function () {
    sinon.restore()
  })

  function metrics(): PdfCachingMetricsFull {
    return {
      viewerId: 'viewer-one',
      failedCount: 0,
      failedOnce: false,
      tooMuchBandwidthCount: 0,
      tooManyRequestsCount: 0,
      cachedCount: 0,
      cachedBytes: 0,
      fetchedCount: 0,
      fetchedBytes: 0,
      latencyComputeMax: 0,
      latencyComputeTotal: 0,
      requestedCount: 0,
      requestedBytes: 0,
      oldUrlHitCount: 0,
      oldUrlMissCount: 0,
      enablePdfCaching: true,
      prefetchingEnabled: false,
      prefetchLargeEnabled: false,
      cachedUrlLookupEnabled: false,
    }
  }

  function cachedRange({
    start,
    end,
    hash,
  }: {
    start: number
    end: number
    hash: string
  }): PDFRange<Uint8Array> {
    return {
      start,
      end,
      hash,
      objectId: new Uint8Array(),
      size: end - start,
      totalUsage: 0,
    }
  }

  it('preserves equal-start cached chunk ordering when reassembling a range', async function () {
    const file: ProcessedPDFFile = {
      path: 'output.pdf',
      url: '/build/output.pdf',
      type: 'pdf',
      build: 'build-one',
      downloadURL: '/download/output.pdf',
      clsiCacheShard: 'shard-one',
      contentId: 'content-one',
      editorId: 'editor-one',
      pdfDownloadUrl: '/download/output.pdf',
      pdfUrl: '/build/output.pdf',
      size: 5,
      preprocessed: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      prefetched: [],
      ranges: [
        cachedRange({ start: 0, end: 5, hash: 'full-range' }),
        cachedRange({ start: 0, end: 3, hash: 'prefix-range' }),
      ],
    }

    const fetchStub = sinon.stub(globalThis, 'fetch')
    fetchStub
      .withArgs('/content/content-one/full-range?chunks=true', sinon.match.any)
      .resolves(
        new Response(new Uint8Array([1, 2, 3, 4, 5]), {
          headers: {
            'Content-Length': '5',
            Date: '2025-01-01T00:00:00Z',
          },
        })
      )
    fetchStub
      .withArgs(
        '/content/content-one/prefix-range?chunks=true',
        sinon.match.any
      )
      .resolves(
        new Response(new Uint8Array([9, 9, 9]), {
          headers: {
            'Content-Length': '3',
            Date: '2025-01-01T00:00:00Z',
          },
        })
      )
    fetchStub.withArgs('/build/output.pdf', sinon.match.any).resolves(
      new Response(new Uint8Array([4, 5]), {
        status: 206,
        headers: {
          'Content-Length': '2',
          Date: '2026-01-01T00:00:00Z',
        },
      })
    )

    const result = await fetchRange({
      url: '/build/output.pdf',
      start: 0,
      end: 5,
      file,
      queryForChunks: 'chunks=true',
      metrics: metrics(),
      usageScore: new Map(),
      cachedUrls: new Map(),
      verifyChunks: false,
      prefetchingEnabled: false,
      prefetchLargeEnabled: false,
      cachedUrlLookupEnabled: false,
      abortSignal: new AbortController().signal,
      canTryFromCache: () => false,
      fallbackToCacheURL: '/build/output.pdf',
    })

    expect(Array.from(result)).to.deep.equal([9, 9, 9, 4, 5])
  })
})
