import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RESOLUTION_MS, ROLES_MS } from './game/scourgeborn.js'
import {
  createRoom,
  joinRoom,
  onPhaseTimeout,
  proposeTeam,
  revealRole,
  roomsNeedingTick,
  startGame,
} from './rooms.js'

function fillLobby(code: string, hostId: string) {
  ;['Ada', 'Bo', 'Cia', 'Dan'].forEach((name, i) => {
    const res = joinRoom(code, name, `sock-rt-${i}`)
    assert.ok(!('error' in res))
  })
  return hostId
}

describe('realtime phase pacing', () => {
  it('sets a roles deadline on start', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-start', 'sv')
    fillLobby(room.code, hostId)
    const before = Date.now()
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.status, 'roles')
    assert.ok(started.phaseEndsAt >= before + ROLES_MS - 50)
  })

  it('auto-advances roles phase when timer expires', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-roles', 'sv')
    fillLobby(room.code, hostId)
    startGame(room.code, hostId)
    room.phaseEndsAt = Date.now() - 1
    assert.ok(roomsNeedingTick().some((r) => r.code === room.code))
    onPhaseTimeout(room)
    assert.equal(room.status, 'election')
  })

  it('auto-proposes team when election timer expires', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-elect', 'sv')
    fillLobby(room.code, hostId)
    startGame(room.code, hostId)
    for (const p of room.players.filter((x) => !x.spectator)) {
      revealRole(room.code, p.id)
    }
    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    assert.equal(room.status, 'team_vote')
    assert.equal(room.proposedTeamIds.length, 2)
  })

  it('auto-fills team votes and enters mission', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-vote', 'sv')
    fillLobby(room.code, hostId)
    startGame(room.code, hostId)
    for (const p of room.players.filter((x) => !x.spectator)) revealRole(room.code, p.id)
    const leaderId = room.expeditionLeaderId!
    const partnerId = room.players.find((p) => p.id !== leaderId && !p.spectator)!.id
    proposeTeam(room.code, leaderId, partnerId)
    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    assert.equal(room.status, 'mission')
  })

  it('advances from resolution after timeout', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-rt-res', 'sv')
    fillLobby(room.code, hostId)
    startGame(room.code, hostId)
    for (const p of room.players.filter((x) => !x.spectator)) revealRole(room.code, p.id)
    const leaderId = room.expeditionLeaderId!
    const partnerId = room.players.find((p) => p.id !== leaderId && !p.spectator)!.id
    proposeTeam(room.code, leaderId, partnerId)
    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    assert.equal(room.status, 'mission')
    room.phaseEndsAt = Date.now() - 1
    onPhaseTimeout(room)
    if (room.status === 'resolution') {
      assert.ok(room.phaseEndsAt <= Date.now() + RESOLUTION_MS + 50)
      room.phaseEndsAt = Date.now() - 1
      onPhaseTimeout(room)
      assert.equal(room.status, 'election')
    }
  })
})
