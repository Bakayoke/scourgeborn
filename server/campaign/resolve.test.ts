import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isExactTie, pickWinner, tallyVotes } from './resolve.js'

describe('tallyVotes', () => {
  it('counts votes per choice', () => {
    assert.deepEqual(tallyVotes({ a: 'atk', b: 'def', c: 'atk' }), {
      atk: 2,
      def: 1,
    })
  })
})

describe('isExactTie', () => {
  it('detects shared max', () => {
    assert.equal(isExactTie({ atk: 2, def: 2 }, ['atk', 'def', 'flee']), true)
  })

  it('is false for clear winner', () => {
    assert.equal(isExactTie({ atk: 3, def: 1 }, ['atk', 'def']), false)
  })

  it('is false when nobody voted', () => {
    assert.equal(isExactTie({}, ['atk', 'def']), false)
  })
})

describe('pickWinner', () => {
  it('picks the highest tally', () => {
    assert.equal(pickWinner({ atk: 3, def: 1 }, ['atk', 'def', 'flee'], null), 'atk')
  })

  it('falls back to first max choice id on tie (revote should run first)', () => {
    assert.equal(pickWinner({ atk: 2, def: 2 }, ['atk', 'def'], 'def'), 'atk')
  })
})
