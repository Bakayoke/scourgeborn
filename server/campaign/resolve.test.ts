import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pickWinner, tallyVotes } from './resolve.js'

describe('tallyVotes', () => {
  it('counts votes per choice', () => {
    assert.deepEqual(tallyVotes({ a: 'atk', b: 'def', c: 'atk' }), {
      atk: 2,
      def: 1,
    })
  })
})

describe('pickWinner', () => {
  it('picks the highest tally', () => {
    assert.equal(pickWinner({ atk: 3, def: 1 }, ['atk', 'def', 'flee'], null), 'atk')
  })

  it('breaks ties with host vote', () => {
    assert.equal(pickWinner({ atk: 2, def: 2 }, ['atk', 'def'], 'def'), 'def')
  })

  it('falls back to first max when host vote is not tied', () => {
    assert.equal(pickWinner({ atk: 2, def: 1 }, ['atk', 'def'], 'def'), 'atk')
  })

  it('prefers host among equal max after sequential scan', () => {
    assert.equal(pickWinner({ atk: 1, def: 1, flee: 1 }, ['atk', 'def', 'flee'], 'flee'), 'flee')
  })
})
