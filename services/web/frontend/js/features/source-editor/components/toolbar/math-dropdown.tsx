import { DropdownHeader } from '@/shared/components/dropdown/dropdown-menu'
import { ToolbarButtonMenu } from './button-menu'
import { emitToolbarEvent } from '../../extensions/toolbar/utils/analytics'
import MaterialIcon from '../../../../shared/components/material-icon'
import { useTranslation } from 'react-i18next'
import { useCodeMirrorViewContext } from '../codemirror-context'
import {
  wrapInDisplayMath,
  wrapInInlineMath,
} from '../../extensions/toolbar/commands'
import { memo } from 'react'
import OLListGroupItem from '@/shared/components/ol/ol-list-group-item'

export const MathDropdown = memo(function MathDropdown() {
  const { t } = useTranslation()
  const view = useCodeMirrorViewContext()

  return (
    <ToolbarButtonMenu
      id="toolbar-math"
      label={t('toolbar_insert_math')}
      icon={<MaterialIcon type="calculate" />}
    >
      <DropdownHeader className="ol-cm-toolbar-header mx-2">
        {t('toolbar_insert_math_lowercase')}
      </DropdownHeader>
      <OLListGroupItem
        aria-label={t('toolbar_insert_inline_math')}
        onClick={event => {
          emitToolbarEvent(view, 'toolbar-inline-math')
          event.preventDefault()
          wrapInInlineMath(view)
          view.focus()
        }}
      >
        <MaterialIcon type="123" />
        <span>{t('inline')}</span>
      </OLListGroupItem>
      <OLListGroupItem
        aria-label={t('toolbar_insert_display_math')}
        onClick={event => {
          emitToolbarEvent(view, 'toolbar-display-math')
          event.preventDefault()
          wrapInDisplayMath(view)
          view.focus()
        }}
      >
        <MaterialIcon type="view_day" />
        <span>{t('display')}</span>
      </OLListGroupItem>
    </ToolbarButtonMenu>
  )
})
