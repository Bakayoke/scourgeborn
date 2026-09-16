import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Room } from '../types.js'
import { deliverVaccine, extract, incubate, maxMissesForRoom, sendItem, synthesize, winScoreForRoom } from './lab.js'

function mockRoom(overrides: Partial<Room> = {}): Room {
  return {
    code: 'TEST',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'A', connected: true },
      { id: 'p2', name: 'B', connected: true },
    ],
    language: 'sv',
    status: 'playing',
    mode: 'multi',
    isPublic: false,
    waitlist: [],
    notice: null,
    difficulty: 'normal',
    seriesEnabled: false,
    seriesRound: 1,
    seriesWins: 0,
    seriesComplete: false,
    racePartnerCode: null,
    raceFinished: null,
    score: 0,
    misses: 0,
    patients: [{ id: 'pat1', requiredVaccine: 'heated_purple_rna', timeRemaining: 60, maxTime: 60 }],
    lab: {
      p1: { assignedStation: 'extractor', activeStation: 'extractor', itemInHand: null, synthSlot: null },
      p2: { assignedStation: 'synthesizer', activeStation: 'synthesizer', itemInHand: null, synthSlot: null },
    },
    lastTickAt: Date.now(),
    lastSpawnAt: Date.now(),
    lastEventSv: null,
    lastEventEn: null,
    gameStartedAt: Date.now(),
    wave: 1,
    alerts: {},
    stats: {
      p1: { cures: 0, sends: 0, pings: 0 },
      p2: { cures: 0, sends: 0, pings: 0 },
    },
    eventLog: [],
    missLog: [],
    wave4StartedAt: null,
    yellSv: null,
    yellEn: null,
    yellAt: 0,
    yellItemId: null,
    cureStreak: 0,
    bestStreak: 0,
    activeEvent: null,
    eventEndsAt: 0,
    disabledStation: null,
    timersFrozenUntil: 0,
    nextEventAt: Date.now() + 60_000,
    pendingSpecialKind: null,
    specialSpawnedThisWave: false,
    pipeline: null,
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('lab crafting chain', () => {
  it('mixes red and blue into purple', () => {
    const room = mockRoom()
    extract(room, 'p1', 'red_rna')
    sendItem(room, 'p1', 'p2')
    synthesize(room, 'p2')
    extract(room, 'p1', 'blue_rna')
    sendItem(room, 'p1', 'p2')
    synthesize(room, 'p2')
    assert.equal(room.lab.p2?.itemInHand, 'purple_rna')
    assert.equal(room.stats.p1?.sends, 2)
  })

  it('heats purple into heated vaccine', () => {
    const room = mockRoom({
      lab: {
        p1: { assignedStation: 'incubator', activeStation: 'incubator', itemInHand: 'purple_rna', synthSlot: null },
      },
      stats: { p1: { cures: 0, sends: 0, pings: 0 } },
    })
    incubate(room, 'p1', 'heat')
    assert.equal(room.lab.p1?.itemInHand, 'heated_purple_rna')
    deliverVaccine(room, 'p1')
    assert.equal(room.score, 1)
    assert.equal(room.patients.length, 0)
    assert.equal(room.stats.p1?.cures, 1)
    assert.equal(room.cureStreak, 1)
  })

  it('creates incoming alert on send', () => {
    const room = mockRoom()
    extract(room, 'p1', 'red_rna')
    sendItem(room, 'p1', 'p2')
    assert.ok(room.alerts.p2)
    assert.equal(room.alerts.p2?.kind, 'incoming')
  })

  it('applies difficulty settings', () => {
    const training = mockRoom({ difficulty: 'training' })
    const panic = mockRoom({ difficulty: 'panic' })
    assert.equal(maxMissesForRoom(training), 5)
    assert.equal(maxMissesForRoom(panic), 2)
    assert.equal(winScoreForRoom(training), 12)
    assert.equal(winScoreForRoom(panic), 15)
  })

  it('handles mutant decoy delivery', () => {
    const room = mockRoom({
      patients: [
        {
          id: 'mut1',
          requiredVaccine: 'heated_purple_rna',
          decoyVaccine: 'green_rna',
          mutantStage: 0,
          kind: 'mutant',
          timeRemaining: 40,
          maxTime: 40,
        },
      ],
      lab: {
        p1: { assignedStation: 'extractor', activeStation: 'extractor', itemInHand: 'green_rna', synthSlot: null },
      },
    })
    deliverVaccine(room, 'p1')
    assert.equal(room.patients.length, 1)
    assert.equal(room.patients[0]?.mutantStage, 1)
    assert.equal(room.score, 0)
  })
})
