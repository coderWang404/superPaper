import { callbackify } from 'node:util'
import { db } from '../../infrastructure/mongodb.mjs'
import moment from 'moment'
import Errors from '../Errors/Errors.js'
import Mongo from '../Helpers/Mongo.mjs'
import AsyncLocalStorage from '../../infrastructure/AsyncLocalStorage.mjs'

const { normalizeQuery, normalizeMultiQuery } = Mongo

async function getUserFullEmails(userId) {
  const store = AsyncLocalStorage.storage.getStore()
  if (store?.userFullEmails?.[userId]) {
    return store.userFullEmails[userId]
  }
  const user = await UserGetter.promises.getUser(userId, {
    email: 1,
    emails: 1,
  })

  if (!user) {
    throw new Error('User not Found')
  }

  const fullEmails = decorateFullEmails(user.email, user.emails || [])

  if (store) {
    if (!store.userFullEmails) {
      store.userFullEmails = {}
    }
    store.userFullEmails[userId] = fullEmails
  }
  return fullEmails
}

async function getUserFeatures(userId) {
  const user = await UserGetter.promises.getUser(userId, {
    features: 1,
  })
  if (!user) {
    throw new Error('User not Found')
  }

  return user.features || {}
}

async function getUserConfirmedEmails(userId) {
  const user = await UserGetter.promises.getUser(userId, {
    emails: 1,
  })

  if (!user) {
    throw new Error('User not Found')
  }

  return user.emails.filter(email => !!email.confirmedAt)
}

async function getUser(query, projection = {}) {
  query = normalizeQuery(query)
  return await db.users.findOne(query, { projection })
}

async function getUserEmail(userId) {
  const user = await UserGetter.promises.getUser(userId, { email: 1 })
  return user && user.email
}

async function getUserByMainEmail(email, projection = {}) {
  email = email.trim()
  return await db.users.findOne({ email }, { projection })
}

async function getUserByAnyEmail(email, projection = {}) {
  email = email.trim()

  // $exists: true MUST be set to use the partial index
  const query = { emails: { $exists: true }, 'emails.email': email }
  const user = await db.users.findOne(query, { projection })
  if (user) return user

  // While multiple emails are being rolled out, check for the main email as
  // well
  return await getUserByMainEmail(email, projection)
}

async function getUsersByAnyConfirmedEmail(emails, projection = {}) {
  const query = {
    'emails.email': { $in: emails }, // use the index on emails.email
    emails: {
      $exists: true,
      $elemMatch: {
        email: { $in: emails },
        confirmedAt: { $exists: true },
      },
    },
  }

  return await db.users.find(query, { projection }).toArray()
}

async function getUsersByV1Ids(v1Ids, projection = {}) {
  const query = { 'superpaper.id': { $in: v1Ids } }
  return await db.users.find(query, { projection }).toArray()
}

async function getUsersByHostname(hostname, projection) {
  const reversedHostname = hostname.trim().split('').reverse().join('')
  const query = {
    emails: { $exists: true },
    'emails.reversedHostname': reversedHostname,
  }
  return await db.users.find(query, { projection }).toArray()
}

async function getUsers(query, projection) {
  query = normalizeMultiQuery(query)
  if (query?._id?.$in?.length === 0) return [] // shortcut for getUsers([])
  return await db.users.find(query, { projection }).toArray()
}

// check for duplicate email address. This is also enforced at the DB level
async function ensureUniqueEmailAddress(newEmail) {
  const user = await UserGetter.promises.getUserByAnyEmail(newEmail)
  if (user) {
    throw new Errors.EmailExistsError()
  }
}

const UserGetter = {
  getUser: callbackify(getUser),
  getUserFeatures: callbackify(getUserFeatures),
  getUserEmail: callbackify(getUserEmail),
  getUserFullEmails: callbackify(getUserFullEmails),
  getUserConfirmedEmails: callbackify(getUserConfirmedEmails),
  getUserByMainEmail: callbackify(getUserByMainEmail),
  getUserByAnyEmail: callbackify(getUserByAnyEmail),
  getUsersByAnyConfirmedEmail: callbackify(getUsersByAnyConfirmedEmail),
  getUsersByV1Ids: callbackify(getUsersByV1Ids),
  getUsersByHostname: callbackify(getUsersByHostname),
  getUsers: callbackify(getUsers),
  // check for duplicate email address. This is also enforced at the DB level
  ensureUniqueEmailAddress: callbackify(ensureUniqueEmailAddress),

  promises: {
    getUser,
    getUserFeatures,
    getUserEmail,
    getUserFullEmails,
    getUserConfirmedEmails,
    getUserByMainEmail,
    getUserByAnyEmail,
    getUsersByAnyConfirmedEmail,
    getUsersByV1Ids,
    getUsersByHostname,
    getUsers,
    ensureUniqueEmailAddress,
  },
}

const decorateFullEmails = (defaultEmail, emailsData) => {
  emailsData.forEach(function (emailData) {
    emailData.default = emailData.email === defaultEmail

    const lastConfirmedAtStr = emailData.reconfirmedAt || emailData.confirmedAt
    emailData.lastConfirmedAt = lastConfirmedAtStr
      ? moment(lastConfirmedAtStr).toDate()
      : null
  })

  return emailsData
}

export default UserGetter
