import { expect } from 'chai'
import { type FC, type PropsWithChildren } from 'react'
import { fireEvent, screen } from '@testing-library/react'

import ErrorLogs from '../../../../../frontend/js/features/pdf-preview/components/error-logs'
import { PdfPreviewProvider } from '../../../../../frontend/js/features/pdf-preview/components/pdf-preview-provider'
import { DetachCompileContext } from '../../../../../frontend/js/shared/context/detach-compile-context'
import { type CompileContext } from '../../../../../frontend/js/shared/context/local-compile-context'
import { type LogEntry } from '../../../../../frontend/js/features/pdf-preview/util/types'
import { renderWithEditorContext } from '../../../helpers/render-with-context'

describe('<ErrorLogs />', function () {
  beforeEach(function () {
    window.metaAttributesCache.set('ol-preventCompileOnLoad', true)
  })

  it('shows the first compiler diagnostic before the generic No PDF explanation', function () {
    const firstError: LogEntry = {
      key: 'compiler-error-one',
      level: 'error',
      file: 'main.tex',
      line: 14,
      message: 'pdflatex: gave an error',
      content: 'Collected error summary',
      raw: 'pdflatex: gave an error',
      ruleId: 'compiler-stdout',
    }
    const DetachCompileProvider = makeDetachCompileProvider({
      error: 'failure',
      logEntries: {
        all: [firstError],
        errors: [firstError],
        warnings: [],
        typesetting: [],
      },
    })

    renderWithEditorContext(
      <PdfPreviewProvider>
        <ErrorLogs />
      </PdfPreviewProvider>,
      {
        providers: {
          DetachCompileProvider,
        },
      }
    )

    screen.getByText('First compiler error')
    screen.getByText('main.tex:14')
    expect(screen.getAllByText('pdflatex: gave an error')).not.to.be.empty
    screen.getByText(
      'Fix this first, then recompile. Later errors may be cascading symptoms.'
    )
  })

  it('opens AI Agent with the first compiler diagnostic as a prompt', function () {
    const firstError = makeFirstCompilerError()
    let prefillEvent: CustomEvent | undefined
    let railEvent: CustomEvent | undefined
    const handlePrefill = (event: Event) => {
      prefillEvent = event as CustomEvent
    }
    const handleRail = (event: Event) => {
      railEvent = event as CustomEvent
    }
    window.addEventListener('superpaper:ai-assistant-prefill', handlePrefill)
    window.addEventListener('ui:select-rail-tab', handleRail)
    const DetachCompileProvider = makeDetachCompileProvider({
      error: 'failure',
      logEntries: {
        all: [firstError],
        errors: [firstError],
        warnings: [],
        typesetting: [],
      },
    })

    renderWithEditorContext(
      <PdfPreviewProvider>
        <ErrorLogs />
      </PdfPreviewProvider>,
      {
        providers: {
          DetachCompileProvider,
        },
      }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fix with Agent' }))

    expect(prefillEvent?.detail).to.deep.include({
      projectId: 'project123',
      mode: 'agent',
    })
    expect(prefillEvent?.detail.prompt).to.contain('pdflatex: gave an error')
    expect(prefillEvent?.detail.prompt).to.contain('main.tex:14')
    expect(railEvent?.detail).to.deep.equal({
      tab: 'ai-assistant',
      open: true,
    })

    window.removeEventListener('superpaper:ai-assistant-prefill', handlePrefill)
    window.removeEventListener('ui:select-rail-tab', handleRail)
  })
})

function makeFirstCompilerError(): LogEntry {
  return {
    key: 'compiler-error-one',
    level: 'error',
    file: 'main.tex',
    line: 14,
    message: 'pdflatex: gave an error',
    content: 'Collected error summary',
    raw: 'pdflatex: gave an error',
    ruleId: 'compiler-stdout',
  }
}

function makeDetachCompileProvider(
  compileContext: Partial<CompileContext>
): FC<PropsWithChildren> {
  const DetachCompileProvider: FC<PropsWithChildren> = ({ children }) => (
    <DetachCompileContext.Provider
      value={
        {
          animateCompileDropdownArrow: false,
          autoCompile: true,
          clearCache: () => {},
          clearingCache: false,
          codeCheckFailed: false,
          compiling: false,
          darkModePdf: false,
          deliveryLatencies: {},
          draft: false,
          editedSinceCompileStarted: false,
          fileList: undefined,
          firstRenderDone: () => {},
          hasChanges: false,
          hasShortCompileTimeout: false,
          highlights: undefined,
          isProjectOwner: true,
          lastCompileOptions: {},
          logEntryAnnotations: undefined,
          outputFilesArchive: undefined,
          pdfFile: undefined,
          pdfViewer: 'pdfjs',
          position: undefined,
          rawLog: undefined,
          recordAction: () => {},
          recompileFromScratch: () => {},
          setAnimateCompileDropdownArrow: () => {},
          setAutoCompile: () => {},
          setChangedAt: () => {},
          setCompiling: () => {},
          setDraft: () => {},
          setError: () => {},
          setHasLintingError: () => {},
          setHighlights: () => {},
          setPosition: () => {},
          setShowCompileTimeWarning: () => {},
          setShowLogs: () => {},
          setStopOnFirstError: () => {},
          setStopOnValidationError: () => {},
          showCompileTimeWarning: false,
          showLogs: true,
          startCompile: async () => {},
          stopCompile: () => {},
          stopOnFirstError: false,
          stopOnValidationError: true,
          stoppedOnFirstError: false,
          syncToEntry: () => {},
          toggleLogs: () => {},
          uncompiled: false,
          validationIssues: undefined,
          activeOverallTheme: 'light',
          setDarkModePdf: () => {},
          ...compileContext,
        } as CompileContext
      }
    >
      {children}
    </DetachCompileContext.Provider>
  )

  return DetachCompileProvider
}
