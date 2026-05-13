import { type JSXElementConstructor, useCallback, useState } from 'react'
import classnames from 'classnames'
import { useTranslation } from 'react-i18next'
import NewProjectButtonModal, {
  NewProjectButtonModalVariant,
} from './new-project-button/new-project-button-modal'
import { Nullable } from '../../../../../types/utils'
import { sendMB } from '../../../infrastructure/event-tracking'
import importSuperPaperModules from '../../../../macros/import-superpaper-module.macro'
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
} from '@/shared/components/dropdown/dropdown-menu'
import { useSendProjectListMB } from '@/features/project-list/components/project-list-events'
import MaterialIcon from '@/shared/components/material-icon'

type SendTrackingEvent = {
  dropdownMenu: string
  dropdownOpen: boolean
}

type ModalMenuClickOptions = {
  modalVariant: NewProjectButtonModalVariant
  dropdownMenuEvent: string
}

type NewProjectButtonProps = {
  id: string
  buttonText?: string
  className?: string
  trackingKey?: string
}

function NewProjectButton({
  id,
  buttonText,
  className,
  trackingKey,
}: NewProjectButtonProps) {
  const { t } = useTranslation()
  const [modal, setModal] =
    useState<Nullable<NewProjectButtonModalVariant>>(null)
  const sendProjectListMB = useSendProjectListMB()
  const sendTrackingEvent = useCallback(
    ({ dropdownMenu, dropdownOpen }: SendTrackingEvent) => {
      if (trackingKey) {
        sendMB(trackingKey, {
          dropdownMenu,
          dropdownOpen,
        })
      }
    },
    [trackingKey]
  )

  const handleMainButtonClick = useCallback(
    (dropdownOpen: boolean) => {
      sendTrackingEvent({
        dropdownMenu: 'main-button',
        dropdownOpen,
      })
    },
    [sendTrackingEvent]
  )

  const handleModalMenuClick = useCallback(
    (
      e: React.MouseEvent,
      { modalVariant, dropdownMenuEvent }: ModalMenuClickOptions
    ) => {
      // avoid invoking the "onClick" callback on the main dropdown button
      e.stopPropagation()

      sendTrackingEvent({
        dropdownMenu: dropdownMenuEvent,
        dropdownOpen: true,
      })
      sendProjectListMB('new-project-click', { item: dropdownMenuEvent })

      setModal(modalVariant)
    },
    [sendProjectListMB, sendTrackingEvent]
  )

  const [importProjectFromGithubMenu] = importSuperPaperModules(
    'importProjectFromGithubMenu'
  )

  const ImportProjectFromGithubMenu: JSXElementConstructor<{
    onClick: (e: React.MouseEvent) => void
  }> = importProjectFromGithubMenu?.import.default

  return (
    <>
      <Dropdown
        className={classnames('new-project-dropdown', className)}
        onSelect={handleMainButtonClick}
        onToggle={nextShow => {
          if (nextShow) sendProjectListMB('new-project-expand', undefined)
        }}
      >
        <DropdownToggle
          id={id}
          className="new-project-button"
          variant="primary"
        >
          {buttonText || t('new_project')}
        </DropdownToggle>
        <DropdownMenu>
          <li role="none">
            <DropdownItem
              onClick={e =>
                handleModalMenuClick(e, {
                  modalVariant: 'blank_project',
                  dropdownMenuEvent: 'blank-project',
                })
              }
            >
              {t('blank_project')}
            </DropdownItem>
          </li>
          <li role="none">
            <DropdownItem
              onClick={e =>
                handleModalMenuClick(e, {
                  modalVariant: 'example_project',
                  dropdownMenuEvent: 'example-project',
                })
              }
            >
              {t('example_project')}
            </DropdownItem>
          </li>
          <li role="none">
            <DropdownItem
              onClick={e =>
                handleModalMenuClick(e, {
                  modalVariant: 'upload_project',
                  dropdownMenuEvent: 'upload-project',
                })
              }
            >
              {t('upload_project')}
            </DropdownItem>
          </li>
          <li role="none">
            {ImportProjectFromGithubMenu && (
              <ImportProjectFromGithubMenu
                onClick={e =>
                  handleModalMenuClick(e, {
                    modalVariant: 'import_from_github',
                    dropdownMenuEvent: 'import-from-github',
                  })
                }
              />
            )}
          </li>
        </DropdownMenu>
      </Dropdown>
      <NewProjectButtonModal modal={modal} onHide={() => setModal(null)} />
    </>
  )
}

export default NewProjectButton
