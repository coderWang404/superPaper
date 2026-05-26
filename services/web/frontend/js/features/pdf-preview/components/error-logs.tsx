import { useTranslation } from 'react-i18next'
import { ElementType, memo, useCallback, useMemo, useState } from 'react'
import { usePdfPreviewContext } from '@/features/pdf-preview/components/pdf-preview-provider'
import StopOnFirstErrorPrompt from '@/features/pdf-preview/components/stop-on-first-error-prompt'
import PdfPreviewError from '@/features/pdf-preview/components/pdf-preview-error'
import PdfValidationIssue from '@/features/pdf-preview/components/pdf-validation-issue'
import PdfLogsEntries from '@/features/pdf-preview/components/pdf-logs-entries'
import PdfPreviewErrorBoundaryFallback from '@/features/pdf-preview/components/pdf-preview-error-boundary-fallback'
import withErrorBoundary from '@/infrastructure/error-boundary'
import { useDetachCompileContext as useCompileContext } from '@/shared/context/detach-compile-context'
import { Nav, NavLink, TabContainer, TabContent } from 'react-bootstrap'
import { LogEntry as LogEntryData } from '@/features/pdf-preview/util/types'
import LogEntry from './log-entry'
import PdfClearCacheButton from '@/features/pdf-preview/components/pdf-clear-cache-button'
import PdfDownloadFilesButton from '@/features/pdf-preview/components/pdf-download-files-button'
import RollingBuildSelectedReminder from './rolling-build-selected-reminder'
import { useProjectContext } from '@/shared/context/project-context'
import OLButton from '@/shared/components/ol/ol-button'
import MaterialIcon from '@/shared/components/material-icon'
import {
  buildCompileErrorAgentPrompt,
  publishAiAssistantPrefill,
} from '@/features/ai-assistant/util/agent-prefill'
import importSuperPaperModules from '../../../../macros/import-superpaper-module.macro'

const logsComponents: Array<{
  import: { default: ElementType }
  path: string
}> = importSuperPaperModules('errorLogsComponents')

type ErrorLogTab = {
  key: string
  label: string
  entries: LogEntryData[] | undefined
}

function ErrorLogs({
  includeActionButtons,
}: {
  includeActionButtons?: boolean
}) {
  const { error, logEntries, rawLog, validationIssues, stoppedOnFirstError } =
    useCompileContext()
  const { t } = useTranslation()
  const firstError = logEntries?.errors?.[0]

  const tabs = useMemo(() => {
    return [
      {
        key: 'all',
        label: t('all_logs'),
        entries: logEntries?.all,
      },
      { key: 'errors', label: t('errors'), entries: logEntries?.errors },
      { key: 'warnings', label: t('warnings'), entries: logEntries?.warnings },
      { key: 'info', label: t('info'), entries: logEntries?.typesetting },
    ]
  }, [logEntries, t])

  const { loadingError } = usePdfPreviewContext()

  const [activeTab, setActiveTab] = useState<string | null>('all')

  const changeTab = useCallback(
    (key: string | null) => {
      if (tabs.some(tab => tab.key === key)) {
        setActiveTab(key)
      }
    },
    [tabs]
  )

  const entries = useMemo(() => {
    return tabs.find(tab => tab.key === activeTab)?.entries || []
  }, [activeTab, tabs])

  const includeErrors = activeTab === 'all' || activeTab === 'errors'
  const includeWarnings = activeTab === 'all' || activeTab === 'warnings'

  return (
    <TabContainer onSelect={changeTab} defaultActiveKey={activeTab ?? 'all'}>
      <Nav defaultActiveKey="all" className="error-logs-tabs">
        {tabs.map(tab => (
          <TabHeader key={tab.key} tab={tab} active={activeTab === tab.key} />
        ))}
      </Nav>
      {logsComponents.map(({ import: { default: Component }, path }) => (
        <Component key={path} />
      ))}
      <TabContent className="error-logs new-error-logs">
        <div className="logs-pane-content">
          <RollingBuildSelectedReminder />
          {stoppedOnFirstError && includeErrors && <StopOnFirstErrorPrompt />}

          {loadingError && (
            <PdfPreviewError
              error="pdf-viewer-loading-error"
              includeErrors={includeErrors}
              includeWarnings={includeWarnings}
            />
          )}

          {error === 'failure' && firstError && (
            <FirstCompilerErrorSummary entry={firstError} />
          )}

          {error && <PdfPreviewError error={error} />}

          {includeErrors &&
            validationIssues &&
            Object.entries(validationIssues).map(([name, issue]) => (
              <PdfValidationIssue key={name} name={name} issue={issue} />
            ))}

          {entries && (
            <PdfLogsEntries
              entries={entries}
              hasErrors={
                includeErrors &&
                logEntries?.errors &&
                logEntries?.errors.length > 0
              }
            />
          )}

          {rawLog && activeTab === 'all' && (
            <LogEntry
              headerTitle={t('raw_logs')}
              rawContent={rawLog}
              entryAriaLabel={t('raw_logs_description')}
              level="raw"
              alwaysExpandRawContent
              showSourceLocationLink={false}
            />
          )}

          {includeActionButtons && (
            <div className="logs-pane-actions">
              <PdfClearCacheButton />
              <PdfDownloadFilesButton />
            </div>
          )}
        </div>
      </TabContent>
    </TabContainer>
  )
}

