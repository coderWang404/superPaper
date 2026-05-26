import { expect } from 'vitest'

import {
  buildClineBrowserSmokeConfig,
  buildLocaleCookie,
  redactClineBrowserSmokeConfig,
} from '../../../../scripts/ai_agent_cline_browser_smoke_config.mjs'

describe('AiAgentClineBrowserSmokeConfig', function () {
  it('requires explicit real login credentials and project id', function () {
    expect(() => buildClineBrowserSmokeConfig({})).to.throw(
      'SUPERPAPER_SMOKE_EMAIL is required'
    )
    expect(() =>
      buildClineBrowserSmokeConfig({
        SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
      })
    ).to.throw('SUPERPAPER_SMOKE_PASSWORD is required')
    expect(() =>
      buildClineBrowserSmokeConfig({
        SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
        SUPERPAPER_SMOKE_PASSWORD: 'secret',
      })
    ).to.throw('SUPERPAPER_SMOKE_PROJECT_ID is required')
  })

  it('builds stable defaults for the local Cline browser smoke', function () {
    const config = buildClineBrowserSmokeConfig({
      SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
      SUPERPAPER_SMOKE_PASSWORD: 'secret',
      SUPERPAPER_SMOKE_PROJECT_ID: 'project-one',
    })

    expect(config).to.deep.include({
      baseUrl: 'http://127.0.0.1:23000',
      email: 'user@example.com',
      password: 'secret',
      projectId: 'project-one',
      providerName: 'Root Channel Provider',
      model: 'gpt-5.2',
      headless: true,
      screenshotDir: 'output/playwright',
      timeoutMs: 180000,
    })
    expect(config.prompt).to.contain('low-impact')
    expect(config.locale).to.equal('en')
    expect(config.expected.runSummary).to.equal('Run summary')
    expect(config.expected.detailedWorklog).to.equal('Detailed work log')
    expect(config.expected.actCompleted).to.equal('Act: completed')
  })

  it('builds zh-CN browser smoke expectations', function () {
    const config = buildClineBrowserSmokeConfig({
      SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
      SUPERPAPER_SMOKE_PASSWORD: 'secret',
      SUPERPAPER_SMOKE_PROJECT_ID: 'project-one',
      SUPERPAPER_SMOKE_LOCALE: 'zh-CN',
    })

    expect(config.locale).to.equal('zh-CN')
    expect(config.languageCookieName).to.equal('superpaper_lang')
    expect(config.expected.aiAssistantTab).to.equal('AI 助手')
    expect(config.expected.aiAssistantHeading).to.equal('AI 助手')
    expect(config.expected.promptLabel).to.equal('询问当前项目')
    expect(config.expected.providerLabel).to.equal('渠道')
    expect(config.expected.modelLabel).to.equal('模型')
    expect(config.expected.runButton).to.equal('规划')
    expect(config.expected.fixWithAgent).to.equal('交给 Agent 修复')
    expect(config.expected.firstCompilerError).to.equal('第一个编译错误')
    expect(config.expected.runSummary).to.equal('运行摘要')
    expect(config.expected.detailedWorklog).to.equal('详细工作日志')
    expect(config.expected.result).to.equal('结果')
    expect(config.expected.actCompleted).to.equal('执行：已完成')
  })

  it('builds a server language cookie for non-English browser smoke runs', function () {
    const cookie = buildLocaleCookie({
      baseUrl: 'http://127.0.0.1:23000',
      locale: 'zh-CN',
      languageCookieName: 'superpaper_lang',
    })

    expect(cookie).to.deep.equal({
      name: 'superpaper_lang',
      value: 'zh-CN',
      url: 'http://127.0.0.1:23000',
    })
    expect(
      buildLocaleCookie({
        baseUrl: 'http://127.0.0.1:23000',
        locale: 'en',
        languageCookieName: 'superpaper_lang',
      })
    ).to.equal(null)
  })

  it('builds direct edit browser smoke settings', function () {
    const config = buildClineBrowserSmokeConfig({
      SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
      SUPERPAPER_SMOKE_PASSWORD: 'secret',
      SUPERPAPER_SMOKE_PROJECT_ID: 'project-one',
      SUPERPAPER_SMOKE_DIRECT_EDIT: 'true',
      SUPERPAPER_SMOKE_EDIT_FILE: 'main.tex',
      SUPERPAPER_SMOKE_EDIT_MARKER: 'SMOKE_MARKER',
    })

    expect(config.directEdit.enabled).to.equal(true)
    expect(config.expected.compileDiagnosticHandoff).to.equal(false)
    expect(config.directEdit.file).to.equal('main.tex')
    expect(config.directEdit.marker).to.equal('SMOKE_MARKER')
    expect(config.prompt).to.contain('SMOKE_MARKER')
    expect(config.prompt).to.contain('main.tex')
  })

  it('redacts secrets before printing config', function () {
    const config = buildClineBrowserSmokeConfig({
      SUPERPAPER_BASE_URL: 'http://localhost:23000/',
      SUPERPAPER_SMOKE_EMAIL: 'user@example.com',
      SUPERPAPER_SMOKE_PASSWORD: 'secret',
      SUPERPAPER_SMOKE_PROJECT_ID: 'project-one',
      SUPERPAPER_SMOKE_HEADLESS: 'false',
      SUPERPAPER_SMOKE_TIMEOUT_MS: '2500',
    })

    expect(config.baseUrl).to.equal('http://localhost:23000')
    expect(config.headless).to.equal(false)
    expect(config.timeoutMs).to.equal(2500)
    expect(redactClineBrowserSmokeConfig(config).password).to.equal(
      '[redacted]'
    )
  })
})
