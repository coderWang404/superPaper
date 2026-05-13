import sinon from 'sinon'
import { screen, render, waitFor } from '@testing-library/react'
import * as eventTracking from '@/infrastructure/event-tracking'
import SettingsPageRoot from '../../../../../frontend/js/features/settings/components/root'
import getMeta from '@/utils/meta'

describe('<SettingsPageRoot />', function () {
  let sendMBSpy: sinon.SinonSpy
  beforeEach(function () {
    window.metaAttributesCache.set('ol-usersEmail', 'foo@bar.com')
    window.metaAttributesCache.set('ol-hasPassword', true)
    Object.assign(getMeta('ol-ExposedSettings'), { isSuperPaper: true })
    window.metaAttributesCache.set('ol-user', {
      features: { github: true, dropbox: true },
    })
    sendMBSpy = sinon.spy(eventTracking, 'sendMB')
  })

  afterEach(function () {
    sendMBSpy.restore()
  })

  it('displays page for superPaper', async function () {
    render(<SettingsPageRoot />)

    await waitFor(() => {
      screen.getByText('Account settings')
    })
    screen.getByText('Emails')
    screen.getByText('Update account info')
    screen.getByText('Change password')
    screen.getByText('superPaper beta program')
    screen.getByText('Sessions')
    screen.getByText('Email preferences')
    screen.getByRole('button', {
      name: 'Delete your account',
    })
  })

  it('sends tracking event on load', async function () {
    render(<SettingsPageRoot />)

    sinon.assert.calledOnce(sendMBSpy)
    sinon.assert.calledWith(sendMBSpy, 'settings-view')
  })
})
