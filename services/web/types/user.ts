import { Brand } from './helpers/brand'

export type UserId = Brand<string, 'UserId'>

export type Features = {
  collaborators?: number
  compileGroup?: 'standard' | 'priority'
  compileTimeout?: number
  dropbox?: boolean
  gitBridge?: boolean
  github?: boolean
  references?: boolean
  referencesSearch?: boolean
  symbolPalette?: boolean
  templates?: boolean
  versioning?: boolean
}

export type FeatureUsage = {
  aiWorkbench: {
    remainingTokens: number
    resetDate: string // date string
  }
  aiFeatureUsage: {
    remainingUsage: number
    resetDate: string // date string
  }
}

export type User = {
  id: UserId
  isAdmin?: boolean
  email: string
  first_name?: string
  last_name?: string
  alphaProgram?: boolean
  labsProgram?: boolean
  signUpDate?: string // date string
  features?: Features
  featureUsage?: FeatureUsage
}

export type LoggedOutUser = {
  id: null
  email?: undefined
  first_name?: undefined
  last_name?: undefined
  signUpDate?: undefined
  labsProgram?: undefined
  alphaProgram?: undefined
  features?: undefined
  isAdmin?: undefined
  featureUsage?: undefined
}

export type MongoUser = Pick<User, Exclude<keyof User, 'id'>> & { _id: string }
