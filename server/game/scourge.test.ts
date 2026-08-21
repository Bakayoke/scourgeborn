import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyAction,
  applyWorldTick,
  createInitialRegions,
  evaluateOutcome,
  generatePlagueOptions,
  generatePlayerOptions,
  pickPlagueOption,
  pickWinningId,
  worldInfection,
} from './scourge.js'

describe('scourge defenders', () => {
  it('creates a map with a dangerous plague heart', () => {
    const regions = createInitialRegions()
    assert.equal(regions.length, 6)
    const heart = regions.find((r) => r.id === 'plague_heart')
    assert.ok(heart && heart.infection >= 50)
    assert.ok(worldInfection(regions) < 50)
  })

  it('offers distinct strategy cards each council', () => {
    const options = generatePlayerOptions({
      lang: 'sv',
      points: 520,
      regions: createInitialRegions(),
      turn: 1,
      cureProgress: 8,
      heartHp: 100,
    })
    assert.ok(options.length >= 4)
    const kinds = new Set(options.map((o) => o.kind))
    assert.ok(kinds.has('quarantine'))
    assert.ok(kinds.has('cleanse'))
    assert.ok(kinds.has('triage'))
    assert.ok(kinds.has('research') || kinds.has('assault'))
    assert.ok(options.every((o) => o.side === 'good'))
  })

  it('lets plague AI pick from its own option cards', () => {
    const options = generatePlagueOptions({
      lang: 'sv',
      regions: createInitialRegions(),
      cureProgress: 25,
      heartHp: 70,
      turn: 4,
      provokedBy: 'research',
    })
    assert.ok(options.length >= 2)
    assert.ok(options.every((o) => o.side === 'plague'))
    const pick = pickPlagueOption(options, 'research')
    assert.ok(pick.id)
    const applied = applyAction(pick, {
      points: 400,
      regions: createInitialRegions(),
      cureProgress: 25,
      heartHp: 70,
      lang: 'sv',
    })
    assert.ok(!('error' in applied))
  })

  it('cleanses infection hard', () => {
    const regions = createInitialRegions()
    const option = {
      id: 't',
      kind: 'cleanse' as const,
      side: 'good' as const,
      targetRegionId: 'heartlands' as const,
      title: 'x',
      description: 'y',
      cost: 100,
      amount: 20,
      affordable: true,
    }
    const result = applyAction(option, {
      points: 400,
      regions,
      cureProgress: 10,
      heartHp: 100,
      lang: 'sv',
    })
    assert.ok(!('error' in result))
    if ('error' in result) return
    assert.equal(result.points, 300)
    assert.equal(result.regions.find((r) => r.id === 'heartlands')!.infection, 0)
  })

  it('triage lowers infection in every kingdom', () => {
    const regions = createInitialRegions()
    const before = worldInfection(regions)
    const result = applyAction(
      {
        id: 'triage',
        kind: 'triage',
        side: 'good',
        targetRegionId: 'heartlands',
        title: 't',
        description: 'd',
        cost: 170,
        amount: 10,
        affordable: true,
      },
      { points: 400, regions, cureProgress: 10, heartHp: 100, lang: 'sv' },
    )
    assert.ok(!('error' in result))
    if ('error' in result) return
    assert.ok(worldInfection(result.regions) < before)
  })

  it('heart raid damages nest but spikes soft lands', () => {
    const regions = createInitialRegions()
    const result = applyAction(
      {
        id: 'raid',
        kind: 'assault',
        side: 'good',
        targetRegionId: 'plague_heart',
        title: 't',
        description: 'd',
        cost: 210,
        amount: 25,
        affordable: true,
      },
      { points: 400, regions, cureProgress: 10, heartHp: 100, lang: 'sv' },
    )
    assert.ok(!('error' in result))
    if ('error' in result) return
    assert.equal(result.heartHp, 75)
    assert.ok(result.logSv.includes('Hämnd') || result.logEn.includes('Revenge'))
  })

  it('picks majority and host tie-break', () => {
    assert.equal(pickWinningId({ p1: 'a', p2: 'a', p3: 'b' }, ['a', 'b']), 'a')
    assert.equal(pickWinningId({ p1: 'a', p2: 'b' }, ['a', 'b'], 'b'), 'b')
  })

  it('detects cure victory and plague defeat', () => {
    assert.equal(
      evaluateOutcome({
        regions: createInitialRegions(),
        cureProgress: 100,
        heartHp: 80,
      }),
      'victory_cure',
    )
    const regions = createInitialRegions().map((r) =>
      r.id === 'plague_heart' ? r : { ...r, infection: 85 },
    )
    assert.equal(evaluateOutcome({ regions, cureProgress: 20, heartHp: 80 }), 'defeat_plague')
  })

  it('seeps infection on world ticks', () => {
    const regions = createInitialRegions()
    const before = worldInfection(regions)
    const next = applyWorldTick(regions, 4)
    assert.ok(worldInfection(next) >= before)
    const heart = next.find((r) => r.id === 'plague_heart')!
    const heartBefore = regions.find((r) => r.id === 'plague_heart')!.infection
    assert.ok(heart.infection >= heartBefore)
  })
})
