import fs from 'node:fs'
import Path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  buildCoverageReport,
  evaluateCoverageChecks,
} from '../../../../scripts/translations/checkCoverage.js'
import { evaluateUnusedKeyChecks } from '../../../../scripts/translations/cleanupUnusedLocales.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const WEB_ROOT = Path.join(__dirname, '../../../../')

describe('translation coverage script', function () {
  it('uses set-based diffs for locale and extracted translation coverage', function () {
    const report = buildCoverageReport({
      locales: new Map([
        [
          'en',
          {
            present_in_all_files: 'Present in all files',
            missing_in_zh: 'Missing in zh-CN',
            missing_from_extracted: 'Missing from extracted',
          },
        ],
        [
          'zh-CN',
          {
            present_in_all_files: '所有文件都有',
            only_in_zh: '仅中文有',
          },
        ],
      ]),
      extractedTranslations: {
        present_in_all_files: 'Present in all files',
        missing_in_zh: 'Missing in zh-CN',
        only_in_extracted: 'Only in extracted',
      },
    })

    expect(report.localeDiffs.get('zh-CN')).toMatchObject({
      missingKeys: ['missing_from_extracted', 'missing_in_zh'],
      extraneousKeys: ['only_in_zh'],
    })
    expect(report.extractedMissingFromEnKeys).toEqual(['only_in_extracted'])
    expect(report.extractedMissingFromZhCnKeys).toEqual([
      'missing_in_zh',
      'only_in_extracted',
    ])
  })

  it('fails check mode only when current zh-CN debt baselines are exceeded', function () {
    const report = buildCoverageReport({
      locales: new Map([
        ['en', { a: 'A', b: 'B' }],
        ['zh-CN', { a: '甲', only_in_zh: '仅中文有' }],
      ]),
      extractedTranslations: { a: 'A', b: 'B', only_in_extracted: 'Only' },
    })

    expect(
      evaluateCoverageChecks(report, {
        zhCnMissing: 1,
        extractedZhCnMissing: 2,
      })
    ).toMatchObject({
      ok: true,
      warnings: [
        'zh-CN has 1 key not present in en.json.',
        'frontend/extracted-translations.json has 1 key not present in en.json.',
      ],
    })

    expect(
      evaluateCoverageChecks(report, {
        zhCnMissing: 0,
        extractedZhCnMissing: 1,
      })
    ).toMatchObject({
      ok: false,
      failures: [
        'zh-CN is missing 1 en.json key, which exceeds the baseline of 0.',
        'frontend extracted translations are missing 2 zh-CN keys, which exceeds the baseline of 1.',
      ],
    })
  })

  it('is wired into locale linting', function () {
    const lintLocales = fs.readFileSync(
      Path.join(WEB_ROOT, 'bin/lint_locales'),
      'utf-8'
    )

    expect(lintLocales).toContain(
      'node scripts/translations/checkCoverage.js --check'
    )
    expect(lintLocales).toContain(
      'node scripts/translations/cleanupUnusedLocales.js --check'
    )
  })

  it('allows the current unused-key debt baseline without allowing regressions', function () {
    expect(evaluateUnusedKeyChecks(['unused_a', 'unused_b'], 2)).toMatchObject({
      ok: true,
      failures: [],
      warnings: ['unused translation key debt is at the baseline: 2/2.'],
    })

    expect(evaluateUnusedKeyChecks(['unused_a', 'unused_b', 'unused_c'], 2))
      .toMatchObject({
        ok: false,
        failures: [
          'unused translation key debt is 3 keys, which exceeds the baseline of 2.',
        ],
      })
  })
})
