import { fireEvent, render, screen } from '@testing-library/react'
import { expect } from 'chai'
import sinon from 'sinon'
import Input from '../../../../../../frontend/js/features/settings/components/emails/add-email/input'

describe('<AddEmailInput/>', function () {
  const defaultProps = {
    onChange: () => {},
    handleAddNewEmail: () => {},
  }

  it('renders the secondary email input', function () {
    render(<Input {...defaultProps} />)
    screen.getByTestId('secondary-email')
  })

  it('dispatches change events as text is entered', function () {
    const onChangeStub = sinon.stub()
    render(<Input {...defaultProps} onChange={onChangeStub} />)

    fireEvent.change(screen.getByTestId('secondary-email'), {
      target: { value: 'user@example.com' },
    })

    expect(onChangeStub.calledWith('user@example.com')).to.equal(true)
  })

  it('submits on Enter for valid emails only', function () {
    const handleAddNewEmailStub = sinon.stub()
    render(
      <Input
        {...defaultProps}
        handleAddNewEmail={handleAddNewEmailStub}
      />
    )

    fireEvent.change(screen.getByTestId('secondary-email'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.keyDown(screen.getByTestId('secondary-email'), { key: 'Enter' })
    expect(handleAddNewEmailStub.calledOnce).to.equal(true)

    fireEvent.change(screen.getByTestId('secondary-email'), {
      target: { value: 'invalid@' },
    })
    fireEvent.keyDown(screen.getByTestId('secondary-email'), { key: 'Enter' })
    expect(handleAddNewEmailStub.calledOnce).to.equal(true)
  })
})
