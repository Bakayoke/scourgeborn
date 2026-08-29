import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CYCLES_TO_WIN,
  MATRIX_MAX_HEALTH,
  applyToolAction,
  checkOutcome,
  initGameState,
  spawnTaskWave,
} from './ritual.js'
import type { Room } from '../types.js'

function mockRoom(overrides: Partial<Room> = {}): Room {
  return {
    code: 'TEST',
    hostId: 'h1',
    players: [{ id: 'h1', name: 'Host', connected: true }],
    language: 'sv',
    status: 'ritual',
    mode: 'solo',
    premiumExpiresAt: null,
    isPublic: false,
    waitlist: [],
    notice: null,
    updatedAt: Date.now(),
    phaseEndsAt: 0,
    matrixHealth: MATRIX_MAX_HEALTH,
    cycle: 1,
    maxCycles: CYCLES_TO_WIN,
    gameStartedAt: Date.now(),
    afflictionAt: 0,
    afflictionTriggered: false,
    roles: { h1: 'keeper' },
    afflictionSeen: {},
    tasks: [],
    playerTools: { h1: ['crystal_slider', 'glyph_board', 'essence_valve'] },
    scourgeMeter: 0,
    miasmaUntil: 0,
    cleansing: null,
    soloSurvivalMs: 0,
    outcome: 'ongoing',
    lastEventSv: null,
    lastEventEn: null,
    ...overrides,
  }
}

describe('ritual matrix rules', () => {
  it('initializes solo mode for one player', () => {
    const room = mockRoom({ status: 'lobby' })
    initGameState(room, ['h1'])
    assert.equal(room.mode, 'solo')
    assert.equal(room.status, 'ritual')
    assert.ok(room.tasks.length >= 2)
    assert.ok(room.playerTools.h1!.includes('crystal_slider'))
  })

  it('spawns crystal, glyph, and essence tasks in solo', () => {
    const room = mockRoom()
    room.tasks = spawnTaskWave(room)
    const kinds = room.tasks.map((t) => t.kind)
    assert.ok(kinds.includes('crystal'))
    assert.ok(kinds.includes('glyphs'))
    assert.ok(kinds.includes('essence'))
  })

  it('updates crystal via tool action', () => {
    const room = mockRoom()
    room.tasks = spawnTaskWave(room)
    const err = applyToolAction(room, 'h1', 'crystal_slider', { value: 74 })
    assert.equal(err.error, undefined)
    const crystal = room.tasks.find((t) => t.kind === 'crystal')
    assert.equal(crystal?.targetCrystal, 74)
  })

  it('detects matrix collapse and multi cycle win', () => {
    assert.equal(checkOutcome(mockRoom({ matrixHealth: 0 })), 'scourgeborn_win')
    assert.equal(checkOutcome(mockRoom({ mode: 'multi', cycle: 6, matrixHealth: 50 })), 'keepers_win')
  })
})
