import { lazy, memo } from 'react'
import { useDetachCompileContext as useCompileContext } from '../../../shared/context/detach-compile-context'
import { useTranslation } from 'react-i18next'

const PdfJsViewer = lazy(
  () => import(/* webpackChunkName: "pdf-js-viewer" */ './pdf-js-viewer')
)

function PdfViewer() {
  const { t } = useTranslation()
  const { pdfUrl, pdfFile, pdfViewer } = useCompileContext()

  if (!pdfUrl) {
    return null
  }

  switch (pdfViewer) {
    case 'native':
      return <iframe title={t('pdf_preview')} src={pdfUrl} />

    case 'pdfjs':
    default:
      return <PdfJsViewer url={pdfUrl} pdfFile={pdfFile} />
  }
}

export default memo(PdfViewer)
