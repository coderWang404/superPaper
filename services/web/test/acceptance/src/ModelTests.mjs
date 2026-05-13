import { expect } from 'chai'
import { User } from '../../../app/src/models/User.mjs'

describe('mongoose', function () {
  describe('User', function () {
    const email = 'wombat@potato.net'

    it('allows the creation of a user', async function () {
      await expect(User.create({ email })).to.be.fulfilled
      await expect(User.findOne({ email }, { _id: 1 })).to.eventually.exist
    })

    it('does not allow the creation of multiple users with the same email', async function () {
      await expect(User.create({ email })).to.be.fulfilled
      await expect(User.create({ email })).to.be.rejected
      await expect(User.countDocuments({ email })).to.eventually.equal(1)
    })
  })
})
