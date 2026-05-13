import OError from '@superpaper/o-error'
import { User } from '../../models/User.mjs'
import { callbackify } from '@superpaper/promise-utils'

async function allocate(referalId, newUserId, referalSource, referalMedium) {
  if (referalId == null) {
    return null
  }

  const query = { referal_id: referalId }
  const user = await User.findOne(query, { _id: 1 }).exec()
  if (user == null || user._id == null) {
    return null
  }

  if (referalSource === 'bonus') {
    try {
      await User.updateOne(
        query,
        {
          $push: {
            refered_users: newUserId,
          },
          $inc: {
            refered_user_count: 1,
          },
        },
        {}
      ).exec()
    } catch (err) {
      OError.tag(err, 'something went wrong allocating referal', {
        referalId,
        newUserId,
      })
      throw err
    }

    return null
  }
}

export default {
  allocate: callbackify(allocate),
  promises: {
    allocate,
  },
}
