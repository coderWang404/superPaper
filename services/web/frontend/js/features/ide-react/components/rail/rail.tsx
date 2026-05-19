import { FC, RefObject, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Nav, TabContainer } from 'react-bootstrap'
import { useLayoutContext } from '@/shared/context/layout-context'
import {
  RailTabKey,
  useRailContext,
} from '@/features/ide-react/context/rail-context'
import FileTreeOutlinePanel from '@/features/file-tree/components/file-tree-outline-panel'
import ChatPane from '@/features/chat/components/chat-pane'
import ChatIndicator from '@/features/chat/components/chat-indicator'
import AiAssistantPanel from '@/features/ai-assistant/components/ai-assistant-panel'
import AgentSettingsPanel from '@/features/ai-agent-settings/components/agent-settings-panel'
import getMeta from '@/utils/meta'
import classNames from 'classnames'
import IntegrationsPanel from '@/features/integrations-panel/integrations-panel'
import { useChatContext } from '@/features/chat/context/chat-context'
import { useEditorAnalytics } from '@/shared/hooks/use-editor-analytics'
import {
  FullProjectSearchPanel,
  hasFullProjectSearch,
} from '@/features/ide-react/components/rail/full-project-search-panel'
import { sendSearchEvent } from '@/features/event-tracking/search-events'
import { useCommandProvider } from '@/features/ide-react/hooks/use-command-provider'
import RailHelpDropdown from './rail-help-dropdown'
import RailTab from './rail-tab'
import RailActionElement, { RailAction } from './rail-action-element'
import {
  type CustomRailTabIcon,
  RailElement,
} from '@/features/ide-react/util/rail-types'
import RailPanel from './rail-panel'
import RailResizeHandle from './rail-resize-handle'
import RailModals from './rail-modals'
import RailOverflowDropdown from './rail-overflow-dropdown'
import useRailOverflow from '@/features/ide-react/hooks/use-rail-overflow'
import importSuperPaperModules from '../../../../../macros/import-superpaper-module.macro'
import { shouldIncludeElement } from '@/features/ide-react/util/rail-utils'
import { useEditorContext } from '@/shared/context/editor-context'
import useEventListener from '@/shared/hooks/use-event-listener'

const AiAssistantRailIcon: CustomRailTabIcon = ({ title, open }) => (
  <svg
    aria-hidden="true"
    className="ide-rail-tab-link-icon ide-rail-tab-svg-icon"
    focusable="false"
    viewBox="0 0 24 24"
  >
    <path
      d={
        open
          ? 'M12 2.75 13.7 8.3 19.25 10l-5.55 1.7L12 17.25l-1.7-5.55L4.75 10l5.55-1.7L12 2.75Zm6 11 1 3.25 3.25 1-3.25 1-1 3.25-1-3.25-3.25-1 3.25-1 1-3.25Z'
          : 'M12 5.4 11.3 7.7a2.4 2.4 0 0 1-1.6 1.6L7.4 10l2.3.7a2.4 2.4 0 0 1 1.6 1.6l.7 2.3.7-2.3a2.4 2.4 0 0 1 1.6-1.6l2.3-.7-2.3-.7a2.4 2.4 0 0 1-1.6-1.6L12 5.4Zm0-2.65c.33 0 .63.22.73.54l1.56 5.08 5.08 1.56a.77.77 0 0 1 0 1.47l-5.08 1.56-1.56 5.08a.77.77 0 0 1-1.46 0l-1.56-5.08-5.08-1.56a.77.77 0 0 1 0-1.47l5.08-1.56 1.56-5.08c.1-.32.4-.54.73-.54Zm6 11c.33 0 .62.21.72.52l.88 2.86 2.86.88a.75.75 0 0 1 0 1.43l-2.86.88-.88 2.86a.75.75 0 0 1-1.43 0l-.88-2.86-2.86-.88a.75.75 0 0 1 0-1.43l2.86-.88.88-2.86c.1-.31.39-.52.71-.52Z'
      }
      fill="currentColor"
    />
    <title>{title}</title>
  </svg>
)

