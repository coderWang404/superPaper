import { merge } from 'lodash'
import { useLayoutEffect, useRef } from 'react'

/**
 * Merge properties with the scope object, for use in Storybook stories
 */
export const useScope = (scope: Record<string, unknown>) => {
  const scopeRef = useRef<typeof scope | null>(null)
  if (scopeRef.current === null) {
    scopeRef.current = scope
  }

  useLayoutEffect(() => {
    if (scopeRef.current) {
      for (const [path, value] of Object.entries(scopeRef.current)) {
        let existingValue: typeof value | undefined
        try {
          existingValue = window.superPaper.unstable.store.get(path)
        } catch {
          // allowed not to exist
        }
        if (typeof existingValue === 'object' && typeof value === 'object') {
          window.superPaper.unstable.store.set(path, merge(existingValue, value))
        } else {
          window.superPaper.unstable.store.set(path, value)
        }
      }
    }
  }, [])
}
