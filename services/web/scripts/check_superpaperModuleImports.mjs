import CE_CONFIG from '../config/settings.defaults.js'
import PRO_CONFIG from '../config/settings.overrides.server-pro.js'
import SAAS_CONFIG from '../config/settings.webpack.js'

function getsuperPaperModuleImports(settings) {
  return Object.keys(settings.superPaperModuleImports).sort().join(',')
}

function main() {
  const CE = getsuperPaperModuleImports(CE_CONFIG)
  const PRO = getsuperPaperModuleImports(CE_CONFIG.mergeWith(PRO_CONFIG))
  const SAAS = getsuperPaperModuleImports(CE_CONFIG.mergeWith(SAAS_CONFIG))

  if (CE !== PRO) {
    throw new Error(
      'settings.defaults is missing superPaperModuleImports defined in settings.overrides.server-pro'
    )
  }
  if (CE !== SAAS) {
    throw new Error(
      'settings.defaults is missing superPaperModuleImports defined in settings.webpack'
    )
  }
}

main()
