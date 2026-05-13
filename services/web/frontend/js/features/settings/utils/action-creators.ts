import {
  Actions,
  ActionSetData,
  ActionSetLoading,
  ActionMakePrimary,
  ActionDeleteEmail,
} from '../context/user-email-context'
import { UserEmailData } from '../../../../../types/user-email'

export const setData = (data: UserEmailData[]): ActionSetData => ({
  type: Actions.SET_DATA,
  payload: data,
})

export const setLoading = (flag: boolean): ActionSetLoading => ({
  type: Actions.SET_LOADING_STATE,
  payload: flag,
})

export const makePrimary = (
  email: UserEmailData['email']
): ActionMakePrimary => ({
  type: Actions.MAKE_PRIMARY,
  payload: email,
})

export const deleteEmail = (
  email: UserEmailData['email']
): ActionDeleteEmail => ({
  type: Actions.DELETE_EMAIL,
  payload: email,
})
