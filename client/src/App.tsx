import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { loadLanguage, rememberLanguage, t } from './i18n'
import {
  ITEM_VISUALS,
  itemShort,
  recipeSteps,
  STATION_VISUALS,
  stationShort,
} from './labVisuals'
import { JoinQr } from './qr'
import { sfxCure, sfxMiss, sfxPing, sfxSend, sfxSpawn, sfxWave } from './sfx'
import type { ItemId, Lang, PublicRoom, Station, TutorialStep } from './types'

type Screen = 'home' | 'create' | 'join' | 'game'
const APP_ORIGIN = 'https://scourgeborn.com'
const STATIONS: Station[] = ['extractor', 'synthesizer', 'incubator']

function ItemBadge({ item, lang, size = 'md' }: { item: ItemId; lang: Lang; size?: 'sm' | 'md' | 'lg' }) {
  const v = ITEM_VISUALS[item]
  return (
    <span className={`item-badge ${size}`} style={{ '--item-color': v.color } as CSSProperties}>
      <span className="item-icon">{v.icon}</span>
      <span className="item-short">{itemShort(item, lang)}</span>
    </span>
  )
}

function RecipeStrip({ item, lang }: { item: ItemId; lang: Lang }) {
  const steps = recipeSteps(item)
  return (
    <div className="recipe-strip">
      {steps.map((s, i) => (
        <span key={`${s}-${i}`} className="recipe-step">
          {i > 0 && <span className="recipe-arrow">→</span>}
          <ItemBadge item={s} lang={lang} size="sm" />
        </span>
      ))}
    </div>
  )
}

