declare module '@replit/codemirror-emacs' {
  import type { Extension } from '@codemirror/state'
  import type { EditorView } from '@codemirror/view'

  export class EmacsHandler {
    view: EditorView
    popEmacsMark(): number[] | undefined
    pushEmacsMark(mark: number[]): void
    static addCommands(commands: Record<string, (handler: EmacsHandler) => void>): void
    static bindKey(key: string, command: unknown): void
  }

  export function emacs(): Extension
}

declare module '@replit/codemirror-indentation-markers' {
  import type { Extension } from '@codemirror/state'

  export function indentationMarkers(options?: {
    hideFirstIndent?: boolean
    highlightActiveBlock?: boolean
  }): Extension
}

declare module '@replit/codemirror-vim' {
  import type { Extension } from '@codemirror/state'
  import type { EditorView } from '@codemirror/view'

  export class CodeMirror {
    static commands: Record<string, unknown>
    static Pos: new (line: number, ch: number) => { line: number; ch: number }
    cm6: EditorView
    getSelections(): string[]
    getSelection(): string
    getCursor(): unknown
    setSelection(anchor: unknown, head: unknown): void
  }

  export const Vim: {
    unmap(keys: string, context?: string): void
    defineAction(name: string, fn: (cm: CodeMirror) => void): void
    defineMotion(
      name: string,
      fn: (
        cm: CodeMirror,
        head: { line: number; ch: number },
        motionArgs: Record<string, unknown>
      ) => { line: number; ch: number }
    ): void
    mapCommand(
      keys: string,
      type?: string,
      name?: string,
      args?: unknown,
      extra?: Record<string, unknown>
    ): void
    exitInsertMode(cm: CodeMirror): void
  }

  export function getCM(view: EditorView): CodeMirror
  export function vim(): Extension
}
