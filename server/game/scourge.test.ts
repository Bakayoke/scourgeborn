import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyDefenderAction,
  createInitialRegions,
  evaluateOutcome,
  generateActionOptions,
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

  it('generates actions for a focus land', () => {
    const options = generateActionOptions({
      lang: 'sv',
      points: 500,
      focusRegionId: 'heartlands',
      regions: createInitialRegions(),
      cureProgress: 10,
      turn: 1,
    })
    assert.ok(options.length >= 2)
    assert.ok(options.some((o) => o.kind === 'research'))
  })

  it('cleanses infection', () => {
    const regions = createInitialRegions()
    const before = regions.find((r) => r.id === 'heartlands')!.infection
    const option = {
      id: 't',
      kind: 'cleanse' as const,
      title: 'x',
      description: 'y',
      cost: 100,
      amount: 20,
      affordable: true,
    }
    const result = applyDefenderAction(option, 'heartlands', {
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
    const win = pickWinningId({ p1: 'a', p2: 'a', p3: 'b' }, ['a', 'b'])
    assert.equal(win, 'a')
    const tie = pickWinningId({ p1: 'a', p2: 'b' }, ['a', 'b'], 'b')
    assert.equal(tie, 'b')
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
