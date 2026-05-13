import {
  createContext,
  useEffect,
  useContext,
  useReducer,
  useCallback,
} from 'react'
import useSafeDispatch from '../../../shared/hooks/use-safe-dispatch'
import * as ActionCreators from '../utils/action-creators'
import { UserEmailData } from '../../../../../types/user-email'
import { normalize, NormalizedObject } from '../../../utils/normalize'
import { getJSON } from '../../../infrastructure/fetch-json'
import useAsync from '../../../shared/hooks/use-async'

// eslint-disable-next-line no-unused-vars
export enum Actions {
  SET_DATA = 'SET_DATA', // eslint-disable-line no-unused-vars
  SET_LOADING_STATE = 'SET_LOADING_STATE', // eslint-disable-line no-unused-vars
  MAKE_PRIMARY = 'MAKE_PRIMARY', // eslint-disable-line no-unused-vars
  DELETE_EMAIL = 'DELETE_EMAIL', // eslint-disable-line no-unused-vars
}

export type ActionSetData = {
  type: Actions.SET_DATA
  payload: UserEmailData[]
}

export type ActionSetLoading = {
  type: Actions.SET_LOADING_STATE
  payload: boolean
}

export type ActionMakePrimary = {
  type: Actions.MAKE_PRIMARY
  payload: UserEmailData['email']
}

export type ActionDeleteEmail = {
  type: Actions.DELETE_EMAIL
  payload: UserEmailData['email']
}

export type State = {
  isLoading: boolean
  data: {
    byId: NormalizedObject<UserEmailData>
    emailCount: number
  }
}

type Action =
  | ActionSetData
  | ActionSetLoading
  | ActionMakePrimary
  | ActionDeleteEmail

const setData = (state: State, action: ActionSetData) => {
  const normalized = normalize<UserEmailData>(action.payload, {
    idAttribute: 'email',
  })
  const emailCount = action.payload.length
  const byId = normalized || {}

  return {
    ...state,
    data: {
      ...initialState.data,
      byId,
      emailCount,
    },
  }
}

const setLoadingAction = (state: State, action: ActionSetLoading) => ({
  ...state,
  isLoading: action.payload,
})

const makePrimaryAction = (state: State, action: ActionMakePrimary) => {
  if (!state.data.byId[action.payload]) {
    return state
  }
  const byId: State['data']['byId'] = {}
  for (const id of Object.keys(state.data.byId)) {
    byId[id] = {
      ...state.data.byId[id],
      default: state.data.byId[id].email === action.payload,
    }
  }

  return {
    ...state,
    data: {
      ...state.data,
      byId,
    },
  }
}

const deleteEmailAction = (state: State, action: ActionDeleteEmail) => {
  const { [action.payload]: _, ...byId } = state.data.byId

  return {
    ...state,
    data: {
      ...state.data,
      emailCount: state.data.emailCount - 1,
      byId,
    },
  }
}

const initialState: State = {
  isLoading: false,
  data: {
    byId: {},
    emailCount: 0,
  },
}

const reducer = (state: State, action: Action) => {
  switch (action.type) {
    case Actions.SET_DATA:
      return setData(state, action)
    case Actions.SET_LOADING_STATE:
      return setLoadingAction(state, action)
    case Actions.MAKE_PRIMARY:
      return makePrimaryAction(state, action)
    case Actions.DELETE_EMAIL:
      return deleteEmailAction(state, action)
    default:
      return state
  }
}

function useUserEmails() {
  const [state, unsafeDispatch] = useReducer(reducer, initialState)
  const dispatch = useSafeDispatch(unsafeDispatch)
  const { data, isLoading, isError, isSuccess, runAsync } =
    useAsync<UserEmailData[]>()

  const getEmails = useCallback(() => {
    dispatch(ActionCreators.setLoading(true))
    runAsync(getJSON('/user/emails'))
      .then(data => {
        dispatch(ActionCreators.setData(data))
      })
      .catch(() => {})
      .finally(() => dispatch(ActionCreators.setLoading(false)))
  }, [runAsync, dispatch])

  // Get emails on page load
  useEffect(() => {
    getEmails()
  }, [getEmails])

  return {
    state,
    isInitializing: isLoading && !data,
    isInitializingSuccess: isSuccess,
    isInitializingError: isError,
    getEmails,
    setLoading: useCallback(
      (flag: boolean) => dispatch(ActionCreators.setLoading(flag)),
      [dispatch]
    ),
    makePrimary: useCallback(
      (email: UserEmailData['email']) =>
        dispatch(ActionCreators.makePrimary(email)),
      [dispatch]
    ),
    deleteEmail: useCallback(
      (email: UserEmailData['email']) =>
        dispatch(ActionCreators.deleteEmail(email)),
      [dispatch]
    ),
  }
}

const UserEmailsContext = createContext<
  ReturnType<typeof useUserEmails> | undefined
>(undefined)
UserEmailsContext.displayName = 'UserEmailsContext'

type UserEmailsProviderProps = {
  children: React.ReactNode
} & Record<string, unknown>

export function UserEmailsProvider(props: UserEmailsProviderProps) {
  const value = useUserEmails()

  return <UserEmailsContext.Provider value={value} {...props} />
}

export const useUserEmailsContext = () => {
  const context = useContext(UserEmailsContext)

  if (context === undefined) {
    throw new Error('useUserEmailsContext must be used in a UserEmailsProvider')
  }

  return context
}

export type EmailContextType = ReturnType<typeof useUserEmailsContext>
