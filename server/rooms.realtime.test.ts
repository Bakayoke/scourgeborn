import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COUNCIL_MS, RESOLVE_MS, WORLD_TICK_MS } from './game/scourge.js'
import {
  createRoom,
  onPhaseTimeout,
  roomsNeedingTick,
  startGame,
  toPublicRoom,
} from './rooms.js'

describe('realtime hybrid pacing', () => {
  it('sets a council deadline on start', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-start', 'sv')
    const before = Date.now()
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.status, 'council')
    assert.ok(started.phaseEndsAt >= before + COUNCIL_MS - 50)
    assert.ok(started.phaseEndsAt <= Date.now() + COUNCIL_MS + 50)
    const pub = toPublicRoom(started, hostId)
    assert.ok(pub.phaseEndsAt > Date.now())
  })

  it('auto-resolves when council timer expires without votes', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-timeout', 'sv')
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return

    room.phaseEndsAt = Date.now() - 1
    assert.ok(roomsNeedingTick().some((r) => r.code === room.code))
    onPhaseTimeout(room)
    assert.ok(room.status === 'resolve' || room.status === 'finished')
    if (room.status === 'resolve') {
      assert.ok(room.phaseEndsAt > Date.now())
      assert.ok(room.phaseEndsAt <= Date.now() + RESOLVE_MS + 50)
      assert.ok(room.lastResolution?.playerLog)
      assert.ok(room.lastResolution?.aiLog)
    }
  })

  it('auto-advances from resolve into the next council', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-advance', 'sv')
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return

    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    if (room.status !== 'resolve') return

    const turnBefore = room.turnIndex
    const pointsBefore = room.resourcePoints
    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    assert.equal(room.status, 'council')
    assert.equal(room.turnIndex, turnBefore + 1)
    assert.ok(room.resourcePoints >= pointsBefore)
    assert.ok(room.phaseEndsAt > Date.now())
  })

  it('applies a world tick while council is open', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-tick', 'sv')
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return

    const before = worldSum(room.regions)
    room.lastWorldTickAt = Date.now() - WORLD_TICK_MS - 1
    room.phaseEndsAt = Date.now() + 60_000
    onPhaseTimeout(room)
    assert.equal(room.status, 'council')
    assert.ok(worldSum(room.regions) > before)
    assert.ok(room.liveEvents.some((e) => e.kind === 'seep'))
  })

  it('records live events on council resolve', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-events', 'sv')
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return

    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    assert.ok(room.liveEvents.some((e) => e.kind === 'good'))
    assert.ok(room.liveEvents.some((e) => e.kind === 'plague' || e.kind === 'breach'))
    const pub = toPublicRoom(room, hostId)
    assert.ok(pub.liveEvents.length >= 2)
  })
})

function worldSum(regions: { infection: number }[]) {
  return regions.reduce((a, r) => a + r.infection, 0)
}
