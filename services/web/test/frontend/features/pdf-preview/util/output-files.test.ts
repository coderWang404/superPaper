import { expect } from 'chai'
import sinon from 'sinon'

import { handleLogFiles } from '../../../../../frontend/js/features/pdf-preview/util/output-files'
import type { CompileResponseData, PDFFile } from '../../../../../types/compile'

describe('pdf preview output files', function () {
  afterEach(function () {
    sinon.restore()
  })

  it('uses compiler stdout as a diagnostic log when output.log is missing', async function () {
    const stdout = [
      'Latexmk: Nothing to do for main.tex.',
      'Collected error summary (may duplicate other messages):',
      '  pdflatex: gave an error',
      'Latexmk: Undoing directory change',
      'Number of rules run = 0',
    ].join('\n')
    const fetchStub = sinon
      .stub(globalThis, 'fetch')
      .resolves(new Response(stdout))

    const result = await handleLogFiles(
      new Map([
        [
          'output.stdout',
          {
            path: 'output.stdout',
            url: '/build/output.stdout',
            type: 'stdout',
            build: 'build-one',
            downloadURL: '/download/output.stdout',
          } as PDFFile,
        ],
      ]),
      {
        status: 'failure',
        outputFiles: [],
        options: {},
        pdfCachingMinChunkSize: 0,
        validationProblems: null,
      } as CompileResponseData,
      new AbortController().signal
    )

    expect(fetchStub).to.have.been.calledOnce
    expect(result.log).to.equal(stdout)
    expect(result.logEntries.errors).to.have.length(1)
    expect(result.logEntries.all).to.have.length(1)
    expect(result.logEntries.errors[0].message).to.equal(
      'pdflatex: gave an error'
    )
  })
})
