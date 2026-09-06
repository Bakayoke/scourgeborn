import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MIN_MULTI_PLAYERS, currentWave, waveConfig } from './game/lab.js'
import { createRoom, joinRoom, labAction, onPhaseTimeout, roomsNeedingTick, startGame } from './rooms.js'
import type { Room } from './types.js'

function joinPlayers(code: string, names: string[]) {
  const ids: string[] = []
  for (let i = 0; i < names.length; i++) {
    const res = joinRoom(code, names[i]!, `sock-${names[i]}-${i}`)
    assert.ok(!('error' in res))
    if ('error' in res) return ids
    ids.push(res.playerId)
  }
  return ids
}

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

  it('blocks party start until enough players', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-m1', 'sv')
    joinRoom(room.code, 'Ada', 'sock-m2')
    const tooFew = startGame(room.code, hostId)
    assert.ok('error' in tooFew)
    joinPlayers(room.code, ['Bob', 'Cara'])
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'multi')
    assert.equal(started.status, 'playing')
    assert.equal(Object.keys(started.lab).length, MIN_MULTI_PLAYERS - 1)
  })

  it('assigns all three stations in party', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-stations', 'sv')
    joinPlayers(room.code, ['Ada', 'Bob', 'Cara'])
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    const stations = new Set(Object.values(started.lab).map((s) => s.assignedStation))
    assert.equal(stations.size, 3)
    assert.ok(stations.has('extractor'))
    assert.ok(stations.has('synthesizer'))
    assert.ok(stations.has('incubator'))
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
    const guestIds = joinPlayers(room.code, ['Ada', 'Bob', 'Cara'])
    assert.equal(guestIds.length, 3)
    startGame(room.code, hostId)
    const extractorId = guestIds.find((id) => room.lab[id]?.assignedStation === 'extractor')
    assert.ok(extractorId)
    const pingerId = guestIds.find((id) => id !== extractorId)
    assert.ok(pingerId)
    const ping = labAction(room.code, pingerId!, 'ping', { kind: 'need_red' })
    assert.ok(!('error' in ping))
    if ('error' in ping) return
    assert.ok(ping.alerts[extractorId!])
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
    joinPlayers(room.code, ['Ada', 'Bob', 'Cara'])
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
    assert.ok(cfg.pool.length >= 4)
    assert.ok(cfg.pool.includes('green_rna'))
  })
})
