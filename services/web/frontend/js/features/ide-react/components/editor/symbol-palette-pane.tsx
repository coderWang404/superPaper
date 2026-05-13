import React, { ElementType, FC } from 'react'
import importSuperPaperModules from '../../../../../macros/import-superpaper-module.macro'

const symbolPaletteComponents = importSuperPaperModules(
  'sourceEditorSymbolPalette'
) as { import: { default: ElementType }; path: string }[]

const SymbolPalettePane: FC = () => {
  return (
    <div className="ide-react-symbol-palette">
      {symbolPaletteComponents.map(
        ({ import: { default: Component }, path }) => (
          <Component key={path} />
        )
      )}
    </div>
  )
}

export default SymbolPalettePane
