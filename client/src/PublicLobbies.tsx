import { useEffect, useState } from 'react'
import { fetchPublicLobbies, type PublicLobbyRow } from './api'
import { t } from './i18n'
import type { Lang } from './types'

export function PublicLobbies({
  lang,
  onJoin,
}: {
  lang: Lang
  onJoin: (code: string) => void
}) {
  const ui = t(lang)
  const [rows, setRows] = useState<PublicLobbyRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const data = await fetchPublicLobbies(lang)
        if (alive) setRows(data.lobbies)
      } catch {
        if (alive) setRows([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 12_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [lang])

  if (loading && rows.length === 0) return null
  if (rows.length === 0) return null

  return (
    <section className="public-lobbies">
      <h2>{ui.publicLobbiesTitle}</h2>
      <p className="hint">{ui.publicLobbiesHint}</p>
      <ul className="public-lobby-list">
        {rows.map((row) => (
          <li key={row.code}>
            <div className="public-lobby-meta">
              <strong>{row.code}</strong>
              <span>
                {row.hostName} · {row.playerCount} {ui.tvPlayersReady}
              </span>
            </div>
            <button type="button" className="btn" onClick={() => onJoin(row.code)}>
              {ui.publicLobbyJoin}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
