import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AFFLICTION_DELAY_MS } from './game/ritual.js'
import { createRoom, joinRoom, onPhaseTimeout, roomsNeedingTick, startGame } from './rooms.js'

describe('ritual realtime ticks', () => {
  it('triggers affliction after delay in multi', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-aff', 'sv')
    joinRoom(room.code, 'Ada', 'sock-a2')
    startGame(room.code, hostId)
    room.afflictionAt = Date.now() - 1
    assert.ok(roomsNeedingTick().some((r) => r.code === room.code))
    onPhaseTimeout(room)
    assert.equal(room.afflictionTriggered, true)
    assert.equal(room.status, 'affliction')
  })

  it('does not afflict in solo', () => {
    const { room, playerId } = createRoom('Host', 'sock-solo-rt', 'sv')
    startGame(room.code, playerId)
    room.afflictionAt = Date.now() - AFFLICTION_DELAY_MS
    onPhaseTimeout(room)
    assert.equal(room.afflictionTriggered, false)
  })
})
