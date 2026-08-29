import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createRoom,
  joinRoom,
  proposeTeam,
  revealRole,
  startGame,
  toPublicRoom,
  voteMission,
  voteTeam,
} from './rooms.js'

function fillLobby(code: string, hostId: string) {
  const names = ['Ada', 'Bo', 'Cia', 'Dan']
  const ids: string[] = [hostId]
  names.forEach((name, i) => {
    const res = joinRoom(code, name, `sock-${i}`)
    assert.ok(!('error' in res))
    if (!('error' in res)) ids.push(res.playerId)
  })
  return ids
}

describe('lobby joins', () => {
  it('requires five players to start', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-host', 'sv')
    const startedEarly = startGame(room.code, hostId)
    assert.ok('error' in startedEarly)

    fillLobby(room.code, hostId)
    const started = startGame(room.code, hostId)
    assert.ok(!('error' in started))
    if ('error' in started) return
    assert.equal(started.status, 'roles')
  })

  it('hides role until reveal', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-hide', 'sv')
    const ids = fillLobby(room.code, hostId)
    startGame(room.code, hostId)

    const pubBefore = toPublicRoom(room, ids[1])
    assert.equal(pubBefore.yourRole, null)
    assert.equal(pubBefore.youRoleRevealed, false)

    revealRole(room.code, ids[1]!)
    const pubAfter = toPublicRoom(room, ids[1])
    assert.ok(pubAfter.yourRole === 'innocent' || pubAfter.yourRole === 'scourgeborn')
    assert.equal(pubAfter.youRoleRevealed, true)
  })

  it('runs a full mission round when all cooperate', () => {
    const { room, playerId: hostId } = createRoom('Host', 'sock-full', 'sv')
    const ids = fillLobby(room.code, hostId)

    startGame(room.code, hostId)
    for (const id of ids) revealRole(room.code, id)

    assert.equal(room.status, 'election')
    const leaderId = room.expeditionLeaderId!
    const partnerId = ids.find((id) => id !== leaderId)!
    proposeTeam(room.code, leaderId, partnerId)
    assert.equal(room.status, 'team_vote')

    for (const id of ids) voteTeam(room.code, id, true)
    assert.equal(room.status, 'mission')

    voteMission(room.code, leaderId, 'cleanse')
    voteMission(room.code, partnerId, 'cleanse')

    assert.ok(
      room.status === 'resolution' || room.status === 'finished',
      `expected resolution/finished got ${room.status}`,
    )
    assert.ok(room.scores.cleanses >= 1 || room.outcome !== 'ongoing')
  })
})
