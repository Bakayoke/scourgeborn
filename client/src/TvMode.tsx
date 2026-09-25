import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CopyJoinButton } from './CopyJoinButton'
import { LobbyOptions } from './LobbyOptions'
import { JoinQr } from './qr'
import { goalExplainFor, t, winHintFor } from './i18n'
import { ITEM_VISUALS, itemShort, STATION_VISUALS, stationShort } from './labVisuals'
import { PatientCardBody, SpecialPatientBanner } from './PatientCardBody'
import { patientDisplayItem } from './patientUtils'
import type { ItemId, Lang, PublicRoom, Station } from './types'

function ItemBadge({ item, lang, size = 'md' }: { item: ItemId; lang: Lang; size?: 'sm' | 'md' | 'lg' }) {
  const v = ITEM_VISUALS[item]
  return (
    <span
      className={`item-badge ${size}`}
      style={{ '--item-color': v.color, '--item-glow': v.glow } as CSSProperties}
    >
      <span className="item-icon">{v.icon}</span>
      <span className="item-short">{itemShort(item, lang)}</span>
    </span>
  )
}

function labRoster(room: PublicRoom) {
  return room.players.filter((p) => !p.spectator)
}

function activeLabPlayers(room: PublicRoom) {
  if (room.mode === 'multi' && room.status === 'playing') {
    return labRoster(room).filter((p) => p.id !== room.hostId)
  }
  return labRoster(room)
}

function useTvFullscreen() {
  const rootRef = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => {
      const el = rootRef.current
      setFullscreen(Boolean(el && document.fullscreenElement === el))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  async function toggle() {
    const el = rootRef.current
    if (!el) return
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen()
      else await el.requestFullscreen()
    } catch {
      /* ignore */
    }
  }

  return { rootRef, fullscreen, toggle }
}

