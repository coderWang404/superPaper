import importSuperPaperModules from '../macros/import-superpaper-module.macro'

if (process.env.NODE_ENV === 'development') {
  importSuperPaperModules('devToolbar')
}
