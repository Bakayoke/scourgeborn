import type { PublicRoom, RoomRecord } from './types'

const PREFIX = 'scourgeborn-records-'

export function loadRoomRecord(code: string): RoomRecord | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${code}`)
    return raw ? (JSON.parse(raw) as RoomRecord) : null
  } catch {
    return null
  }
}

export function saveRoomRecord(code: string, record: RoomRecord) {
  localStorage.setItem(`${PREFIX}${code}`, JSON.stringify(record))
}

export function updateRoomRecord(room: PublicRoom) {
  if (room.status !== 'victory' && room.status !== 'gameover') return
  const prev = loadRoomRecord(room.code) ?? { bestScore: 0, bestWave: 0, bestStreak: 0 }
  const next: RoomRecord = {
    bestScore: Math.max(prev.bestScore, room.score),
    bestWave: Math.max(prev.bestWave, room.wave),
    bestStreak: Math.max(prev.bestStreak, room.bestStreak),
  }
  saveRoomRecord(room.code, next)
  return next
}
