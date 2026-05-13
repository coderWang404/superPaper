import crypto from 'node:crypto'
import { callbackify } from 'node:util'

// (From superPaper `random_token.rb`)
//   Letters (not numbers! see generate_token) used in tokens. They're all
//   consonants, to avoid embarassing words (I can't think of any that use only
//   a y), and lower case "l" is omitted, because in many fonts it is
//   indistinguishable from an upper case "I" (and sometimes even the number 1).
const TOKEN_LOWERCASE_ALPHA = 'bcdfghjkmnpqrstvwxyz'
const TOKEN_NUMERICS = '123456789'
const TOKEN_ALPHANUMERICS =
  TOKEN_LOWERCASE_ALPHA + TOKEN_LOWERCASE_ALPHA.toUpperCase() + TOKEN_NUMERICS

// This module mirrors the token generation in superPaper (`random_token.rb`),
// for the purposes of implementing token-based project access, like the
// 'unlisted-projects' feature in superPaper

function _randomString(length, alphabet) {
  const result = crypto
    .randomBytes(length)
    .toJSON()
    .data.map(b => alphabet[b % alphabet.length])
    .join('')
  return result
}

// Generate a 12-char token with only characters from TOKEN_LOWERCASE_ALPHA,
// suitable for use as a read-only token for a project
function readOnlyToken() {
  return _randomString(12, TOKEN_LOWERCASE_ALPHA)
}

// Generate a longer token, with a numeric prefix,
// suitable for use as a read-and-write token for a project
function readAndWriteToken() {
  const numerics = _randomString(10, TOKEN_NUMERICS)
  const token = _randomString(12, TOKEN_LOWERCASE_ALPHA)
  const fullToken = `${numerics}${token}`
  return { token: fullToken, numericPrefix: numerics }
}

function generateReferralId() {
  return _randomString(16, TOKEN_ALPHANUMERICS)
}

async function generateUniqueReadOnlyToken() {
  return readOnlyToken()
}

const TokenGenerator = {
  _randomString,
  readOnlyToken,
  readAndWriteToken,
  generateReferralId,
  generateUniqueReadOnlyToken: callbackify(generateUniqueReadOnlyToken),
}

TokenGenerator.promises = {
  generateUniqueReadOnlyToken,
}
export default TokenGenerator
