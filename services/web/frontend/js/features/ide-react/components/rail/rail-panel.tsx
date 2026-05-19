import { Panel } from 'react-resizable-panels'
import {
  RailTabKey,
  useRailContext,
} from '@/features/ide-react/context/rail-context'
import classNames from 'classnames'
import { useCallback, useEffect, useMemo } from 'react'
import usePreviousValue from '@/shared/hooks/use-previous-value'
import { HistorySidebar } from '@/features/ide-react/components/history-sidebar'
import { Tab } from 'react-bootstrap'
import { RailElement } from '@/features/ide-react/util/rail-types'
import { shouldIncludeElement } from '@/features/ide-react/util/rail-utils'

const AGENT_WORKSPACE_TABS: RailTabKey[] = ['ai-assistant', 'agent-settings']
const DEFAULT_RAIL_SIZE = 15
const DEFAULT_WORKBENCH_SIZE = 20
const DEFAULT_AGENT_WORKSPACE_SIZE = 32
const MIN_RAIL_SIZE = 5
const MIN_AGENT_WORKSPACE_SIZE = 24

export default function RailPanel({
  isReviewPanelOpen,
  isHistoryView,
  railTabs,
}: {
  isReviewPanelOpen: boolean
  isHistoryView: boolean
  railTabs: RailElement[]
}) {
  const { selectedTab, panelRef, handlePaneExpand, handlePaneCollapse } =
    useRailContext()

  const prevTab = usePreviousValue(selectedTab)

  const tabHasChanged = useMemo(() => {
    return prevTab !== selectedTab
  }, [prevTab, selectedTab])

  const isAgentWorkspaceTab = AGENT_WORKSPACE_TABS.includes(selectedTab)
  const defaultSize = defaultSizeForTab(selectedTab)
  const minSize = isAgentWorkspaceTab ? MIN_AGENT_WORKSPACE_SIZE : MIN_RAIL_SIZE

  useEffect(() => {
    const panelHandle = panelRef.current
    if (!panelHandle || !isAgentWorkspaceTab) {
      return
    }
    if (panelHandle.getSize() < MIN_AGENT_WORKSPACE_SIZE) {
      panelHandle.resize(DEFAULT_AGENT_WORKSPACE_SIZE)
    }
  }, [isAgentWorkspaceTab, panelRef, selectedTab])

  const onCollapse = useCallback(() => {
    if (!tabHasChanged) {
      handlePaneCollapse()
    }
  }, [tabHasChanged, handlePaneCollapse])

  return (
    <Panel
      id={`ide-redesign-sidebar-panel-${isHistoryView ? 'file-tree' : selectedTab}`}
      className={classNames({ hidden: isReviewPanelOpen })}
      order={1}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={80}
      ref={panelRef}
      collapsible
      onCollapse={onCollapse}
      onExpand={handlePaneExpand}
    >
      {isHistoryView && <HistorySidebar />}
      <div
        className={classNames('ide-rail-content', {
          hidden: isHistoryView,
        })}
      >
        <Tab.Content className="ide-rail-tab-content">
          {railTabs
            .filter(shouldIncludeElement)
            .map(({ key, component, mountOnFirstLoad }) => (
              <Tab.Pane
                eventKey={key}
                key={key}
                mountOnEnter={!mountOnFirstLoad}
              >
                {component}
              </Tab.Pane>
            ))}
        </Tab.Content>
      </div>
    </Panel>
  )
}

function defaultSizeForTab(selectedTab: RailTabKey) {
  if (selectedTab === 'workbench') {
    return DEFAULT_WORKBENCH_SIZE
  }
  if (AGENT_WORKSPACE_TABS.includes(selectedTab)) {
    return DEFAULT_AGENT_WORKSPACE_SIZE
  }
  return DEFAULT_RAIL_SIZE
}
