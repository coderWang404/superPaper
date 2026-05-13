// import Errors from object-persistor to pass instanceof checks
import OError from '@superpaper/o-error'

import { Errors } from '@superpaper/object-persistor'

class Md5MismatchError extends OError {}

class DocModifiedError extends OError {}

class DocRevValueError extends OError {}

class DocVersionDecrementedError extends OError {}

class DocWithoutLinesError extends OError {}

export default {
  Md5MismatchError,
  DocModifiedError,
  DocRevValueError,
  DocVersionDecrementedError,
  DocWithoutLinesError,
  ...Errors,
}
