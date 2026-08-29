import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRoom, joinRoom, labAction, startGame, toPublicRoom } from './rooms.js'

describe('lobby and lab start', () => {
  it('starts solo lab with host alone', () => {
    const { room, playerId } = createRoom('Host', 'sock-solo', 'sv')
    const started = startGame(room.code, playerId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'solo')
    assert.equal(started.status, 'playing')
    const pub = toPublicRoom(started, playerId)
    assert.equal(pub.yourActiveStation, 'extractor')
    assert.ok(pub.patients.length >= 1)
  })

  it('starts multi lab with two players', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-m1', 'sv')
    const p2 = joinRoom(room.code, 'Ada', 'sock-m2')
    assert.ok(!('error' in p2))
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.mode, 'multi')
    assert.equal(started.status, 'playing')
    const stations = new Set(Object.values(started.lab).map((s) => s.assignedStation))
    assert.equal(stations.size, 2)
  })

  it('extract and deliver vaccine in solo', () => {
    const { room, playerId } = createRoom('Host', 'sock-solo-lab', 'sv')
    startGame(room.code, playerId)
    const r = room as typeof room & { patients: { requiredVaccine: string }[] }
    r.patients = [{ id: 'p1', requiredVaccine: 'red_rna', timeRemaining: 60, maxTime: 60 }]

    const ex = labAction(room.code, playerId, 'extract', { element: 'red_rna' })
    assert.ok(!('error' in ex))
    if ('error' in ex) return
    assert.equal(ex.lab[playerId]?.itemInHand, 'red_rna')

    const del = labAction(room.code, playerId, 'deliver', {})
    assert.ok(!('error' in del))
    if ('error' in del) return
    assert.equal(del.score, 1)
    assert.equal(del.patients.length, 0)
  })
})
