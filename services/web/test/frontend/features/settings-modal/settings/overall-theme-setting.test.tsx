import { screen, within, render } from '@testing-library/react'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import type { OverallThemeMeta } from '../../../../../types/project-settings'
import { EditorProviders } from '../../../helpers/editor-providers'
import { SettingsModalProvider } from '@/features/settings/context/settings-modal-context'
import OverallThemeSetting from '@/features/settings/components/appearance-settings/overall-theme-setting'

import userEvent from '@testing-library/user-event'

describe('<OverallThemeSetting />', function () {
  const overallThemes: OverallThemeMeta[] = [
    {
      name: 'Overall Theme 1',
      val: '',
    },
    {
      name: 'Overall Theme 2',
      val: 'light-',
    },
  ]

  beforeEach(function () {
    window.metaAttributesCache.set('ol-overallThemes', overallThemes)
  })

  afterEach(function () {
    fetchMock.removeRoutes().clearHistory()
  })

  it('each option is shown and can be selected', async function () {
    render(
      <EditorProviders>
        <SettingsModalProvider>
          <OverallThemeSetting />
        </SettingsModalProvider>
      </EditorProviders>
    )

    const saveSettingsMock = fetchMock.post(
      'express:/user/settings',
      {
        status: 200,
      },
      { delay: 0 }
    )

    const select = screen.getByLabelText('Overall theme')

    // Reverse order so we test changing to each option
    for (const theme of overallThemes.reverse()) {
      const option = within(select).getByText(theme.name)
      expect(option.getAttribute('value')).to.equal(theme.val)
      await userEvent.selectOptions(select, [option])
      expect(
        saveSettingsMock.callHistory.called('/user/settings', {
          body: { overallTheme: theme.val },
        })
      ).to.be.true
    }
  })
})
