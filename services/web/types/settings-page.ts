export type AccessToken = {
  _id: string
  accessTokenPartial: string
  createdAt: Date
  accessTokenExpiresAt: Date
  lastUsedAt?: Date
}