function PatientBar({ room, lang }: { room: PublicRoom; lang: Lang }) {
  const ui = t(lang)
  if (room.patients.length === 0) return <p className="hint">{ui.noPatients}</p>
  return (
    <div className="patient-bar">
      {room.patients.map((p) => (
        <div key={p.id} className={`patient-card${p.timeRemaining <= 10 ? ' urgent pulse' : ''}`}>
          <ItemBadge item={p.requiredVaccine} lang={lang} size="lg" />
          <RecipeStrip item={p.requiredVaccine} lang={lang} />
          <span className="patient-timer">{p.timeRemaining}s</span>
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

function TeamBoard({ room, lang, playerId }: { room: PublicRoom; lang: Lang; playerId: string }) {
  const ui = t(lang)
  return (
    <section className="team-board">
      <h3>{ui.teamBoard}</h3>
      <div className="team-grid">
        {room.players
          .filter((p) => !p.spectator)
          .map((p) => {
            const st = STATION_VISUALS[p.assignedStation ?? 'extractor']
            const isYou = p.id === playerId
            return (
              <div key={p.id} className={`team-card${isYou ? ' you' : ''}${!p.connected ? ' offline' : ''}`}>
                <span className="team-station" style={{ color: st.color }}>
                  {st.icon} {stationShort(p.assignedStation ?? 'extractor', lang)}
                </span>
                <strong>{p.name}{isYou ? ' ★' : ''}</strong>
                <span className="team-hand">
                  {p.itemInHand ? <ItemBadge item={p.itemInHand} lang={lang} size="sm" /> : '—'}
                </span>
                {(p.cures ?? 0) > 0 && (
                  <span className="team-stat">{p.cures} {ui.cures}</span>
                )}
              </div>
            )
          })}
      </div>
    </section>
  )
}

function StationSplash({
  station,
  lang,
  onDone,
}: {
  station: Station
  lang: Lang
  onDone: () => void
}) {
  const ui = t(lang)
  const v = STATION_VISUALS[station]
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="station-splash" style={{ '--station-color': v.color } as CSSProperties}>
      <p className="splash-you">{ui.youAre}</p>
      <p className="splash-icon">{v.icon}</p>
      <h2>{stationShort(station, lang)}</h2>
      <p className="splash-yell">{ui.yellRole}</p>
    </div>
  )
}

function AlertOverlay({ message, itemId, lang }: { message: string; itemId: ItemId | null; lang: Lang }) {
  return (
    <div className="alert-overlay flash-in">
      {itemId && <ItemBadge item={itemId} lang={lang} size="lg" />}
      <p>{message}</p>
    </div>
  )
}

function WaveBanner({ label, wave }: { label: string; wave: number }) {
  return (
    <div className={`wave-banner wave-${wave} flash-in`}>
      {label}
    </div>
  )
}

function TutorialPanel({
  room,
  lang,
  step,
  onStep,
  onSkip,
  onStart,
}: {
  room: PublicRoom
  lang: Lang
  step: TutorialStep
  onStep: (s: TutorialStep) => void
  onSkip: () => void
  onStart: () => void
}) {
  const ui = t(lang)
  const hints: Record<TutorialStep, string> = {
    extract_red: ui.tutorialExtract,
    send_or_switch: ui.tutorialSend,
    deliver: ui.tutorialDeliver,
    done: ui.tutorialDone,
  }
  return (
    <div className="tutorial-panel">
      <h3>{ui.tutorialTitle}</h3>
      <p>{hints[step]}</p>
      {step === 'extract_red' && (
        <button type="button" className="btn primary" onClick={() => onStep('send_or_switch')}>
          {ui.tutorialTry}
        </button>
      )}
      {step === 'send_or_switch' && (
        <button type="button" className="btn primary" onClick={() => onStep('deliver')}>
          {ui.tutorialTry}
        </button>
      )}
      {step === 'deliver' && (
        <button type="button" className="btn primary" onClick={() => onStep('done')}>
          {ui.tutorialTry}
        </button>
      )}
      {step !== 'done' && (
        <button type="button" className="btn ghost" onClick={onSkip}>
          {ui.tutorialSkip}
        </button>
      )}
      {step === 'done' && room.youAreHost && (
        <button type="button" className="btn primary" onClick={onStart}>
          {room.canStartSolo ? ui.startSolo : ui.startMulti}
        </button>
      )}
      {step === 'done' && !room.youAreHost && <p>{ui.waitingHost}</p>}
    </div>
  )
}

function GameOverScreen({
  room,
  lang,
  onLeave,
  onBack,
  onError,
}: {
  room: PublicRoom
  lang: Lang
  onLeave: () => void
  onBack: () => void
  onError: (m: string | null) => void
}) {
  const ui = t(lang)
  const sorted = [...room.players]
    .filter((p) => !p.spectator)
    .sort((a, b) => (b.cures ?? 0) - (a.cures ?? 0) || (b.sends ?? 0) - (a.sends ?? 0))

  return (
    <div className="finale loss shake-in">
      <h2>{ui.gameOver}</h2>
      <p className="finale-score">
        {ui.score}: <strong>{room.score}</strong> · {ui.misses}: {room.misses}/{room.maxMisses}
      </p>
      <section className="highlights">
        <h3>{ui.highlights}</h3>
        <ul>
          {sorted.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {p.cures ?? 0} {ui.cures}, {p.sends ?? 0} {ui.sends}
            </li>
          ))}
        </ul>
      </section>
      <div className="finale-actions">
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
              else onBack()
            }}
          >
            {ui.backToLobby}
          </button>
        )}
      </div>
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
  const sv = STATION_VISUALS[station]
  const others = room.players.filter((p) => !p.spectator && p.id !== playerId && p.connected)
  const canDeliver = Boolean(
    room.itemInHand && room.patients.some((p) => p.requiredVaccine === room.itemInHand),
  )

  return (
    <div className="workstation" style={{ '--station-color': sv.color } as CSSProperties}>
      <h2>
        <span className="station-icon">{sv.icon}</span> {stationShort(station, lang)}
      </h2>
      <p className="coach-line">{room.mode === 'solo' ? ui.coachSolo : ui.coachMulti}</p>

      <div className="hand-display">
        {ui.inHand}:{' '}
        {room.itemInHand ? (
          <ItemBadge item={room.itemInHand} lang={lang} size="md" />
        ) : (
          <strong>{ui.emptyHand}</strong>
        )}
      </div>

      {room.itemInHand && !canDeliver && room.patients.length > 0 && (
        <p className="hint">{ui.wrongVaccine}</p>
      )}

      {feedback && <p className="feedback-banner">{feedback}</p>}

      {station === 'extractor' && (
        <div className="action-row big-buttons">
          <button
            type="button"
            className="btn item-btn red"
            onClick={() => onAction('extract', { element: 'red_rna' })}
          >
            {ITEM_VISUALS.red_rna.icon} {ui.extractRed}
          </button>
          <button
            type="button"
            className="btn item-btn blue"
            onClick={() => onAction('extract', { element: 'blue_rna' })}
          >
            {ITEM_VISUALS.blue_rna.icon} {ui.extractBlue}
          </button>
        </div>
      )}

      {station === 'synthesizer' && (
        <div className="action-col">
          {room.synthSlot && (
            <p className="hint">
              {ui.synthSlot}: <ItemBadge item={room.synthSlot} lang={lang} size="sm" />
            </p>
          )}
          <button type="button" className="btn primary item-btn purple" onClick={() => onAction('synthesize')}>
            ⚗ {ui.synthesize}
          </button>
        </div>
      )}

      {station === 'incubator' && (
        <div className="action-row big-buttons">
          <button type="button" className="btn item-btn hot" onClick={() => onAction('incubate', { mode: 'heat' })}>
            🔥 {ui.heat}
          </button>
          <button type="button" className="btn item-btn cold" onClick={() => onAction('incubate', { mode: 'cool' })}>
            ❄ {ui.cool}
          </button>
        </div>
      )}

      {canDeliver && (
        <div className="action-col">
          <button type="button" className="btn deliver-btn pulse" onClick={() => onAction('deliver')}>
            ✓ {ui.deliver}
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
            <button
              key={p.id}
              type="button"
              className="btn send-btn"
              onClick={() => onAction('send', { toPlayerId: p.id })}
            >
              → {p.name}
            </button>
          ))}
        </div>
      )}

      {room.mode === 'multi' && (
        <div className="ping-row">
          <button type="button" className="btn ping" onClick={() => onAction('ping', { kind: 'need_red' })}>
            {ui.pingNeedRed}
          </button>
          <button type="button" className="btn ping" onClick={() => onAction('ping', { kind: 'need_blue' })}>
            {ui.pingNeedBlue}
          </button>
          <button type="button" className="btn ping" onClick={() => onAction('ping', { kind: 'need_mix' })}>
            {ui.pingNeedMix}
          </button>
          <button type="button" className="btn ping" onClick={() => onAction('ping', { kind: 'need_heat' })}>
            {ui.pingNeedHeat}
          </button>
          <button type="button" className="btn ping" onClick={() => onAction('ping', { kind: 'need_cool' })}>
            {ui.pingNeedCool}
          </button>
          <button type="button" className="btn ping urgent" onClick={() => onAction('ping', { kind: 'need_deliver' })}>
            {ui.pingDeliver}
          </button>
        </div>
      )}

      {room.mode === 'solo' && (
        <div className="station-tabs">
          {STATIONS.map((s) => {
            const st = STATION_VISUALS[s]
            return (
              <button
                key={s}
                type="button"
                className={`btn tab${room.yourActiveStation === s ? ' active' : ''}`}
                onClick={() => onAction('switch_station', { station: s })}
              >
                {st.icon} {stationShort(s, lang)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function useGameFx(room: PublicRoom | null) {
  const prev = useRef<{ score: number; misses: number; patients: number; wave: number; alert: string | null } | null>(
    null,
  )

  useEffect(() => {
    if (!room || room.status !== 'playing') return
    const p = prev.current
    if (p) {
      if (room.score > p.score) sfxCure()
      if (room.misses > p.misses) sfxMiss()
      if (room.patients.length > p.patients) sfxSpawn()
      if (room.wave > p.wave) sfxWave()
      if (room.alert && room.alert !== p.alert) {
        if (room.alert.includes('!')) sfxPing()
        else sfxSend()
      }
    }
    prev.current = {
      score: room.score,
      misses: room.misses,
      patients: room.patients.length,
      wave: room.wave,
      alert: room.alert,
    }
  }, [room])
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
  const [showSplash, setShowSplash] = useState(false)
  const [showWave, setShowWave] = useState<number | null>(null)
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>('extract_red')
  const [tutorialDone, setTutorialDone] = useState(false)
  const prevStatus = useRef(room.status)
  const prevWave = useRef(room.wave)

  useGameFx(room)

  useEffect(() => {
    if (prevStatus.current === 'lobby' && room.status === 'playing' && room.mode === 'multi') {
      setShowSplash(true)
    }
    prevStatus.current = room.status
  }, [room.status, room.mode])

  useEffect(() => {
    if (room.wave > prevWave.current && room.status === 'playing') {
      setShowWave(room.wave)
      const t = setTimeout(() => setShowWave(null), 2500)
      prevWave.current = room.wave
      return () => clearTimeout(t)
    }
    prevWave.current = room.wave
  }, [room.wave, room.status])

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
      <GameOverScreen
        room={room}
        lang={lang}
        onLeave={onLeave}
        onBack={() => setFeedback(null)}
        onError={onError}
      />
    )
  }

  return (
    <div className="game-view lab-view">
      {showSplash && (
        <StationSplash station={room.yourStation} lang={lang} onDone={() => setShowSplash(false)} />
      )}
      {room.alert && (
        <AlertOverlay message={room.alert} itemId={room.alertItemId} lang={lang} />
      )}
      {showWave && <WaveBanner label={room.waveLabel} wave={showWave} />}

      <header className="game-header">
        <span className="code-stamp">{room.code}</span>
        <span className="wave-chip">{room.waveLabel}</span>
        <span>
          {ui.score}: <strong>{room.score}</strong> · {ui.misses}: {room.misses}/{room.maxMisses}
        </span>
      </header>

      {room.status === 'lobby' ? (
        <div className="panel lobby-panel">
          <p>{ui.shareHint}</p>
          <p className="hint">{seated} spelare</p>
          {!tutorialDone ? (
            <TutorialPanel
              room={room}
              lang={lang}
              step={tutorialStep}
              onStep={setTutorialStep}
              onSkip={() => setTutorialDone(true)}
              onStart={async () => {
                const res = await startGame()
                if (!res.ok) onError(res.error ?? ui.error)
                else setFeedback(null)
              }}
            />
          ) : room.youAreHost ? (
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
          <TeamBoard room={room} lang={lang} playerId={playerId} />
          {!room.youAreSpectator && (
            <Workstation
              room={room}
              lang={lang}
              playerId={playerId}
              feedback={feedback}
              onAction={(a, d) => void act(a, d)}
            />
          )}
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
