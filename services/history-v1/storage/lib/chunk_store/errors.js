const OError = require('@superpaper/o-error')

class ChunkVersionConflictError extends OError {}
class BaseVersionConflictError extends OError {}
class JobNotFoundError extends OError {}
class JobNotReadyError extends OError {}
class VersionOutOfBoundsError extends OError {}

module.exports = {
  ChunkVersionConflictError,
  BaseVersionConflictError,
  JobNotFoundError,
  JobNotReadyError,
  VersionOutOfBoundsError,
}
