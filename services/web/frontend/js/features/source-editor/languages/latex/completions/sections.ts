import { CompletionContext, CompletionSection } from '@codemirror/autocomplete'
import importSuperPaperModules from '../../../../../../macros/import-superpaper-module.macro'

type SectionGenerator = (
  context: CompletionContext,
  type: string
) => CompletionSection | string | undefined
const sectionTitleGenerators: Array<SectionGenerator> = importSuperPaperModules(
  'sectionTitleGenerators'
).map(
  (item: { import: { getSection: SectionGenerator } }) => item.import.getSection
)

export function maybeGetSectionForOption(
  context: CompletionContext,
  type: string
) {
  for (const generator of sectionTitleGenerators) {
    const section = generator(context, type)
    if (section !== undefined) {
      return section
    }
  }
  return undefined
}
