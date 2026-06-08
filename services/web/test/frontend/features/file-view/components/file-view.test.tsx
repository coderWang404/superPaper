import {
  screen,
  waitForElementToBeRemoved,
  fireEvent,
  act,
} from '@testing-library/react'
import fetchMock from 'fetch-mock'
import sinon from 'sinon'
import { expect } from 'chai'

import { renderWithEditorContext } from '../../../helpers/render-with-context'
import FileView from '../../../../../frontend/js/features/file-view/components/file-view'
import FileViewPdf from '../../../../../frontend/js/features/file-view/components/file-view-pdf'
import { imageFile, projectOutputFile, textFile } from '../util/files'
import { FileTreePathContext } from '@/features/file-tree/contexts/file-tree-path'

function fileTreePathProviderWithPreview(
  loadPdfDocumentFromUrl: (url: string) => { promise: Promise<any> }
) {
  const pdfJsPath = require.resolve(
    '../../../../../frontend/js/features/pdf-preview/util/pdf-js'
  )
  require.cache[pdfJsPath] = {
    exports: { loadPdfDocumentFromUrl },
  } as NodeJS.Module

  function FileTreePathProvider({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <FileTreePathContext.Provider
        value={{
          pathInFolder: () => projectOutputFile.name,
          previewByPath: () => ({
            url: `/project/project123/blob/${projectOutputFile.hash}`,
            extension: 'pdf',
          }),
          findEntityByPath: () => null,
          dirname: () => null,
        }}
      >
        {children}
      </FileTreePathContext.Provider>
    )
  }

  return { FileTreePathProvider, pdfJsPath }
}

describe('<FileView/>', function () {
  beforeEach(function () {
    fetchMock.removeRoutes().clearHistory()
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
  })

  describe('for a text file', function () {
    it('shows a loading indicator while the file is loading', async function () {
      fetchMock.head('express:/project/:project_id/blob/:hash', {
        status: 201,
        headers: { 'Content-Length': 10000 },
      })
      fetchMock.get(
        'express:/project/:project_id/blob/:hash',
        'Text file content'
      )

      renderWithEditorContext(<FileView file={textFile} />)

      await waitForElementToBeRemoved(() =>
        screen.getByTestId('loading-panel-file-view')
      )
    })

    it('shows messaging if the text view could not be loaded', async function () {
      const unpreviewableTextFile = {
        ...textFile,
        name: 'example.not-tex',
      }

      renderWithEditorContext(<FileView file={unpreviewableTextFile} />)

      await screen.findByText('Sorry, no preview is available', {
        exact: false,
      })
    })
  })

  describe('for an image file', function () {
    it('shows a loading indicator while the file is loading', async function () {
      renderWithEditorContext(<FileView file={imageFile} />)

      screen.getByTestId('loading-panel-file-view')
    })

    it('shows messaging if the image could not be loaded', async function () {
      renderWithEditorContext(<FileView file={imageFile} />)

      // Fake the image request failing as the request is handled by the browser
      fireEvent.error(screen.getByRole('img'))

      await screen.findByText('Sorry, no preview is available', {
        exact: false,
      })
    })
  })

  describe('for a PDF file', function () {
    it('shows messaging if the PDF could not be loaded', async function () {
      const { FileTreePathProvider, pdfJsPath } = fileTreePathProviderWithPreview(
        () => ({
          promise: Promise.reject(new Error('pdf load failed')),
        })
      )

      try {
        renderWithEditorContext(<FileView file={projectOutputFile} />, {
          providers: { FileTreePathProvider },
        })

        await screen.findByText('Sorry, no preview is available', {
          exact: false,
        })
      } finally {
        delete require.cache[pdfJsPath]
      }
    })

    it('shows messaging if a PDF page could not be rendered', async function () {
      const { FileTreePathProvider, pdfJsPath } = fileTreePathProviderWithPreview(
        () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: () =>
              Promise.resolve({
                getViewport: () => ({ width: 100, height: 200 }),
                render: () => ({
                  promise: Promise.reject(new Error('pdf render failed')),
                }),
              }),
          }),
        })
      )

      try {
        renderWithEditorContext(<FileView file={projectOutputFile} />, {
          providers: { FileTreePathProvider },
        })

        await screen.findByText('Sorry, no preview is available', {
          exact: false,
        })
      } finally {
        delete require.cache[pdfJsPath]
      }
    })

    it('does not call onLoad after a successful render resolves if unmounted', async function () {
      let resolveRender!: () => void
      const renderPromise = new Promise<void>(resolve => {
        resolveRender = resolve
      })
      let resolveRenderStarted!: () => void
      const renderStarted = new Promise<void>(resolve => {
        resolveRenderStarted = resolve
      })
      const onLoad = sinon.stub()
      const { FileTreePathProvider, pdfJsPath } = fileTreePathProviderWithPreview(
        () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: () =>
              Promise.resolve({
                getViewport: () => ({ width: 100, height: 200 }),
                render: () => {
                  resolveRenderStarted()
                  return { promise: renderPromise }
                },
              }),
          }),
        })
      )

      try {
        const { unmount } = renderWithEditorContext(
          <FileViewPdf
            fileId={projectOutputFile.id}
            onLoad={onLoad}
            onError={() => {}}
          />,
          {
            providers: { FileTreePathProvider },
          }
        )

        await renderStarted

        unmount()

        await act(async () => {
          resolveRender()
          await renderPromise
        })

        expect(onLoad).not.to.have.been.called
      } finally {
        delete require.cache[pdfJsPath]
      }
    })
  })
})
