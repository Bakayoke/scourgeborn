import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { currentWave, waveConfig } from './game/lab.js'
import { createRoom, joinRoom, labAction, onPhaseTimeout, roomsNeedingTick, startGame } from './rooms.js'
import type { Room } from './types.js'

describe('lobby and lab start', () => {
  it('starts solo lab with host alone', () => {
    const { room, playerId } = createRoom('Host', 'sock-solo', 'sv')
    const started = startGame(room.code, playerId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'solo')
    assert.equal(started.status, 'playing')
    assert.equal(started.wave, 1)
    assert.ok(started.gameStartedAt > 0)
  })

  it('starts multi lab with two players', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-m1', 'sv')
    joinRoom(room.code, 'Ada', 'sock-m2')
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'multi')
    assert.equal(started.status, 'playing')
  })

  it('extract and deliver vaccine in solo', () => {
    const { room, playerId } = createRoom('Host', 'sock-solo-lab', 'sv')
    startGame(room.code, playerId)
    room.patients = [{ id: 'p1', requiredVaccine: 'red_rna', timeRemaining: 60, maxTime: 60 }]

    const ex = labAction(room.code, playerId, 'extract', { element: 'red_rna' })
    assert.ok(!('error' in ex))
    if ('error' in ex) return

    const del = labAction(room.code, playerId, 'deliver', {})
    assert.ok(!('error' in del))
    if ('error' in del) return
    assert.equal(del.score, 1)
  })

  it('ping reaches extractor player', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-ping', 'sv')
    const p2 = joinRoom(room.code, 'Ada', 'sock-ping2')
    assert.ok(!('error' in p2))
    if ('error' in p2) return
    startGame(room.code, hostId)
    const ping = labAction(room.code, p2.playerId, 'ping', { kind: 'need_red' })
    assert.ok(!('error' in ping))
    if ('error' in ping) return
    assert.ok(ping.alerts[hostId])
  })
})

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
    onPhaseTimeout(room)
    assert.equal(room.status, 'gameover')
    assert.ok(room.misses >= 3)
  })

  it('wave config eases in with simple orders', () => {
    const room = {
      gameStartedAt: Date.now(),
      wave: 1,
    } as Room
    assert.equal(currentWave(room), 1)
    const cfg = waveConfig(1)
    assert.ok(cfg.pool.every((i) => i === 'red_rna' || i === 'blue_rna'))
  })
})
