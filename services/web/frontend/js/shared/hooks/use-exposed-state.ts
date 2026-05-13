import { type Dispatch, type SetStateAction, useState } from 'react'
import { useUnstableStoreSync } from '@/shared/hooks/use-unstable-store-sync'

/**
 * Creates a state variable that is exposed via window.superPaper.unstable.store
 * for external integrations that need to mirror React state.
 */
export default function useExposedState<T = any>(
  initialState: T | (() => T),
  path: string
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialState)
  useUnstableStoreSync(path, value)

  return [value, setValue]
}
