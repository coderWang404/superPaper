import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import sinon from 'sinon'

import DocumentCompiler from '../../../../../frontend/js/features/pdf-preview/util/compiler'

describe('DocumentCompiler', function () {
  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
    sinon.restore()
  })

  function makeCompiler() {
    return new DocumentCompiler({
      compilingRef: { current: false },
      projectId: 'project-one',
      setChangedAt: sinon.stub(),
      setCompiling: sinon.stub(),
      setData: sinon.stub(),
      setFirstRenderDone: sinon.stub(),
      setDeliveryLatencies: sinon.stub(),
      setError: sinon.stub(),
      cleanupCompileResult: sinon.stub(),
      signal: AbortSignal.timeout(30_000),
      openDocs: {
        awaitBufferedOps: sinon.stub().resolves(),
      } as any,
    })
  }

  it('falls back to a full compile after a failed compile result', async function () {
    const compiler = makeCompiler()
    const compileStatuses = ['failure', 'success']
    fetchMock.post('express:/project/:projectId/compile', () => {
      return new Response(
        JSON.stringify({
          status: compileStatuses.shift(),
          outputFiles: [],
          pdfCachingMinChunkSize: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    })

    await compiler.compile()
    expect(compiler.error).to.equal('failure')
    await compiler.compile()

    const secondRequest = fetchMock.callHistory.calls()[1].options
    const secondBody = JSON.parse(secondRequest.body as string)
    expect(secondBody.incrementalCompilesEnabled).to.equal(false)
  })
})
