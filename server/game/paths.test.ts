import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyFunnyBonus,
  authorIndexForHop,
  dealWords,
  guesserIndexForHop,
  normalizeWord,
  sanitizeEmojis,
  scoreGuess,
  tallyFunnyVotes,
  wordsMatch,
} from './paths.js'
import type { GamePath } from '../types.js'

describe('normalizeWord', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeWord('  Pizza  '), 'pizza')
  })
  it('collapses spaces', () => {
    assert.equal(normalizeWord('ice   cream'), 'ice cream')
  })
})

describe('wordsMatch', () => {
  it('matches swedish accents exactly', () => {
    assert.equal(wordsMatch('Äpple', 'äpple'), true)
    assert.equal(wordsMatch('apple', 'äpple'), false)
  })
})

describe('sanitizeEmojis', () => {
  it('keeps emoji and strips letters', () => {
    const out = sanitizeEmojis('🔥dragon🔥')
    assert.ok(out.includes('🔥'))
    assert.ok(!out.toLowerCase().includes('d'))
  })
})

describe('dealWords', () => {
  it('deals unique words and tracks used', () => {
    const used = new Set<string>()
    const a = dealWords(['a', 'b', 'c', 'd'], 2, used, () => 0.1)
    assert.equal(a.length, 2)
    assert.equal(used.size, 2)
  })
})

describe('ring hop indices', () => {
  it('author and guesser rotate', () => {
    assert.equal(authorIndexForHop(0, 0, 4), 0)
    assert.equal(guesserIndexForHop(0, 0, 4), 1)
    assert.equal(authorIndexForHop(0, 1, 4), 1)
    assert.equal(guesserIndexForHop(0, 1, 4), 2)
  })
})

describe('scoreGuess', () => {
  it('scores exact meaning match', () => {
    assert.equal(scoreGuess('Pizza', 'pizza'), true)
    assert.equal(scoreGuess('Pizza', '?'), false)
  })
})

describe('funny votes', () => {
  it('returns tied winners', () => {
    assert.deepEqual(tallyFunnyVotes({ a: 'p1', b: 'p2', c: 'p1', d: 'p2' }), ['p1', 'p2'])
  })

  it('applies bonus only to wrong guessers', () => {
    const path: GamePath = {
      id: 'p1',
      originPlayerId: 'o',
      seedWord: 'cat',
      steps: [
        {
          authorId: 'o',
          meaning: 'cat',
          emojis: '🐱',
          guesserId: 'g1',
          guess: 'dog',
          correct: false,
        },
        {
          authorId: 'g1',
          meaning: 'dog',
          emojis: '🐶',
          guesserId: 'g2',
          guess: 'dog',
          correct: true,
        },
      ],
    }
    const scores: Record<string, number> = { g1: 0, g2: 0 }
    applyFunnyBonus(scores, [path], ['p1'], 3)
    assert.equal(scores.g1, 3)
    assert.equal(scores.g2, 0)
  })
})
