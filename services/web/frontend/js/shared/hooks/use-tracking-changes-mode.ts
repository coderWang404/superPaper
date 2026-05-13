import { useIdeReactContext } from '@/features/ide-react/context/ide-react-context'

type Mode = 'view' | 'review' | 'edit'

export const useTrackingChangesMode = (): Mode => {
  const { permissionsLevel } = useIdeReactContext()

  if (permissionsLevel === 'readOnly') {
    return 'view'
  }

  return 'edit'
}