const AgentSettingsRailIcon: CustomRailTabIcon = ({ title, open }) => (
  <svg
    aria-hidden="true"
    className="ide-rail-tab-link-icon ide-rail-tab-svg-icon"
    focusable="false"
    viewBox="0 0 24 24"
  >
    <path
      d={
        open
          ? 'M5 4h10v2H5V4Zm0 7h14v2H5v-2Zm0 7h8v2H5v-2Zm12-15a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-8 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm7 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z'
          : 'M5 4.25h9.2a3 3 0 0 1 5.6 0H21v1.5h-1.2a3 3 0 0 1-5.6 0H5v-1.5Zm12 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 11.25h1.2a3 3 0 0 1 5.6 0H21v1.5h-9.2a3 3 0 0 1-5.6 0H5v-1.5Zm4 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 18.25h8.2a3 3 0 0 1 5.6 0H21v1.5h-2.2a3 3 0 0 1-5.6 0H5v-1.5Zm11 1.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z'
      }
      fill="currentColor"
    />
    <title>{title}</title>
  </svg>
)

const moduleRailEntries = (
  importSuperPaperModules('railEntries') as {
    import: { default: RailElement }
    path: string
  }[]
).map(({ import: { default: element } }) => element)

const moduleRailPopovers = (
  importSuperPaperModules('railPopovers') as {
    import: {
      default: {
        key: string
        Component: FC<{ ref: RefObject<HTMLButtonElement> }>
        ref: RefObject<HTMLButtonElement>
        hide: boolean | (() => boolean)
      }
    }
    path: string
  }[]
).map(({ import: { default: element } }) => element)

