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
  EXTRACT_OPTIONS,
  ITEM_VISUALS,
  itemShort,
  recipeSteps,
  STATION_VISUALS,
  stationShort,
} from './labVisuals'
import { JoinQr } from './qr'
import { sfxCure, sfxMiss, sfxPing, sfxSend, sfxSpawn, sfxWave } from './sfx'
import type { ItemId, Lang, PingKind, PublicRoom, Station, TutorialStep } from './types'

type Screen = 'home' | 'create' | 'join' | 'game'
const APP_ORIGIN = 'https://scourgeborn.com'

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

function ExtractButtons({
  lang,
  onAction,
}: {
  lang: Lang
  onAction: (action: string, data?: Record<string, unknown>) => void
}) {
  return (
    <div className="action-row big-buttons extract-grid">
      {EXTRACT_OPTIONS.map((id) => {
        const v = ITEM_VISUALS[id]
        const tone = id.replace('_rna', '')
        return (
          <button
            key={id}
            type="button"
            className={`btn item-btn ${tone}`}
            onClick={() => onAction('extract', { element: id })}
          >
            {v.icon} {itemShort(id, lang)}
          </button>
        )
      })}
    </div>
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
      {room.patients.map((p) => {
        const v = ITEM_VISUALS[p.requiredVaccine]
        return (
        <div
          key={p.id}
          className={`patient-card${p.timeRemaining <= 10 ? ' urgent pulse' : ''}`}
          style={{ '--item-color': v.color, '--item-glow': v.glow } as CSSProperties}
        >
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
        )
      })}
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

function PartyLobbyPanel({
  room,
  lang,
  seated,
  joinUrl,
}: {
  room: PublicRoom
  lang: Lang
  seated: number
  joinUrl: string
}) {
  const ui = t(lang)
  const seatedPlayers = room.players.filter((p) => !p.spectator)

  return (
    <div className="party-setup">
      <h3>{ui.partySetupTitle}</h3>
      <ol className="party-steps">
        {ui.partySetupSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {room.youAreHost ? (
        <div className="party-host-block">
          <p className="tv-hint">{ui.tvModeHint}</p>
          <div className="room-code-big">{room.code}</div>
          <p className="join-url">{joinUrl}</p>
          <JoinQr url={joinUrl} size={200} alt="join" />
          <p className="hint">{ui.partyScanHint}</p>
        </div>
      ) : (
        <p className="party-guest-msg">{ui.partyGuestMsg}</p>
      )}

      <div className="party-roster">
        <strong>{ui.partyRoster} ({seated})</strong>
        <ul>
          {seatedPlayers.map((p) => (
            <li key={p.id}>
              {p.name}
              {p.connected ? '' : ' …'}
              {p.id === room.hostId ? ` (${ui.hostLabel})` : ''}
            </li>
          ))}
        </ul>
        {seated < room.minPlayersMulti && room.youAreHost && (
          <p className="hint">{ui.partyNeedMore}</p>
        )}
      </div>
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

const PING_BY_STATION: Record<Station, PingKind[]> = {
  extractor: ['need_deliver'],
  synthesizer: ['need_red', 'need_blue', 'need_deliver'],
  incubator: ['need_mix', 'need_deliver'],
}

const PING_UI: Record<PingKind, keyof ReturnType<typeof t>> = {
  need_red: 'pingNeedRed',
  need_blue: 'pingNeedBlue',
  need_mix: 'pingNeedMix',
  need_heat: 'pingNeedHeat',
  need_cool: 'pingNeedCool',
  need_deliver: 'pingDeliver',
}

function HandBar({
  room,
  lang,
  canDeliver,
  onAction,
}: {
  room: PublicRoom
  lang: Lang
  canDeliver: boolean
  onAction: (action: string, data?: Record<string, unknown>) => void
}) {
  const ui = t(lang)
  return (
    <div className="hand-bar">
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
      {canDeliver && (
        <button type="button" className="btn deliver-btn pulse" onClick={() => onAction('deliver')}>
          ✓ {ui.deliver}
        </button>
      )}
      {room.itemInHand && (
        <button type="button" className="btn ghost" onClick={() => onAction('drop')}>
          {ui.drop}
        </button>
      )}
    </div>
  )
}

function SoloLabView({
  room,
  lang,
  feedback,
  onAction,
}: {
  room: PublicRoom
  lang: Lang
  feedback: string | null
  onAction: (action: string, data?: Record<string, unknown>) => void
}) {
  const ui = t(lang)
  const canDeliver = Boolean(
    room.itemInHand && room.patients.some((p) => p.requiredVaccine === room.itemInHand),
  )

  return (
    <div className="solo-lab">
      <p className="coach-line">{ui.coachSolo}</p>
      <p className="flow-hint">{ui.soloFlow}</p>
      <HandBar room={room} lang={lang} canDeliver={canDeliver} onAction={onAction} />
      {feedback && <p className="feedback-banner">{feedback}</p>}

      <div className="lab-pipeline">
        <section
          className="station-panel"
          style={{ '--station-color': STATION_VISUALS.extractor.color } as CSSProperties}
        >
          <h3>{STATION_VISUALS.extractor.icon} {stationShort('extractor', lang)}</h3>
          <ExtractButtons lang={lang} onAction={onAction} />
        </section>

        <div className="flow-connector">↓</div>

        <section
          className="station-panel"
          style={{ '--station-color': STATION_VISUALS.synthesizer.color } as CSSProperties}
        >
          <h3>{STATION_VISUALS.synthesizer.icon} {stationShort('synthesizer', lang)}</h3>
          {room.synthSlot && (
            <p className="hint">
              {ui.synthSlot}: <ItemBadge item={room.synthSlot} lang={lang} size="sm" />
            </p>
          )}
          <button type="button" className="btn primary item-btn purple" onClick={() => onAction('synthesize')}>
            ⚗ {ui.synthesize}
          </button>
        </section>

        <div className="flow-connector">↓</div>

        <section
          className="station-panel"
          style={{ '--station-color': STATION_VISUALS.incubator.color } as CSSProperties}
        >
          <h3>{STATION_VISUALS.incubator.icon} {stationShort('incubator', lang)}</h3>
          <div className="action-row big-buttons">
            <button type="button" className="btn item-btn hot" onClick={() => onAction('incubate', { mode: 'heat' })}>
              🔥 {ui.heat}
            </button>
            <button type="button" className="btn item-btn cold" onClick={() => onAction('incubate', { mode: 'cool' })}>
              ❄ {ui.cool}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function MultiWorkstation({
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
  const pings = PING_BY_STATION[station]

  return (
    <div className="workstation" style={{ '--station-color': sv.color } as CSSProperties}>
      <h2>
        <span className="station-icon">{sv.icon}</span> {stationShort(station, lang)}
      </h2>
      <p className="coach-line">{ui.coachMulti}</p>
      <HandBar room={room} lang={lang} canDeliver={canDeliver} onAction={onAction} />
      {feedback && <p className="feedback-banner">{feedback}</p>}

      {station === 'extractor' && <ExtractButtons lang={lang} onAction={onAction} />}

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

      {room.itemInHand && others.length > 0 && (
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

      <div className="ping-row">
        {pings.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`btn ping${kind === 'need_deliver' ? ' urgent' : ''}`}
            onClick={() => onAction('ping', { kind })}
          >
            {ui[PING_UI[kind]]}
          </button>
        ))}
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
  if (room.mode === 'solo') {
    return <SoloLabView room={room} lang={lang} feedback={feedback} onAction={onAction} />
  }
  return (
    <MultiWorkstation
      room={room}
      lang={lang}
      playerId={playerId}
      feedback={feedback}
      onAction={onAction}
    />
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
          <PartyLobbyPanel
            room={room}
            lang={lang}
            seated={seated}
            joinUrl={`${APP_ORIGIN}/?join=${room.code}`}
          />

          {room.canStartSolo && !tutorialDone ? (
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
              className="btn primary party-start"
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
  const ui = useMemo(() => t(lang), [lang])

  useEffect(() => rememberLanguage(lang), [lang])
  useEffect(() => subscribeConnection(setConn), [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const joinCode = params.get('join')?.trim().toUpperCase()
    if (joinCode && /^[A-Z0-9]{4}$/.test(joinCode)) {
      setCode(joinCode)
      setScreen('join')
    }
  }, [])
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
