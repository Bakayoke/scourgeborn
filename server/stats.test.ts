import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { adminTokenOk, recordGameStart, stockholmDay, getStatsSnapshot, initStats } from './stats.js'

describe('stats', () => {
  const prev = process.env.ADMIN_STATS_TOKEN

  beforeEach(() => {
    process.env.ADMIN_STATS_TOKEN = 'test-secret'
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.ADMIN_STATS_TOKEN
    else process.env.ADMIN_STATS_TOKEN = prev
  })

  it('stockholmDay returns YYYY-MM-DD', () => {
    const d = stockholmDay(Date.UTC(2026, 0, 15, 12, 0, 0))
    assert.match(d, /^\d{4}-\d{2}-\d{2}$/)
  })

  it('adminTokenOk requires matching ADMIN_STATS_TOKEN', () => {
    assert.equal(adminTokenOk('test-secret'), true)
    assert.equal(adminTokenOk('wrong'), false)
    assert.equal(adminTokenOk(undefined), false)
  })

  it('recordGameStart increments today in snapshot', async () => {
    await initStats()
    const before = await getStatsSnapshot()
    await recordGameStart()
    const after = await getStatsSnapshot()
    assert.equal(after.todayGames, before.todayGames + 1)
    assert.equal(after.totalGames, before.totalGames + 1)
  })
})
