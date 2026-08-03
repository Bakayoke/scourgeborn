import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { GamePath } from '../types.js'
import {
  applyFunnyVotePoints,
  authorIndexForHop,
  dealWords,
  guesserIndexForHop,
  hopCountForPlayers,
  lastWrongGuesser,
  normalizeWord,
  sanitizeEmojis,
  scoreGuess,
  tallyFunnyVotes,
  wordsMatch,
} from './paths.js'

describe('normalizeWord', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeWord('  Hej '), 'hej')
  })
  it('collapses spaces', () => {
    assert.equal(normalizeWord('a   b'), 'a b')
  })
})

describe('wordsMatch', () => {
  it('matches swedish accents exactly', () => {
    assert.equal(wordsMatch('Älg', 'älg'), true)
  })
})

describe('sanitizeEmojis', () => {
  it('keeps emoji and strips letters', () => {
    assert.equal(sanitizeEmojis('🔥abc🍕'), '🔥🍕')
  })
})

describe('dealWords', () => {
  it('deals unique words and tracks used', () => {
    const used = new Set<string>()
    const pack = ['a', 'b', 'c', 'd']
    const dealt = dealWords(pack, 2, used, () => 0)
    assert.equal(dealt.length, 2)
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

describe('hopCountForPlayers', () => {
  it('caps hops so guesser never wraps to own path', () => {
    assert.equal(hopCountForPlayers(2), 1)
    assert.equal(hopCountForPlayers(3), 2)
    assert.equal(hopCountForPlayers(4), 3)
    assert.equal(hopCountForPlayers(8), 3)
  })
})

describe('scoreGuess', () => {
  it('scores exact meaning match', () => {
    assert.equal(scoreGuess('Pizza', 'pizza'), true)
    assert.equal(scoreGuess('Pizza', '?'), false)
  })
})

describe('funny votes', () => {
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
        guess: 'wolf',
        correct: false,
      },
    ],
  }

  it('returns tied winners', () => {
    assert.deepEqual(tallyFunnyVotes({ a: 'p1', b: 'p2', c: 'p1', d: 'p2' }), ['p1', 'p2'])
  })

  it('picks the last wrong guesser', () => {
    assert.equal(lastWrongGuesser(path), 'g2')
  })

  it('awards 10 per vote to the last wrong guesser', () => {
    const scores: Record<string, number> = { g1: 0, g2: 0, o: 0 }
    applyFunnyVotePoints(scores, [path], { a: 'p1', b: 'p1', c: 'p1' }, 10)
    assert.equal(scores.g2, 30)
    assert.equal(scores.g1, 0)
    assert.equal(scores.o, 0)
  })
})
