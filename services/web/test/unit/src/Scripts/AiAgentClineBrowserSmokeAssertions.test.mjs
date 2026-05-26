import { expect } from 'vitest'

import {
  assertNoVisibleRawTranslationKeys,
  assertVisibleCompileDiagnostic,
  expectVisibleText,
} from '../../../../scripts/ai_agent_cline_browser_smoke_assertions.mjs'

describe('AiAgentClineBrowserSmokeAssertions', function () {
  it('requires the first compiler diagnostic in the settled smoke page', async function () {
    await assertVisibleCompileDiagnostic(
      makePage('First compiler error\npdflatex: gave an error')
    )
    await assertVisibleCompileDiagnostic(
      makePage('FIRST COMPILER ERROR\npdflatex: gave an error')
    )
    await assertVisibleCompileDiagnostic(
      makePage('第一个编译错误\npdflatex: gave an error'),
      { firstCompilerError: '第一个编译错误' }
    )

    await expectRejectsWith(
      assertVisibleCompileDiagnostic(makePage('No PDF')),
      'First compiler error'
    )
  })

  it('rejects visible raw AI Assistant translation keys', async function () {
    await assertNoVisibleRawTranslationKeys(makePage('AI Assistant\nResult'))

    await expectRejectsWith(
      assertNoVisibleRawTranslationKeys(makePage('ai_assistant_missing_key')),
      'ai_assistant_missing_key'
    )
  })

  it('accepts text when a later matching element is visible', async function () {
    await expectVisibleText(makePageWithMatches([
      { text: 'main.tex', visible: false },
      { text: 'main.tex', visible: true },
    ]), 'main.tex')

    await expectRejectsWith(
      expectVisibleText(
        makePageWithMatches([
          { text: 'main.tex', visible: false },
          { text: 'main.tex', visible: false },
        ]),
        'main.tex'
      ),
      'Text not visible'
    )
  })
})

async function expectRejectsWith(promise, message) {
  try {
    await promise
  } catch (error) {
    expect(error.message).to.contain(message)
    return
  }
  throw new Error(`Expected promise to reject with: ${message}`)
}

function makePage(visibleText) {
  return {
    getByText(text) {
      const visible = text instanceof RegExp
        ? text.test(visibleText)
        : visibleText.includes(text)
      return {
        first() {
          return {
            async waitFor() {
              if (!visible) {
                throw new Error(`Text not visible: ${text}`)
              }
            },
          }
        },
        async count() {
          return visible ? 1 : 0
        },
        nth() {
          return {
            async isVisible() {
              return visible
            },
          }
        },
      }
    },
    locator(selector) {
      if (selector !== 'body') {
        throw new Error(`Unexpected selector: ${selector}`)
      }
      return {
        async innerText() {
          return visibleText
        },
      }
    },
  }
}

function makePageWithMatches(matches) {
  return {
    getByText(text) {
      const matched = matches.filter(match =>
        text instanceof RegExp ? text.test(match.text) : match.text.includes(text)
      )
      return {
        first() {
          return {
            async waitFor(options = {}) {
              const attachedOnly = options.state === 'attached'
              if (
                matched.length === 0 ||
                (!attachedOnly && matched[0].visible !== true)
              ) {
                throw new Error(`Text not visible: ${text}`)
              }
            },
          }
        },
        async count() {
          return matched.length
        },
        nth(index) {
          return {
            async isVisible() {
              return matched[index]?.visible === true
            },
          }
        },
      }
    },
    locator(selector) {
      if (selector !== 'body') {
        throw new Error(`Unexpected selector: ${selector}`)
      }
      return {
        async innerText() {
          return matches.map(match => match.text).join('\n')
        },
      }
    },
  }
}
