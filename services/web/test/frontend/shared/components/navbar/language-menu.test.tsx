import { expect } from 'chai'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetMeta } from '../../../helpers/reset-meta'
import { AccountMenuItems } from '@/shared/components/navbar/account-menu-items'
import LoggedOutItems from '@/shared/components/navbar/logged-out-items'

describe('<LanguageMenu />', function () {
  beforeEach(function () {
    resetMeta()
    window.metaAttributesCache.set('ol-csrfToken', 'csrf-token')
    window.history.pushState({}, '', '/admin#ai-providers')
  })

  it('renders an explicit language menu for logged-out users', async function () {
    render(
      <LoggedOutItems
        showSignUpLink={false}
        currentLangCode="en"
        selectableLanguages={[
          { code: 'en', name: 'English' },
          { code: 'zh-CN', name: '简体中文' },
        ]}
      />
    )

    await userEvent.click(screen.getByRole('menuitem', { name: 'Language' }))

    screen.getByRole('button', { name: 'English' })
    screen.getByRole('button', { name: '简体中文' })

    const languageForm = screen
      .getByRole('button', { name: '简体中文' })
      .closest('form') as HTMLFormElement
    expect(languageForm.action).to.equal('https://www.test-superpaper.com/language')
    expect(languageForm.method).to.equal('post')
    expect(
      languageForm.querySelector<HTMLInputElement>('input[name="_csrf"]')?.value
    ).to.equal('csrf-token')
    expect(
      languageForm.querySelector<HTMLInputElement>('input[name="language"]')
        ?.value
    ).to.equal('zh-CN')
    expect(
      languageForm.querySelector<HTMLInputElement>('input[name="redirect"]')
        ?.value
    ).to.equal('/admin')
  })

  it('renders language controls inside the account menu for logged-in users', function () {
    render(
      <AccountMenuItems
        sessionUser={{ email: 'admin@example.com' }}
        currentLangCode="zh-CN"
        selectableLanguages={[
          { code: 'en', name: 'English' },
          { code: 'zh-CN', name: '简体中文' },
        ]}
      />
    )

    screen.getByText('admin@example.com')
    screen.getByText('Language')
    screen.getByRole('button', { name: 'English' })
    const activeLanguage = screen.getByRole('button', { name: '简体中文' })
    expect(activeLanguage.getAttribute('aria-current')).to.equal('true')
  })
})
