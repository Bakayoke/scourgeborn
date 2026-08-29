import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRoom, joinRoom, ritualToolAction, startGame, toPublicRoom } from './rooms.js'

describe('lobby and ritual start', () => {
  it('starts solo ritual with host alone', () => {
    const { room, playerId } = createRoom('Host', 'sock-solo', 'sv')
    const started = startGame(room.code, playerId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'solo')
    assert.equal(started.status, 'ritual')
    const pub = toPublicRoom(started, playerId)
    assert.ok(pub.yourTools.includes('crystal_slider'))
    assert.ok(pub.tasks.length >= 2)
  })

  it('starts multi ritual with two players', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-m1', 'sv')
    const p2 = joinRoom(room.code, 'Ada', 'sock-m2')
    assert.ok(!('error' in p2))
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'multi')
    assert.ok(started.afflictionAt > Date.now())
  })

  it('accepts crystal tool updates during ritual', () => {
    const { room, playerId } = createRoom('Host', 'sock-tool', 'sv')
    startGame(room.code, playerId)
    const result = ritualToolAction(room.code, playerId, 'crystal_slider', { value: 80 })
    assert.ok(!('error' in result))
    if ('error' in result) return
    const crystal = result.tasks.find((t) => t.kind === 'crystal')
    assert.equal(crystal?.targetCrystal, 80)
  })
})
