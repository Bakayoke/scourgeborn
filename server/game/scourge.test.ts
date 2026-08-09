import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyPlayerChoice,
  createInitialRegions,
  evaluateOutcome,
  generateVoteOptions,
  pickWinningOption,
  worldCorruption,
} from './scourge.js'

describe('scourge core', () => {
  it('creates a lush starting map with a stronger plague heart', () => {
    const regions = createInitialRegions()
    assert.equal(regions.length, 6)
    const heart = regions.find((r) => r.id === 'plague_heart')
    assert.ok(heart && heart.corruption >= 50)
    assert.ok(worldCorruption(regions) < 40)
  })

  it('generates affordable outbreak options', () => {
    const options = generateVoteOptions({
      lang: 'sv',
      points: 500,
      skills: ['contagion'],
      regions: createInitialRegions(),
      cureProgress: 10,
      heartHp: 100,
      turn: 1,
    })
    assert.ok(options.length >= 2)
    assert.ok(options.some((o) => o.kind === 'outbreak'))
  })

  it('applies outbreak corruption', () => {
    const regions = createInitialRegions()
    const before = regions.find((r) => r.id === 'heartlands')!.corruption
    const option = {
      id: 't',
      kind: 'outbreak' as const,
      title: 'x',
      description: 'y',
      cost: 100,
      regionId: 'heartlands' as const,
      amount: 20,
      affordable: true,
    }
    const result = applyPlayerChoice(option, {
      points: 400,
      skills: ['contagion'],
      regions,
      cureProgress: 10,
      heartHp: 100,
      lang: 'sv',
    })
    assert.ok(!('error' in result))
    if ('error' in result) return
    assert.equal(result.points, 300)
    assert.equal(result.regions.find((r) => r.id === 'heartlands')!.corruption, before + 20)
  })

  it('picks the majority vote and breaks ties with host', () => {
    const options = [
      {
        id: 'a',
        kind: 'outbreak' as const,
        title: 'A',
        description: '',
        cost: 1,
        affordable: true,
      },
      {
        id: 'b',
        kind: 'outbreak' as const,
        title: 'B',
        description: '',
        cost: 1,
        affordable: true,
      },
    ]
    const win = pickWinningOption({ p1: 'a', p2: 'a', p3: 'b' }, options)
    assert.equal(win?.id, 'a')
    const tie = pickWinningOption({ p1: 'a', p2: 'b' }, options, 'b')
    assert.equal(tie?.id, 'b')
  })

  it('detects cure defeat and world victory', () => {
    assert.equal(
      evaluateOutcome({
        regions: createInitialRegions(),
        cureProgress: 100,
        heartHp: 80,
      }),
      'defeat_cure',
    )
    const regions = createInitialRegions().map((r) =>
      r.id === 'plague_heart' ? r : { ...r, corruption: 80 },
    )
    assert.equal(evaluateOutcome({ regions, cureProgress: 20, heartHp: 80 }), 'victory')
  })
})