export function LabTvShell({
  lang,
  urgent,
  juiceClass = '',
  onLeave,
  children,
}: {
  lang: Lang
  urgent: boolean
  juiceClass?: string
  onLeave: () => void
  children: ReactNode
}) {
  const ui = t(lang)
  const { rootRef, fullscreen, toggle } = useTvFullscreen()

  return (
    <main
      ref={rootRef}
      className={`lab-tv${urgent ? ' screen-urgent' : ''}${juiceClass}${fullscreen ? ' is-fullscreen' : ''}`}
    >
      {!fullscreen && (
        <div className="lab-tv-fs-overlay">
          <p className="lab-tv-fs-title">{ui.tvOpenFullscreen}</p>
          <p className="lab-tv-fs-sub">{ui.tvHostLobbyHint}</p>
          <button type="button" className="btn primary lab-tv-fs-btn" onClick={() => void toggle()}>
            {ui.tvFullscreen}
          </button>
        </div>
      )}
      <div className="lab-tv-body">{children}</div>
      <footer className="lab-tv-chrome">
        <span className="lab-tv-brand">{ui.brand}</span>
        <div className="lab-tv-chrome-actions">
          {fullscreen && (
            <button type="button" className="btn ghost" onClick={() => void toggle()}>
              {ui.tvExitFullscreen}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onLeave}>
            {ui.leave}
          </button>
        </div>
      </footer>
    </main>
  )
}

export function TvLobbyView({
  room,
  lang,
  seated,
  joinUrl,
  onStart,
  startLabel,
  showTutorial,
  canStart,
  onError,
}: {
  room: PublicRoom
  lang: Lang
  seated: number
  joinUrl: string
  onStart: () => void
  startLabel: string
  showTutorial: boolean
  canStart: boolean
  onError: (m: string | null) => void
}) {
  const ui = t(lang)
  const players = labRoster(room)

  return (
    <div className="lab-tv-lobby">
      <header className="lab-tv-lobby-head">
        <span className="lab-tv-badge">{ui.tvHostTitle}</span>
        <h1>{ui.tvScanJoin}</h1>
      </header>

      <div className="lab-tv-lobby-main">
        <div className="lab-tv-lobby-join">
          <div className="lab-tv-code">{room.code}</div>
          <JoinQr url={joinUrl} size={280} alt="join" />
          <p className="lab-tv-url">{joinUrl}</p>
          <CopyJoinButton url={joinUrl} lang={lang} />
        </div>

        <aside className="lab-tv-lobby-side">
          <h2>{ui.partyRoster}</h2>
          <p className="lab-tv-player-count">
            {seated} {ui.tvPlayersReady}
          </p>
          <ul className="lab-tv-roster">
            {players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <span className="lab-tv-roster-name">{p.name}</span>
                {p.id === room.hostId && <span className="lab-tv-roster-tag">{ui.hostLabel}</span>}
                {!p.connected && <span className="lab-tv-roster-tag">…</span>}
              </li>
            ))}
          </ul>

          {!showTutorial && (
            <>
              {seated < room.minPlayersMulti && (
                <p className="lab-tv-wait-hint">{ui.partyNeedMore}</p>
              )}
              <button
                type="button"
                className="btn primary lab-tv-start"
                onClick={onStart}
                disabled={!canStart}
              >
                {startLabel}
              </button>
            </>
          )}
        </aside>
      </div>

      <ol className="lab-tv-steps">
        {ui.partySetupSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="lab-tv-play-guide">
        <h3>{ui.partyPlayTitle}</h3>
        <ol className="lab-tv-play-steps">
          {ui.partyPlaySteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="lab-tv-goal">{goalExplainFor(lang, room.maxMisses)}</p>
        <p className="lab-tv-win-hint">{winHintFor(lang, room.winScoreTarget)}</p>
      </div>

      <LobbyOptions room={room} lang={lang} onError={onError} />
    </div>
  )
}

function TvYellBoard({ room, lang }: { room: PublicRoom; lang: Lang }) {
  if (!room.yellMessage) return null
  return (
    <div className="lab-tv-yell flash-in" key={room.yellAt}>
      {room.yellItemId && <ItemBadge item={room.yellItemId} lang={lang} size="lg" />}
      <p>{room.yellMessage}</p>
    </div>
  )
}

export function TvGameView({ room, lang }: { room: PublicRoom; lang: Lang }) {
  const ui = t(lang)
  const players = activeLabPlayers(room)

  return (
    <div className="lab-tv-game">
      <header className="lab-tv-game-head">
        <div className="lab-tv-head-code">{room.code}</div>
        <div className="lab-tv-head-wave">{room.waveLabel}</div>
        <div className="lab-tv-head-stats">
          <div className="lab-tv-stat">
            <span>{ui.score}</span>
            <strong>
              {room.score}/{room.winScoreTarget}
            </strong>
          </div>
          <div className="lab-tv-stat danger">
            <span>{ui.misses}</span>
            <strong>
              {room.misses}/{room.maxMisses}
            </strong>
          </div>
          {room.cureStreak >= 2 && (
            <div className="lab-tv-stat streak">
              <span>{ui.cureStreak}</span>
              <strong>×{room.cureStreak}</strong>
            </div>
          )}
          {room.racePartner && (
            <div className="lab-tv-stat race">
              <span>{ui.raceVs}</span>
              <strong>
                {room.racePartner.code} {room.racePartner.score}/{room.raceTarget}
              </strong>
            </div>
          )}
        </div>
      </header>

      {room.activeEventLabel && <p className="lab-tv-event-banner flash-in">{room.activeEventLabel}</p>}

      <TvYellBoard room={room} lang={lang} />
      <p className="lab-tv-win-hint">{winHintFor(lang, room.winScoreTarget)}</p>
      <p className="lab-tv-host-hint">{ui.tvHostHint}</p>

      <SpecialPatientBanner patients={room.patients} lang={lang} />

      <section className="lab-tv-patients">
        <h2>{ui.patients}</h2>
        {room.patients.length === 0 ? (
          <p className="lab-tv-empty">{ui.noPatients}</p>
        ) : (
          <div className="lab-tv-patient-grid">
            {room.patients.map((p) => {
              const displayItem = patientDisplayItem(p)
              const v = ITEM_VISUALS[displayItem]
              const urgent = p.timeRemaining <= 10
              return (
                <div
                  key={p.id}
                  className={`lab-tv-patient${p.kind ? ` kind-${p.kind}` : ''}${urgent ? ' urgent' : ''}`}
                  style={{ '--item-color': v.color, '--item-glow': v.glow } as CSSProperties}
                >
                  <PatientCardBody p={p} lang={lang} />
                  <div className="lab-tv-patient-timer">{p.timeRemaining}s</div>
                  <div className="bar">
                    <div
                      className="bar-fill health"
                      style={{ width: `${Math.max(0, (p.timeRemaining / p.maxTime) * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {room.lastEvent && <p className="lab-tv-event">{room.lastEvent}</p>}

      <section className="lab-tv-team">
        <h2>{ui.teamBoard}</h2>
        <div className="lab-tv-team-row">
          {players.map((p) => {
            const station = p.assignedStation ?? 'extractor'
            const st = STATION_VISUALS[station as Station]
            const offline = room.disabledStation === station
            return (
              <div
                key={p.id}
                className={`lab-tv-team-card${p.connected ? '' : ' offline'}${offline ? ' station-down' : ''}`}
                style={{ '--station-color': st.color } as CSSProperties}
              >
                <span className="lab-tv-team-station">
                  {st.icon} {stationShort(station as Station, lang)}
                  {offline && ` (${ui.stationOffline})`}
                </span>
                <strong className="lab-tv-team-name">{p.name}</strong>
                <span className="lab-tv-team-hand">
                  {p.itemInHand ? <ItemBadge item={p.itemInHand} lang={lang} size="md" /> : '—'}
                </span>
                {(p.cures ?? 0) > 0 && (
                  <span className="lab-tv-team-stat">
                    {p.cures} {ui.cures}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
