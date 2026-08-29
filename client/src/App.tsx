import { useEffect, useMemo, useState } from 'react'
import {
  backToLobby,
  clearSession,
  createGame,
  endParty,
  ensureSessionBound,
  joinGame,
  labAction,
  loadPartyPass,
  loadSession,
  saveSession,
  setRoomHandler,
  startGame,
  subscribeConnection,
  type ConnState,
} from './api'
import { itemLabel, loadLanguage, rememberLanguage, stationLabel, t } from './i18n'
import { JoinQr } from './qr'
import type { Lang, PublicRoom, Station } from './types'

type Screen = 'home' | 'create' | 'join' | 'game'
const APP_ORIGIN = 'https://scourgeborn.com'
const STATIONS: Station[] = ['extractor', 'synthesizer', 'incubator']

function PatientBar({ room, lang }: { room: PublicRoom; lang: Lang }) {
  const ui = t(lang)
  if (room.patients.length === 0) {
    return <p className="hint">{ui.noPatients}</p>
  }
  return (
    <div className="patient-bar">
      {room.patients.map((p) => (
        <div key={p.id} className={`patient-card${p.timeRemaining <= 10 ? ' urgent' : ''}`}>
          <strong>{itemLabel(p.requiredVaccine, lang)}</strong>
          <span>{p.timeRemaining}s</span>
          <div className="bar">
            <div
              className="bar-fill health"
              style={{ width: `${Math.max(0, (p.timeRemaining / p.maxTime) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function Workstation({
  room,
  lang,
  playerId,
  feedback,
  onAction,
}: {
  room: PublicRoom
  lang: Lang
  playerId: string
  feedback: string | null
  onAction: (action: string, data?: Record<string, unknown>) => void
}) {
  const ui = t(lang)
  const station = room.yourActiveStation
  const others = room.players.filter((p) => !p.spectator && p.id !== playerId && p.connected)
  const canDeliver = Boolean(
    room.itemInHand && room.patients.some((p) => p.requiredVaccine === room.itemInHand),
  )

  return (
    <div className="workstation">
      <h2>{stationLabel(station, lang)}</h2>
      <p className="coach-line">{room.mode === 'solo' ? ui.coachSolo : ui.coachMulti}</p>

      <div className="hand-display">
        {ui.inHand}:{' '}
        <strong>{room.itemInHand ? itemLabel(room.itemInHand, lang) : ui.emptyHand}</strong>
      </div>

      {room.itemInHand && !canDeliver && room.patients.length > 0 && (
        <p className="hint">{ui.wrongVaccine}</p>
      )}

      {feedback && <p className="feedback-banner">{feedback}</p>}

      {station === 'extractor' && (
        <div className="action-row">
          <button type="button" className="btn primary" onClick={() => onAction('extract', { element: 'red_rna' })}>
            {ui.extractRed}
          </button>
          <button type="button" className="btn primary" onClick={() => onAction('extract', { element: 'blue_rna' })}>
            {ui.extractBlue}
          </button>
        </div>
      )}

      {station === 'synthesizer' && (
        <div className="action-col">
          {room.synthSlot && (
            <p className="hint">
              {ui.synthSlot}: {itemLabel(room.synthSlot, lang)}
            </p>
          )}
          <button type="button" className="btn primary" onClick={() => onAction('synthesize')}>
            {ui.synthesize}
          </button>
        </div>
      )}

      {station === 'incubator' && (
        <div className="action-row">
          <button type="button" className="btn primary" onClick={() => onAction('incubate', { mode: 'heat' })}>
            {ui.heat}
          </button>
          <button type="button" className="btn" onClick={() => onAction('incubate', { mode: 'cool' })}>
            {ui.cool}
          </button>
        </div>
      )}

      {canDeliver && (
        <div className="action-col">
          <button type="button" className="btn deliver-btn" onClick={() => onAction('deliver')}>
            {ui.deliver}
          </button>
          <button type="button" className="btn ghost" onClick={() => onAction('drop')}>
            {ui.drop}
          </button>
        </div>
      )}

      {room.itemInHand && !canDeliver && (
        <div className="action-col">
          <button type="button" className="btn ghost" onClick={() => onAction('drop')}>
            {ui.drop}
          </button>
        </div>
      )}

      {room.mode === 'multi' && room.itemInHand && others.length > 0 && (
        <div className="send-row">
          <p className="hint">{ui.sendTo}:</p>
          {others.map((p) => (
            <button key={p.id} type="button" className="btn" onClick={() => onAction('send', { toPlayerId: p.id })}>
              {p.name} ({stationLabel(p.assignedStation ?? 'extractor', lang)})
            </button>
          ))}
        </div>
      )}

      {room.mode === 'solo' && (
        <div className="station-tabs">
          {STATIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn tab${room.yourActiveStation === s ? ' active' : ''}`}
              onClick={() => onAction('switch_station', { station: s })}
            >
              {stationLabel(s, lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GameView({
  room,
  lang,
  playerId,
  onLeave,
  onError,
}: {
  room: PublicRoom
  lang: Lang
  playerId: string
  onLeave: () => void
  onError: (m: string | null) => void
}) {
  const ui = t(lang)
  const seated = room.players.filter((p) => !p.spectator && p.connected).length
  const [feedback, setFeedback] = useState<string | null>(null)

  async function act(action: string, data?: Record<string, unknown>) {
    try {
      const res = await labAction(action, data ?? {})
      if (!res.ok) {
        setFeedback(res.error ?? ui.error)
        return
      }
      setFeedback(null)
      onError(null)
    } catch {
      onError(ui.error)
    }
  }

  if (room.status === 'gameover') {
    return (
      <div className="finale loss">
        <h2>{ui.gameOver}</h2>
        <p>
          {ui.score}: {room.score} · {ui.misses}: {room.misses}/{room.maxMisses}
        </p>
        <button type="button" className="btn" onClick={onLeave}>
          {ui.leave}
        </button>
        {room.youAreHost && (
          <button
            type="button"
            className="btn primary"
              onClick={async () => {
                const res = await backToLobby()
                if (!res.ok) onError(res.error ?? ui.error)
                else setFeedback(null)
              }}
          >
            {ui.backToLobby}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="game-view lab-view">
      <header className="game-header">
        <span className="code-stamp">{room.code}</span>
        <span>
          {ui.score}: <strong>{room.score}</strong> · {ui.misses}: {room.misses}/{room.maxMisses}
        </span>
      </header>

      {room.status === 'lobby' ? (
        <div className="panel lobby-panel">
          <p>{ui.shareHint}</p>
          <p className="hint">{seated} spelare</p>
          {room.youAreHost ? (
            <button
              type="button"
              className="btn primary"
              onClick={async () => {
                const res = await startGame()
                if (!res.ok) onError(res.error ?? ui.error)
                else setFeedback(null)
              }}
            >
              {seated === 1 ? ui.startSolo : ui.startMulti}
            </button>
          ) : (
            <p>{ui.waitingHost}</p>
          )}
        </div>
      ) : (
        <>
          <section className="patients-section">
            <h3>{ui.patients}</h3>
            <PatientBar room={room} lang={lang} />
          </section>
          {room.lastEvent && <p className="event-line">{room.lastEvent}</p>}
          {!room.youAreSpectator && (
            <Workstation
              room={room}
              lang={lang}
              playerId={playerId}
              feedback={feedback}
              onAction={(a, d) => void act(a, d)}
            />
          )}
          <ul className="team-list">
            {room.players
              .filter((p) => !p.spectator)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong> — {stationLabel(p.assignedStation ?? 'extractor', lang)}
                  {p.itemInHand ? ` · ${itemLabel(p.itemInHand, lang)}` : ''}
                </li>
              ))}
          </ul>
        </>
      )}

      <footer className="game-footer">
        <button type="button" className="btn ghost" onClick={onLeave}>
          {ui.leave}
        </button>
        {room.youAreHost && room.status !== 'lobby' && (
          <button type="button" className="btn ghost danger" onClick={() => void endParty().then(() => {})}>
            {ui.endParty}
          </button>
        )}
      </footer>
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState<Lang>(loadLanguage)
  const [screen, setScreen] = useState<Screen>('home')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(loadSession()?.playerId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [conn, setConn] = useState<ConnState>('connecting')
  const [showQr, setShowQr] = useState(false)
  const ui = useMemo(() => t(lang), [lang])

  useEffect(() => rememberLanguage(lang), [lang])
  useEffect(() => subscribeConnection(setConn), [])
  useEffect(() => {
    setRoomHandler(setRoom)
    return () => setRoomHandler(null)
  }, [])
  useEffect(() => {
    const session = loadSession()
    if (!session) return
    setName(session.name)
    setCode(session.code)
    setPlayerId(session.playerId)
    void ensureSessionBound().then((res) => {
      if (res?.ok && res.room && res.playerId) {
        setRoom(res.room)
        setPlayerId(res.playerId)
        setScreen('game')
      }
    })
  }, [])

  function leaveGame() {
    clearSession()
    setRoom(null)
    setPlayerId(null)
    setScreen('home')
  }

  async function handleCreate() {
    setError(null)
    const pass = loadPartyPass()
    const res = await createGame(name, lang, pass?.token ?? null)
    if (!res.ok) return setError(res.error)
    saveSession({ code: res.room.code, playerId: res.playerId, name })
    setPlayerId(res.playerId)
    setRoom(res.room)
    setScreen('game')
  }

  async function handleJoin() {
    setError(null)
    const res = await joinGame(code.trim().toUpperCase(), name)
    if (!res.ok) return setError(res.error)
    saveSession({ code: res.room.code, playerId: res.playerId, name })
    setPlayerId(res.playerId)
    setRoom(res.room)
    setScreen('game')
  }

  if (room && screen === 'game' && playerId) {
    return (
      <main className="app lab-app">
        {error && <p className="error-banner">{error}</p>}
        <GameView room={room} lang={lang} playerId={playerId} onLeave={leaveGame} onError={setError} />
        {room.status === 'lobby' && room.youAreHost && (
          <div className="host-tools">
            <button type="button" className="btn ghost" onClick={() => setShowQr((v) => !v)}>
              QR
            </button>
            {showQr && <JoinQr url={`${APP_ORIGIN}/?join=${room.code}`} alt="join" />}
          </div>
        )}
        <p className={`conn ${conn}`}>{conn === 'connected' ? ui.connected : ui.connecting}</p>
      </main>
    )
  }

  return (
    <main className="app home lab-home">
      <header className="hero">
        <h1>{ui.brand}</h1>
        <p className="tagline">{ui.tagline}</p>
        <p className="support">{ui.heroSupport}</p>
      </header>
      {error && <p className="error-banner">{error}</p>}
      {screen === 'home' && (
        <div className="home-actions">
          <button type="button" className="btn primary" onClick={() => setScreen('create')}>
            {ui.create}
          </button>
          <button type="button" className="btn" onClick={() => setScreen('join')}>
            {ui.join}
          </button>
          <div className="lang-toggle">
            <button type="button" className={lang === 'sv' ? 'active' : ''} onClick={() => setLang('sv')}>
              SV
            </button>
            <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
        </div>
      )}
      {(screen === 'create' || screen === 'join') && (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault()
            void (screen === 'create' ? handleCreate() : handleJoin())
          }}
        >
          <label>
            {ui.yourName}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
          </label>
          {screen === 'join' && (
            <label>
              {ui.roomCode}
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} required />
            </label>
          )}
          <button type="submit" className="btn primary">
            {screen === 'create' ? ui.create : ui.join}
          </button>
        </form>
      )}
      <section className="how-to">
        <h2>{ui.howTo}</h2>
        <ol>
          {ui.howToSteps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}
