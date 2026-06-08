import { expect } from 'chai'
import { fireEvent, render, screen } from '@testing-library/react'
import sinon from 'sinon'
import Invite from '@/features/share-project/invite'

describe('<Invite />', function () {
  it('renders an accept error and keeps the join action available for retry', function () {
    const submitHandler = sinon.stub()

    render(
      <Invite
        projectName="Test Project"
        email="test@example.com"
        submitHandler={submitHandler}
        acceptError
      />
    )

    screen.getByRole('alert')
    screen.getByText('Something went wrong. Please try again.')

    const button = screen.getByRole('button', {
      name: 'Join project',
    }) as HTMLButtonElement
    expect(button.disabled).to.be.false

    fireEvent.click(button)
    expect(submitHandler).to.have.been.calledOnce
  })
})
