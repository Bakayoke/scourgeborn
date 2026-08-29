import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIN_PLAYERS,
  assignRoles,
  checkOutcome,
  scourgebornCount,
  teamVotePassed,
} from './scourgeborn.js'

describe('scourgeborn rules', () => {
  it('assigns one traitor for 5-6 players', () => {
    assert.equal(scourgebornCount(5), 1)
    assert.equal(scourgebornCount(6), 1)
    assert.equal(scourgebornCount(7), 2)
  })

  it('assigns exactly one traitor role per 5-player game', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const roles = assignRoles(ids)
    const traitors = ids.filter((id) => roles[id] === 'scourgeborn')
    assert.equal(traitors.length, 1)
    assert.equal(ids.filter((id) => roles[id] === 'innocent').length, 4)
  })

  it('requires strict majority for team approval', () => {
    assert.equal(teamVotePassed({ a: true, b: true, c: false }, ['a', 'b', 'c']), true)
    assert.equal(teamVotePassed({ a: true, b: false, c: false }, ['a', 'b', 'c']), false)
    assert.equal(teamVotePassed({ a: true, b: true, c: true, d: false }, ['a', 'b', 'c', 'd']), true)
  })

  it('detects win conditions', () => {
    assert.equal(checkOutcome({ cleanses: 3, infections: 0 }, 0), 'innocents_win')
    assert.equal(checkOutcome({ cleanses: 0, infections: 3 }, 0), 'scourgeborn_win')
    assert.equal(checkOutcome({ cleanses: 1, infections: 1 }, 3), 'scourgeborn_win')
    assert.equal(checkOutcome({ cleanses: 1, infections: 0 }, 0), 'ongoing')
  })

  it('requires minimum players constant', () => {
    assert.equal(MIN_PLAYERS, 5)
  })
})
