import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRoom, handleDisconnect, joinRoom, reconnectSocket } from './rooms.js'

describe('session reconnect', () => {
  it('ignores stale disconnect after a newer socket reclaims the seat', () => {
    const { room, playerId } = createRoom('Host', 'sock-a', 'sv')
    joinRoom(room.code, 'Ada', 'sock-b')
    const ada = room.players.find((p) => p.name === 'Ada')!
    assert.equal(ada.connected, true)

    reconnectSocket(room.code, ada.id, 'sock-b-new')
    assert.equal(ada.connected, true)
    assert.equal(ada.socketId, 'sock-b-new')

    handleDisconnect('sock-b')
    assert.equal(ada.connected, true)
    assert.equal(ada.socketId, 'sock-b-new')
  })

  it('marks offline only for the active socket disconnect', () => {
    const { room, playerId } = createRoom('Host', 'sock-host', 'sv')
    const host = room.players.find((p) => p.id === playerId)!
    handleDisconnect('sock-host')
    assert.equal(host.connected, false)
    assert.equal(host.socketId, null)
  })
})
