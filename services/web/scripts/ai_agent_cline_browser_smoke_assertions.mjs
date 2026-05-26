/* eslint-disable @superpaper/require-script-runner */
// Local/CI browser smoke assertions only; they run under the smoke script.

export async function assertVisibleCompileDiagnostic(page, expected = {}) {
  await expectVisibleText(
    page,
    expected.firstCompilerError || /First compiler error/i
  )
  await expectVisibleText(page, 'pdflatex: gave an error')
}

export async function assertNoVisibleRawTranslationKeys(page) {
  const visibleText = await page.locator('body').innerText()
  const rawKeyMatch = visibleText.match(/\bai_assistant_[a-z0-9_]+\b/)
  if (rawKeyMatch) {
    throw new Error(
      `Visible raw AI Assistant translation key: ${rawKeyMatch[0]}`
    )
  }
}

export async function expectVisibleText(page, text) {
  const matches = page.getByText(text, { exact: false })
  await matches.first().waitFor({ state: 'attached' })
  const count = await matches.count()
  for (let index = 0; index < count; index += 1) {
    if (await matches.nth(index).isVisible().catch(() => false)) {
      return
    }
  }
  throw new Error(`Text not visible: ${String(text)}`)
}
