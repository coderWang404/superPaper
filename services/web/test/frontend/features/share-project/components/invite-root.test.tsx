import { expect } from 'chai'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import fetchMock from 'fetch-mock'
import sinon from 'sinon'
import InviteRoot from '@/features/share-project/invite-root'
import { location } from '@/shared/components/location'

describe('<InviteRoot />', function () {
  beforeEach(function () {
    this.locationWrapperSandbox = sinon.createSandbox()
    this.locationWrapperStub = this.locationWrapperSandbox.stub(location)
    window.metaAttributesCache.set('ol-user', { email: 'test@example.com' })
    window.metaAttributesCache.set('ol-projectName', 'Test Project')
    window.metaAttributesCache.set('ol-project_id', 'project123')
    window.metaAttributesCache.set('ol-inviteToken', 'invite-token')
  })

  afterEach(function () {
    this.locationWrapperSandbox.restore()
    fetchMock.removeRoutes().clearHistory()
  })

  it('shows an error and allows retry when accepting an invite fails', async function () {
    fetchMock.post(
      '/project/project123/invite/token/invite-token/accept',
      500
    )

    render(<InviteRoot />)

    const button = await screen.findByRole('button', {
      name: 'Join project',
    })
    fireEvent.click(button)

    await screen.findByText('Something went wrong. Please try again.')
    expect(this.locationWrapperStub.assign).not.to.have.been.called

    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).to.be.false
    )
  })
})
