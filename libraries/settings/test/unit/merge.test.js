const assert = require('node:assert/strict')

const { merge } = require('../../../merge')

describe('merge', function () {
  it('treats null as a scalar value', function () {
    const defaults = { a: { b: 1 }, c: 2 }

    const result = merge({ a: null }, defaults)

    assert.deepEqual(result, { a: null, c: 2 })
  })

  it('still deep merges plain objects', function () {
    const defaults = { a: { b: 1, c: 2 } }

    const result = merge({ a: { b: 3 } }, defaults)

    assert.deepEqual(result, { a: { b: 3, c: 2 } })
  })
})
