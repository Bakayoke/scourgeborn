import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyAction,
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

  it('offers one-shot player contain options', () => {
    const options = generatePlayerOptions({
      lang: 'sv',
      points: 520,
      regions: createInitialRegions(),
      turn: 1,
    })
    assert.ok(options.length >= 3)
    assert.ok(options.every((o) => o.side === 'good'))
    assert.ok(options.some((o) => o.affordable))
    assert.ok(options.every((o) => o.targetRegionId))
  })

  it('lets plague AI pick from its own option cards', () => {
    const options = generatePlagueOptions({
      lang: 'sv',
      regions: createInitialRegions(),
      cureProgress: 25,
      heartHp: 70,
      turn: 4,
    })
    assert.ok(options.length >= 2)
    assert.ok(options.every((o) => o.side === 'plague'))
    const pick = pickPlagueOption(options)
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

  it('cleanses infection', () => {
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
})