function formatErrorNumber(num: number | undefined) {
  if (num === undefined) {
    return undefined
  }

  if (num > 99) {
    return '99+'
  }

  return Math.floor(num).toString()
}

const TabHeader = ({ tab, active }: { tab: ErrorLogTab; active: boolean }) => {
  return (
    <NavLink
      eventKey={tab.key}
      className="error-logs-tab-header"
      active={active}
    >
      {tab.label}
      <div className="error-logs-tab-count">
        {/* TODO: it would be nice if this number included custom errors */}
        {formatErrorNumber(tab.entries?.length)}
      </div>
    </NavLink>
  )
}

export default withErrorBoundary(memo(ErrorLogs), () => (
  <PdfPreviewErrorBoundaryFallback type="logs" />
))

function FirstCompilerErrorSummary({ entry }: { entry: LogEntryData }) {
  const { t } = useTranslation()
  const { projectId } = useProjectContext()
  const source = formatFirstCompilerErrorSource(entry)
  const title =
    entry.messageComponent ?? entry.message ?? t('compile_error_entry_description')
  const handleFixWithAgent = useCallback(() => {
    publishAiAssistantPrefill({
      projectId,
      mode: 'agent',
      prompt: buildCompileErrorAgentPrompt(entry),
    })
    window.dispatchEvent(
      new CustomEvent('ui:select-rail-tab', {
        detail: { tab: 'ai-assistant', open: true },
      })
    )
  }, [entry, projectId])

  return (
    <section
      aria-label={t('first_compiler_error')}
      className="first-compiler-error-summary"
    >
      <div className="first-compiler-error-summary-header">
        <span className="first-compiler-error-summary-label">
          {t('first_compiler_error')}
        </span>
        {source && (
          <code className="first-compiler-error-summary-source">{source}</code>
        )}
      </div>
      <div className="first-compiler-error-summary-message">{title}</div>
      <p>{t('first_compiler_error_guidance')}</p>
      <div className="first-compiler-error-summary-actions">
        <OLButton
          type="button"
          size="sm"
          variant="secondary"
          leadingIcon={<MaterialIcon type="smart_toy" className="icon-small" />}
          onClick={handleFixWithAgent}
        >
          {t('fix_with_agent')}
        </OLButton>
      </div>
    </section>
  )
}

function formatFirstCompilerErrorSource(entry: LogEntryData) {
  if (!entry.file) {
    return ''
  }
  if (entry.line === null || entry.line === undefined || entry.line === '') {
    return entry.file
  }
  return `${entry.file}:${entry.line}`
}
