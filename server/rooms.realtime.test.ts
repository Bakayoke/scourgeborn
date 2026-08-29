import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { tickLab } from './game/lab.js'
import { createRoom, joinRoom, onPhaseTimeout, roomsNeedingTick, startGame } from './rooms.js'

describe('lab realtime ticks', () => {
  it('counts down patient timers while playing', () => {
    const { room, playerId } = createRoom('Host', 'sock-tick', 'sv')
    startGame(room.code, playerId)
    const before = room.patients[0]!.timeRemaining
    room.lastTickAt = Date.now() - 2000
    onPhaseTimeout(room)
    assert.ok(room.patients[0]!.timeRemaining < before)
    assert.ok(roomsNeedingTick().some((r) => r.code === room.code))
  })

  it('ends game after max misses', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-go', 'sv')
    joinRoom(room.code, 'Ada', 'sock-go2')
    startGame(room.code, hostId)
    room.patients = [
      { id: '1', requiredVaccine: 'red_rna', timeRemaining: 1, maxTime: 10 },
      { id: '2', requiredVaccine: 'blue_rna', timeRemaining: 1, maxTime: 10 },
      { id: '3', requiredVaccine: 'purple_rna', timeRemaining: 1, maxTime: 10 },
    ]
    room.misses = 0
    room.lastTickAt = Date.now() - 2000
    tickLab(room)
    assert.equal(room.status, 'gameover')
    assert.ok(room.misses >= 3)
  })
})
