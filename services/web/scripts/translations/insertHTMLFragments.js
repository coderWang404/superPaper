/*
 This script will aid the process of inserting HTML fragments into all the
  locales.
 We are migrating from
    locale: 'PRE __key1__ POST'
    pug: translate(localeKey, { key1: '<b>VALUE</b>' })
 to
    locale: 'PRE <0>__key1__</0> POST'
    pug: translate(localeKey, { key1: 'VALUE' }, ['b'])


 MAPPING entries:
  localeKey: ['key1', 'key2']
  click_here_to_view_sl_in_lng: ['lngName']
 */
import TransformLocales from './transformLocales.js'
import { fileURLToPath } from 'url'

const MAPPING = {
  support_lots_of_features: ['help_guides_link'],
  nothing_to_install_ready_to_go: ['start_now'],
  all_packages_and_templates: ['templatesLink'],
  github_merge_failed: ['sharelatex_branch', 'master_branch'],
  kb_suggestions_enquiry: ['kbLink'],
  sure_you_want_to_restore_before: ['filename'],
  project_ownership_transfer_confirmation_1: ['user', 'project'],
  you_introed_high_number: ['numberOfPeople'],
  you_introed_small_number: ['numberOfPeople'],
  click_here_to_view_sl_in_lng: ['lngName'],
}

function transformLocale(locale, components) {
  components.forEach((key, idx) => {
    const i18nKey = `__${key}__`
    const replacement = `<${idx}>${i18nKey}</${idx}>`
    if (!locale.includes(replacement)) {
      locale = locale.replace(new RegExp(i18nKey, 'g'), replacement)
    }
  })
  return locale
}

function main() {
  TransformLocales.transformLocales(MAPPING, transformLocale)
}

if (
  fileURLToPath(import.meta.url).replace(/\.js$/, '') ===
  process.argv[1].replace(/\.js$/, '')
) {
  main()
}
