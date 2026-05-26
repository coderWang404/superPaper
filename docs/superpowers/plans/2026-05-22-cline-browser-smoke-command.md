# Cline Browser Smoke Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a checked-in browser smoke command that verifies the real single-agent Cline route from login through AI Assistant worklog/runtime summary rendering.

**Architecture:** Keep Cline as the only normal project agent runtime. The new command is a local/CI smoke harness around the existing web UI: it reads explicit environment variables, opens the real running app with Playwright, logs in, opens one real project, runs a low-impact Agent turn, asserts the Cline runtime policy and checkpoint UI, and saves evidence under `output/playwright/`.

**Tech Stack:** Node.js ESM, Vitest, Playwright, existing local superPaper web app on `127.0.0.1:23000`, existing root AI provider configuration.

---

## File Structure

- Create `services/web/scripts/ai_agent_cline_browser_smoke_config.mjs`
  - Parse and validate smoke environment variables.
  - Keep defaults for base URL, model, prompt, screenshot directory, and timeout.
  - Redact the password in printable config.
- Create `services/web/scripts/ai_agent_cline_browser_smoke.mjs`
  - Dynamically import Playwright.
  - Log in with real credentials.
  - Open `/project/:projectId`, switch to AI Assistant and Agent mode, select the model, submit the smoke prompt, wait for Cline runtime/worklog/checkpoint UI, and save a screenshot.
- Create `services/web/test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs`
  - Unit-test required environment validation and default parsing.
- Modify `services/web/package.json`
  - Add `smoke:cline-agent-browser`.
  - Add `playwright` as a dev dependency.
- Modify `yarn.lock`
  - Refresh through Yarn.
- Modify `docs/superpowers/plans/2026-05-20-cline-primary-agent-runtime.md`
  - Remove the durable browser smoke command from remaining gaps once verified.

## Task 1: Smoke Config Parser

- [x] **Step 1: Write failing config tests**

Create `services/web/test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs`:

```js
import { expect } from 'vitest'
import {
  buildClineBrowserSmokeConfig,
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
    expect(redactClineBrowserSmokeConfig(config).password).to.equal('[redacted]')
  })
})
```

- [x] **Step 2: Run red test**

Run:

```bash
corepack yarn --cwd services/web vitest run test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
```

Expected: fail because the config module does not exist.

- [x] **Step 3: Implement config parser**

Create the parser with `requireEnv`, `normalizeBaseUrl`, `parseBoolean`, `parseTimeout`, `buildClineBrowserSmokeConfig`, and `redactClineBrowserSmokeConfig`.

- [x] **Step 4: Run green config test**

Run the same Vitest command. Expected: 3 passing.

## Task 2: Browser Smoke Runner

- [x] **Step 1: Create Playwright smoke runner**

Create `services/web/scripts/ai_agent_cline_browser_smoke.mjs`. The runner must:

```js
#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildClineBrowserSmokeConfig,
  redactClineBrowserSmokeConfig,
} from './ai_agent_cline_browser_smoke_config.mjs'

// Dynamic import so config unit tests do not require Playwright.
const { chromium } = await import('playwright')
```

Core assertions:

- login page accepts `input[name="email"]` and `input[name="password"]`, then clicks `button[type="submit"]`.
- project URL contains `/project/:projectId`.
- AI Assistant tab can be opened.
- Provider control includes `Root Channel Provider`.
- Model control can select `gpt-5.2`.
- Agent mode can submit the configured prompt.
- Worklog/run surface renders `Cline runtime`, `Shell: enabled`, `External tools: disabled`, `MCP: disabled`, `Subagents: disabled`, `Run summary`, `Before`, and `After`.
- Screenshot path is printed.

- [x] **Step 2: Add package script and dependency**

Add to `services/web/package.json`:

```json
"smoke:cline-agent-browser": "node scripts/ai_agent_cline_browser_smoke.mjs"
```

Add `playwright` as a dev dependency using Yarn.

## Task 3: Documentation And Gap Update

- [x] **Step 1: Update primary route remaining gaps**

In `docs/superpowers/plans/2026-05-20-cline-primary-agent-runtime.md`, update the remaining gaps line so the durable browser smoke command is no longer listed after verification.

- [x] **Step 2: Add smoke command usage to this plan**

Append the exact command:

```bash
SUPERPAPER_SMOKE_EMAIL='...' \
SUPERPAPER_SMOKE_PASSWORD='...' \
SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' \
corepack yarn --cwd services/web smoke:cline-agent-browser
```

First-time Playwright browser setup:

```bash
corepack yarn --cwd services/web playwright install chromium
```

## Task 4: Verification

- [x] **Step 1: Run config tests**

```bash
corepack yarn --cwd services/web vitest run test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
```

- [x] **Step 2: Run targeted lint**

```bash
cd services/web
node ../../node_modules/eslint/bin/eslint.js scripts/ai_agent_cline_browser_smoke_config.mjs scripts/ai_agent_cline_browser_smoke.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs
```

- [x] **Step 3: Run diff check**

```bash
git diff --check
```

- [x] **Step 4: Run real smoke when local app is available**

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' \
SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' \
SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' \
corepack yarn --cwd services/web smoke:cline-agent-browser
```

Expected: command exits 0 and writes a screenshot under `output/playwright/`.

## Current Status

Implemented on 2026-05-22. The repository now has a first-party `smoke:cline-agent-browser` command that launches Playwright, logs into the local app with explicit real credentials, opens a real project, switches to AI Assistant Agent mode, verifies the root provider/model surface, submits a low-impact prompt, expands the Cline runtime worklog, asserts the direct-edit policy lines, checks run summary checkpoint labels, and saves a screenshot.

## Verification Results

- Red config test: `corepack yarn --cwd services/web vitest run test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs` -> failed because `scripts/ai_agent_cline_browser_smoke_config.mjs` did not exist.
- Green config test after implementation: same command -> 1 file, 3 tests passed.
- Final config test: `corepack yarn --cwd services/web vitest run test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs` -> 1 file, 3 tests passed.
- Targeted lint: `node ../../node_modules/eslint/bin/eslint.js scripts/ai_agent_cline_browser_smoke_config.mjs scripts/ai_agent_cline_browser_smoke.mjs test/unit/src/Scripts/AiAgentClineBrowserSmokeConfig.test.mjs` -> passed.
- Whitespace check: `git diff --check` -> passed.
- First real smoke attempt failed before browser launch because Playwright browsers were not installed. Environment fixed with `corepack yarn --cwd services/web playwright install chromium`.
- Real smoke selector hardening:
  - Provider assertion now checks the Provider select options because `<option>` text is hidden in Playwright visibility checks.
  - Submit click is scoped to `data-testid="ai-assistant-composer"` because suggested prompt buttons can also contain "Plan".
  - Runtime policy assertions expand the `Cline runtime` worklog item before checking detailed policy lines.
- Real browser smoke with `Root Channel Provider` / `gpt-5.2` on project `6a0da04be1d53948727c0876` passed:

```bash
SUPERPAPER_SMOKE_EMAIL='browser-full-20260520@superpaper.local' SUPERPAPER_SMOKE_PASSWORD='superpaper-test-20260521' SUPERPAPER_SMOKE_PROJECT_ID='6a0da04be1d53948727c0876' corepack yarn --cwd services/web smoke:cline-agent-browser
```

Screenshot: `output/playwright/superpaper-cline-browser-smoke-2026-05-21T16-39-45-144Z.png`.