export const RailLayout = () => {
  const { sendEvent } = useEditorAnalytics()
  const { t } = useTranslation()
  const { selectedTab, openTab, isOpen, setIsOpen, togglePane, selectTab } =
    useRailContext()
  const { isRestrictedTokenMember } = useEditorContext()
  const gitBridgeEnabled = getMeta('ol-gitBridgeEnabled')
  const { isSuperPaper } = getMeta('ol-ExposedSettings')

  const { view, setLeftMenuShown } = useLayoutContext()

  const { markMessagesAsRead } = useChatContext()

  const isHistoryView = view === 'history'

  useEventListener(
    'ui:select-rail-tab',
    useCallback(
      (event: Event) => {
        const {
          detail: { tab, open },
        } = event as CustomEvent<{
          tab: RailTabKey
          open: boolean
        }>
        selectTab(tab)
        setIsOpen(open)
      },
      [selectTab, setIsOpen]
    )
  )

  const railTabs: RailElement[] = useMemo(
    () => [
      {
        key: 'file-tree',
        icon: 'description',
        title: t('file_tree'),
        component: <FileTreeOutlinePanel />,
        // NOTE: We always need to mount the file tree on first load
        // since it is responsible for opening the initial document.
        mountOnFirstLoad: true,
      },
      {
        key: 'full-project-search',
        icon: 'search',
        title: t('project_search'),
        component: <FullProjectSearchPanel />,
        hide: !hasFullProjectSearch,
      },
      {
        key: 'integrations',
        icon: 'integration_instructions',
        title: t('integrations'),
        component: <IntegrationsPanel />,
        hide: !isSuperPaper && !gitBridgeEnabled,
      },
      {
        key: 'chat',
        icon: 'forum',
        component: <ChatPane />,
        indicator: <ChatIndicator />,
        title: t('chat'),
        hide:
          !getMeta('ol-capabilities')?.includes('chat') ||
          isRestrictedTokenMember,
      },
      {
        key: 'ai-assistant',
        icon: AiAssistantRailIcon,
        title: t('ai_assistant'),
        component: <AiAssistantPanel />,
      },
      {
        key: 'agent-settings',
        icon: AgentSettingsRailIcon,
        title: t('agent_settings'),
        component: <AgentSettingsPanel />,
      },
      ...moduleRailEntries,
    ],
    [
      t,
      isRestrictedTokenMember,
      isSuperPaper,
      gitBridgeEnabled,
    ]
  )

  const railActions: RailAction[] = useMemo(
    () => [
      {
        key: 'support',
        icon: 'help',
        title: t('help'),
        dropdown: <RailHelpDropdown />,
      },
      {
        key: 'settings',
        icon: 'settings',
        title: t('settings'),
        action: () => {
          sendEvent('rail-click', { tab: 'settings' })
          setLeftMenuShown(true)
        },
      },
    ],
    [setLeftMenuShown, t, sendEvent]
  )

  useCommandProvider(
    () => [
      {
        id: 'open-settings',
        handler: () => {
          setLeftMenuShown(true)
        },
        label: t('settings'),
      },
    ],
    [t, setLeftMenuShown]
  )

  const onTabSelect = useCallback(
    (key: string | null) => {
      if (key === selectedTab) {
        togglePane()
        sendEvent('rail-click', { tab: key, type: 'toggle' })
      } else {
        // HACK: Apparently the onSelect event is triggered with href attributes
        // from DropdownItems
        if (
          !railTabs.some(tab =>
            typeof tab.hide === 'function'
              ? !tab.hide()
              : !tab.hide && tab.key === key
          )
        ) {
          // Attempting to open a non-existent tab
          return
        }
        const keyOrDefault = (key ?? 'file-tree') as RailTabKey
        // Change the selected tab and make sure it's open
        openTab(keyOrDefault)
        sendEvent('rail-click', { tab: keyOrDefault })
        if (keyOrDefault === 'full-project-search') {
          sendSearchEvent('search-open', {
            searchType: 'full-project',
            method: 'button',
            location: 'rail',
          })
        }

        if (key === 'chat') {
          markMessagesAsRead()
        }
      }
    },
    [openTab, togglePane, selectedTab, railTabs, sendEvent, markMessagesAsRead]
  )

  useEffect(() => {
    const validTabKeys = railTabs
      .filter(shouldIncludeElement)
      .map(tab => tab.key)
    if (!validTabKeys.includes(selectedTab) && isOpen) {
      // If the selected tab is no longer valid (e.g. due to permissions changes),
      // switch back to the file tree
      openTab('file-tree')
    }
  }, [railTabs, selectedTab, openTab, isOpen])

  const isReviewPanelOpen = false

  const { tabsInRail, tabsInOverflow, tabWrapperRef } =
    useRailOverflow(railTabs)

  const moreOptionsAction: RailAction = useMemo(() => {
    return {
      key: 'more-options',
      icon: 'more_vert',
      title: t('more_options'),
      hide: tabsInOverflow.length === 0,
      dropdown: (
        <RailOverflowDropdown
          tabs={tabsInOverflow}
          isOpen={isOpen}
          selectedTab={selectedTab}
        />
      ),
    }
  }, [t, isOpen, selectedTab, tabsInOverflow])

  return (
    <TabContainer
      mountOnEnter // Only render when necessary (so that we can lazy load tab content)
      unmountOnExit={false} // TODO: Should we unmount the tabs when they're not used?
      transition={false}
      activeKey={selectedTab}
      onSelect={onTabSelect}
      id="ide-rail-tabs"
    >
      {/* The <Nav> element is a "div" and has a "role="tablist"".
          But it should be identified as a navigation landmark.
          Therefore, we nest them: the parent <nav> is the landmark, and its child gets the "role="tablist"". */}
      <nav
        className={classNames('ide-rail', { hidden: isHistoryView })}
        aria-label={t('sidebar')}
      >
        <Nav activeKey={selectedTab} className="ide-rail-tabs-nav">
          <div className="ide-rail-tabs-wrapper" ref={tabWrapperRef}>
            {tabsInRail
              .filter(shouldIncludeElement)
              .map(({ icon, key, indicator, title, disabled, ref, tab }) => {
                const Component = tab ?? RailTab
                return (
                  <Component
                    open={isOpen && selectedTab === key}
                    key={key}
                    eventKey={key}
                    icon={icon}
                    indicator={indicator}
                    title={title}
                    disabled={disabled}
                    ref={ref}
                  />
                )
              })}
            <RailActionElement key="more-options" action={moreOptionsAction} />
          </div>
          <nav aria-label={t('help_editor_settings')}>
            {railActions.map(action => (
              <RailActionElement
                key={action.key}
                action={action}
                ref={action.ref}
              />
            ))}
          </nav>
        </Nav>
      </nav>
      {moduleRailPopovers
        .filter(shouldIncludeElement)
        .map(({ key, Component, ref }) => (
          <Component key={key} ref={ref} />
        ))}
      <RailPanel
        isReviewPanelOpen={isReviewPanelOpen}
        isHistoryView={isHistoryView}
        railTabs={railTabs}
      />
      <RailResizeHandle isReviewPanelOpen={isReviewPanelOpen} />
      <RailModals />
    </TabContainer>
  )
}
