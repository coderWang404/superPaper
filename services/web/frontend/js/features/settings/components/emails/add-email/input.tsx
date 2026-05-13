import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef } from 'react'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import { isValidEmail } from '@/shared/utils/email'

type InputProps = {
  onChange: (value: string) => void
  handleAddNewEmail: () => void
}

function Input({ onChange, handleAddNewEmail }: InputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputValueRef = useRef('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [inputRef])

  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      inputValueRef.current = event.target.value
      onChange(event.target.value)
    },
    [onChange]
  )

  const handleKeyDownEvent = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        if (!isValidEmail(inputValueRef.current)) {
          return
        }
        handleAddNewEmail()
      }
    },
    [handleAddNewEmail]
  )

  return (
    <OLFormControl
      id="secondary-email"
      data-testid="secondary-email"
      type="email"
      onChange={handleEmailChange}
      onKeyDown={handleKeyDownEvent}
      ref={inputRef}
    />
  )
}

export default Input
