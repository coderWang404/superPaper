import fs from 'fs'
import Path from 'path'
import { fileURLToPath } from 'node:url'
import { loadLocale } from './utils.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const LOCALES = Path.join(__dirname, '../../locales')
const EXTRACTED_TRANSLATIONS = Path.join(
  __dirname,
  '../../frontend/extracted-translations.json'
)
const CHECK_BASELINES = {
  zhCnMissing: 547,
  extractedZhCnMissing: 116,
}
const DRIFT_SAMPLE_LIMIT = 20
const CHECK = process.argv.includes('--check')
const SORT_BY_PROGRESS = process.argv.includes('--sort-by-progress')

export function diffKeys(source, target) {
  const targetKeys = new Set(Object.keys(target))
  return Object.keys(source)
    .filter(key => !targetKeys.has(key))
    .sort()
}

export function buildCoverageReport({ locales, extractedTranslations }) {
  const en = locales.get('en')
  if (!en) {
    throw new Error('Missing en locale')
  }
  const zhCn = locales.get('zh-CN')
  if (!zhCn) {
    throw new Error('Missing zh-CN locale')
  }

  const enKeyCount = Object.keys(en).length
  const localeDiffs = new Map()
  const rows = []

  for (const [name, locale] of locales) {
    const missingKeys = diffKeys(en, locale)
    const extraneousKeys = diffKeys(locale, en)
    const done = enKeyCount - missingKeys.length
    localeDiffs.set(name, {
      missingKeys,
      extraneousKeys,
    })
    rows.push({
      name,
      done,
      missing: missingKeys.length,
      extraneous: extraneousKeys.length,
      progress: formatProgress(done, enKeyCount),
    })
  }

  return {
    enKeyCount,
    rows,
    localeDiffs,
    extractedMissingFromEnKeys: diffKeys(extractedTranslations, en),
    extractedMissingFromZhCnKeys: diffKeys(extractedTranslations, zhCn),
  }
}

export function evaluateCoverageChecks(
  report,
  baselines = CHECK_BASELINES
) {
  const zhCnMissing = report.localeDiffs.get('zh-CN').missingKeys.length
  const zhCnExtraneous = report.localeDiffs.get('zh-CN').extraneousKeys.length
  const extractedMissingZhCn = report.extractedMissingFromZhCnKeys.length
  const extractedMissingEn = report.extractedMissingFromEnKeys.length
  const failures = []
  const warnings = []

  if (zhCnMissing > baselines.zhCnMissing) {
    failures.push(
      `zh-CN is missing ${zhCnMissing} en.json ${pluralize(
        zhCnMissing,
        'key'
      )}, which exceeds the baseline of ${baselines.zhCnMissing}.`
    )
  }
  if (extractedMissingZhCn > baselines.extractedZhCnMissing) {
    failures.push(
      `frontend extracted translations are missing ${extractedMissingZhCn} zh-CN ${pluralize(
        extractedMissingZhCn,
        'key'
      )}, which exceeds the baseline of ${baselines.extractedZhCnMissing}.`
    )
  }
  if (zhCnExtraneous > 0) {
    warnings.push(
      `zh-CN has ${zhCnExtraneous} ${pluralize(
        zhCnExtraneous,
        'key'
      )} not present in en.json.`
    )
  }
  if (extractedMissingEn > 0) {
    warnings.push(
      `frontend/extracted-translations.json has ${extractedMissingEn} ${pluralize(
        extractedMissingEn,
        'key'
      )} not present in en.json.`
    )
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
  }
}

async function loadLocales() {
  const locales = new Map()
  for (const file of await fs.promises.readdir(LOCALES)) {
    if (file === 'README.md') continue
    const name = file.replace('.json', '')
    locales.set(name, loadLocale(name))
  }
  return locales
}

async function loadExtractedTranslations() {
  return JSON.parse(await fs.promises.readFile(EXTRACTED_TRANSLATIONS, 'utf-8'))
}

function formatProgress(done, enKeyCount) {
  return ((100 * done) / enKeyCount).toFixed(2).padStart(5, ' ') + '%'
}

function pluralize(count, singular) {
  return count === 1 ? singular : `${singular}s`
}

function formatKeySample(keys) {
  if (keys.length === 0) {
    return ''
  }
  const sample = keys.slice(0, DRIFT_SAMPLE_LIMIT).join(', ')
  const remaining = keys.length - DRIFT_SAMPLE_LIMIT
  return remaining > 0 ? `${sample}, ... (${remaining} more)` : sample
}

function printCheckReport(report, result) {
  const zhCnDiff = report.localeDiffs.get('zh-CN')

  console.log(
    `zh-CN missing baseline: ${zhCnDiff.missingKeys.length}/${CHECK_BASELINES.zhCnMissing}`
  )
  console.log(
    `frontend extracted zh-CN missing baseline: ${report.extractedMissingFromZhCnKeys.length}/${CHECK_BASELINES.extractedZhCnMissing}`
  )
  for (const warning of result.warnings) {
    console.warn(`WARN: ${warning}`)
  }
  if (zhCnDiff.extraneousKeys.length > 0) {
    console.warn(
      `zh-CN - en drift: ${formatKeySample(zhCnDiff.extraneousKeys)}`
    )
  }
  if (report.extractedMissingFromEnKeys.length > 0) {
    console.warn(
      `frontend/extracted - en drift: ${formatKeySample(
        report.extractedMissingFromEnKeys
      )}`
    )
  }
  for (const failure of result.failures) {
    console.error(`ERROR: ${failure}`)
  }
}

export async function main() {
  const report = buildCoverageReport({
    locales: await loadLocales(),
    extractedTranslations: await loadExtractedTranslations(),
  })
  const rows = [...report.rows]
  if (SORT_BY_PROGRESS) {
    rows.sort((a, b) => b.done - a.done)
  }
  console.table(rows)

  if (CHECK) {
    const result = evaluateCoverageChecks(report)
    printCheckReport(report, result)
    if (!result.ok) {
      throw new Error('translation coverage check failed')
    }
  }
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url)
}

if (isMainModule()) {
  try {
    await main()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
