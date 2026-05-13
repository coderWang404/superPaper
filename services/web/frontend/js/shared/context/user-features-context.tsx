import {
  createContext,
  FC,
  useCallback,
  useContext,
  useState,
} from 'react'
import { User } from '../../../../types/user'
import { useUserContext } from './user-context'
import { useReceiveUser } from '../hooks/user-channel/use-receive-user'

export const UserFeaturesContext = createContext<User['features']>(undefined)

export const UserFeaturesProvider: FC<React.PropsWithChildren> = ({
  children,
}) => {
  const user = useUserContext()
  const [features, setFeatures] = useState(user.features || {})

  useReceiveUser(
    useCallback(data => {
      if (data?.features) {
        setFeatures(data.features)
      }
    }, [])
  )

  return (
    <UserFeaturesContext.Provider value={features}>
      {children}
    </UserFeaturesContext.Provider>
  )
}

export function useUserFeaturesContext() {
  const context = useContext(UserFeaturesContext)

  if (!context) {
    throw new Error(
      'useUserFeaturesContext is only available inside UserFeaturesContext'
    )
  }

  return context
}
