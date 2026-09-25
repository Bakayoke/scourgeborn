import { useState } from 'react'
import { linkRace, setDifficulty, setPublicLobby, setSeries } from './api'
import { t } from './i18n'
import { loadRoomRecord } from './records'
import type { Difficulty, Lang, PublicRoom } from './types'

export function LobbyOptions({
  room,
  lang,
  onError,
}: {
  room: PublicRoom
  lang: Lang
  onError: (m: string | null) => void
}) {
  const ui = t(lang)
  const [raceCode, setRaceCode] = useState('')
  const record = loadRoomRecord(room.code)

  if (!room.youAreHost) return null

  async function pickDifficulty(d: Difficulty) {
    const res = await setDifficulty(d)
    if (!res.ok) onError(res.error ?? ui.error)
    else onError(null)
  }

  async function toggleSeries() {
    const res = await setSeries(!room.seriesEnabled)
    if (!res.ok) onError(res.error ?? ui.error)
    else onError(null)
  }

  async function togglePublic() {
    const res = await setPublicLobby(!room.isPublic)
    if (!res.ok) onError(res.error ?? ui.error)
    else onError(null)
  }

  async function connectRace() {
    const res = await linkRace(raceCode.trim().toUpperCase())
    if (!res.ok) onError(res.error ?? ui.error)
    else {
      onError(null)
      setRaceCode('')
    }
  }

  return (
    <div className="lobby-options">
      <div className="lobby-option-group">
        <strong>{ui.difficulty}</strong>
        <div className="option-row">
          {(['training', 'normal', 'panic'] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`btn chip${room.difficulty === d ? ' active' : ''}`}
              onClick={() => void pickDifficulty(d)}
            >
              {d === 'training' ? ui.diffTraining : d === 'panic' ? ui.diffPanic : ui.diffNormal}
            </button>
          ))}
        </div>
      </div>

      <label className="lobby-toggle">
        <input type="checkbox" checked={room.seriesEnabled} onChange={() => void toggleSeries()} />
        {ui.seriesMode}
      </label>

      <label className="lobby-toggle">
        <input type="checkbox" checked={room.isPublic} onChange={() => void togglePublic()} />
        {ui.publicLobby}
      </label>

      <div className="lobby-option-group">
        <strong>{ui.raceMode}</strong>
        <div className="option-row">
          <input
            value={raceCode}
            onChange={(e) => setRaceCode(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="ABCD"
          />
          <button type="button" className="btn" onClick={() => void connectRace()} disabled={raceCode.length < 4}>
            {ui.raceLink}
          </button>
        </div>
        {room.racePartnerCode && (
          <p className="hint">
            {ui.raceVs} {room.racePartnerCode} · {ui.raceTarget}: {room.raceTarget}
          </p>
        )}
      </div>

      {record && (record.bestScore > 0 || record.bestWave > 0) && (
        <div className="room-record">
          <strong>{ui.roomRecord}</strong>
          <span>
            {ui.recordScore}: {record.bestScore} · {ui.recordWave}: {record.bestWave} · {ui.bestStreak}: ×
            {record.bestStreak}
          </span>
        </div>
      )}
    </div>
  )
}
