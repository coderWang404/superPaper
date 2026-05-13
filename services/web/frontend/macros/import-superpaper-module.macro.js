const { createMacro, MacroError } = require('babel-plugin-macros')

// This copy of the settings will be taken when webpack starts.
// Be sure to restart webpack after making changes to the settings.
const Settings = require('@superpaper/settings')

const macro = createMacro(importsuperPaperModuleMacro)

function importsuperPaperModuleMacro({ references, state, babel }) {
  references.default.forEach(referencePath => {
    const { types: t } = babel

    const modulePaths = getModulePaths(referencePath.parentPath)

    const { importNodes, importedVariables } = modulePaths.reduce(
      (all, path) => {
        // Generate a unique variable name for the module
        const id = referencePath.scope.generateUidIdentifier(path)

        // Generate an import statement for the module
        // In the form: import * as __ID__ from "__PATH__"
        all.importNodes.push(
          t.importDeclaration(
            [t.importNamespaceSpecifier(id)],
            t.stringLiteral(path)
          )
        )

        // Also keep track of the imported variable, so it can be added to
        // the assigned array
        all.importedVariables.push(
          t.objectExpression([
            t.objectProperty(t.identifier('import'), id),
            t.objectProperty(t.identifier('path'), t.stringLiteral(path)),
          ])
        )

        return all
      },
      { importNodes: [], importedVariables: [] }
    )

    // Generate an array of imported variables
    const arrayExpression = t.arrayExpression(importedVariables)

    // Inject the import statements at the top of the file
    const program = state.file.path
    program.node.body.unshift(...importNodes)

    // Replace the importFromSettings line with the generated array of imported
    // variables
    referencePath.parentPath.replaceWith(arrayExpression)
  })
}

function getModulePaths(callExpressionPath) {
  // Get the first argument to importFromSettings
  const key = callExpressionPath.get('arguments')[0].evaluate().value

  if (!Settings.superPaperModuleImports) {
    throw new MacroError('Settings.superPaperModuleImports not found')
  }

  // Get the module paths
  const modulePaths = Settings.superPaperModuleImports[key]

  if (!modulePaths) {
    throw new MacroError(`superPaper module '${key}' not found`)
  }

  return modulePaths
}

module.exports = macro
