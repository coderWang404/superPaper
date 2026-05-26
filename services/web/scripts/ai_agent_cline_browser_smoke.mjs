/* eslint-disable @superpaper/require-script-runner */
// Local/CI browser smoke only; ScriptRunner would require app-side script logs.

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildClineBrowserSmokeConfig,
  buildLocaleCookie,
  redactClineBrowserSmokeConfig,
} from './ai_agent_cline_browser_smoke_config.mjs'
import {
  assertNoVisibleRawTranslationKeys,
  assertVisibleCompileDiagnostic,
  expectVisibleText,
} from './ai_agent_cline_browser_smoke_assertions.mjs'

const config = buildClineBrowserSmokeConfig()

console.warn(
  'Starting Cline browser smoke:',
  JSON.stringify(redactClineBrowserSmokeConfig(config), null, 2)
)

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: config.headless })
const page = await browser.newPage()
page.setDefaultTimeout(config.timeoutMs)

try {
  await configureLocale(page, config)
  await login(page, config)
  await openProject(page, config)
  await openAiAssistant(page, config)
  await configureAgent(page, config)
  await runAgentSmoke(page, config)
  const screenshotPath = await saveScreenshot(page, config)

  console.warn(`Cline browser smoke passed. Screenshot: ${screenshotPath}`)
} finally {
  await browser.close()
}

async function configureLocale(page, config) {
  const localeCookie = buildLocaleCookie(config)
  if (!localeCookie) {
    return
  }

  await page.context().addCookies([localeCookie])
}

async function login(page, config) {
  await page.goto(`${config.baseUrl}/login`, { waitUntil: 'domcontentloaded' })

  await fillFirstVisible(page, [
    'input[name="email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
  ], config.email)
  await fillFirstVisible(page, [
    'input[name="password"]',
    'input[type="password"]',
    'input[autocomplete="current-password"]',
  ], config.password)

  await Promise.all([
    page.waitForURL(url => !url.pathname.includes('/login'), {
      timeout: config.timeoutMs,
    }).catch(() => undefined),
    clickFirstVisible(page, [
      'form[action="/login"] button[type="submit"]',
      'form[action="/login"] input[type="submit"]',
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Login")',
    ]),
  ])
}

async function openProject(page, config) {
  const projectUrl = new URL(`${config.baseUrl}/project/${config.projectId}`)

  await page.goto(projectUrl.toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForURL(url => url.pathname.includes(`/project/${config.projectId}`))
  await page.getByRole('navigation', { name: 'Sidebar' }).waitFor()
}

async function openAiAssistant(page, config) {
  await clickFirstVisible(page, [
    '#ide-rail-tabs-tab-ai-assistant',
    `role=tab[name="${config.expected.aiAssistantTab}"]`,
  ])
  await expectVisibleText(page, config.expected.aiAssistantHeading)
}

async function configureAgent(page, config) {
  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await expectSelectContainsOption(
    page,
    config.expected.providerLabel,
    config.providerName
  )

  const modelSelector = page.getByLabel(config.expected.modelLabel)
  await modelSelector.selectOption({ label: config.model }).catch(async () => {
    await modelSelector.selectOption(config.model)
  })
}

async function runAgentSmoke(page, config) {
  const prompt = page.getByLabel(config.expected.promptLabel)
  await prompt.fill(config.prompt)

  const composer = page.getByTestId('ai-assistant-composer')
  const runButton = composer.getByRole('button', {
    name: config.expected.runButton,
    exact: true,
  })
  await runButton.click()

  await expectVisibleText(page, config.expected.runSummary)
  await page.getByText(config.expected.detailedWorklog, { exact: true }).click()
  await expectVisibleText(page, config.expected.clineRuntime)
  await page.getByText(config.expected.clineRuntime, { exact: true }).first().click()

  for (const expectedText of [
    config.expected.shellEnabled,
    config.expected.externalToolsDisabled,
    config.expected.mcpDisabled,
    config.expected.subagentsDisabled,
    config.expected.beforeCommit,
    config.expected.afterCommit,
  ]) {
    await expectVisibleText(page, expectedText)
  }

  await expectVisibleText(page, config.expected.result)
  await expectVisibleText(page, config.expected.actCompleted)
  if (config.directEdit.enabled) {
    await expectVisibleText(page, config.directEdit.file)
    await expectVisibleText(page, config.directEdit.marker)
  }
  await waitForComposerSubmitIdle(page)
  if (config.expected.compileDiagnosticHandoff) {
    await assertVisibleCompileDiagnostic(page, config.expected)
    await handoffCompileDiagnosticToAgent(page, config)
  }
  await assertNoVisibleRawTranslationKeys(page)
}

async function handoffCompileDiagnosticToAgent(page, config) {
  await page
    .getByRole('button', { name: config.expected.fixWithAgent, exact: true })
    .click()
  await page.waitForFunction(() => {
    const prompt = document.getElementById('ai-assistant-prompt')
    return (
      prompt?.tagName === 'TEXTAREA' &&
      prompt.value.includes('pdflatex: gave an error')
    )
  })

  const promptValue = await page
    .getByLabel(config.expected.promptLabel)
    .inputValue()
  for (const expectedText of [
    'Fix this LaTeX compile error in the current project.',
    'pdflatex: gave an error',
    'Plan the fix first',
  ]) {
    if (!promptValue.includes(expectedText)) {
      throw new Error(
        `Compile diagnostic handoff prompt did not include "${expectedText}".`
      )
    }
  }
}

async function saveScreenshot(page, config) {
  const rootDir = path.resolve(process.cwd(), '../..')
  const screenshotDir = path.resolve(rootDir, config.screenshotDir)
  await fs.mkdir(screenshotDir, { recursive: true })

  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')
  const screenshotPath = path.join(
    screenshotDir,
    `superpaper-cline-browser-smoke-${timestamp}.png`
  )
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return screenshotPath
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const locators = await page.locator(selector).all()
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) {
        await locator.fill(value)
        return
      }
    }
  }
  throw new Error(`No visible input matched selectors: ${selectors.join(', ')}`)
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locators = await page.locator(selector).all()
    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) {
        await locator.click()
        return
      }
    }
  }
  throw new Error(`No visible button matched selectors: ${selectors.join(', ')}`)
}

async function expectSelectContainsOption(page, label, expectedText) {
  const select = page.getByLabel(label)
  await select.waitFor()
  const optionTexts = await select.locator('option').allTextContents()
  if (!optionTexts.includes(expectedText)) {
    throw new Error(
      `${label} options did not include "${expectedText}". Found: ${optionTexts.join(
        ', '
      )}`
    )
  }
}

async function waitForComposerSubmitIdle(page) {
  const submitButton = page
    .getByTestId('ai-assistant-composer')
    .locator('button[type="submit"]')
    .first()
  await submitButton.waitFor()
  const submitButtonHandle = await submitButton.elementHandle()
  if (!submitButtonHandle) {
    throw new Error('Composer submit button was not found')
  }
  await page.waitForFunction(
    button => button.getAttribute('data-ol-loading') === 'false',
    submitButtonHandle
  )
}
