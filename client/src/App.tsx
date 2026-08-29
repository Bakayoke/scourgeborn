import { useEffect, useMemo, useState } from 'react'
import {
  acknowledgeAffliction,
  backToLobby,
  callCleansingRite,
  cleansingVote,
  clearSession,
  createGame,
  endParty,
  ensureSessionBound,
  joinGame,
  loadPartyPass,
  loadSession,
  ritualTool,
  saveSession,
  setRoomHandler,
  startGame,
  subscribeConnection,
  type ConnState,
} from './api'
import {
  coachForPhase,
  formatMs,
  glyphLabel,
  loadLanguage,
  outcomeLabel,
  phaseLabel,
  rememberLanguage,
  taskTitle,
  t,
} from './i18n'
import { JoinQr } from './qr'
import type { Lang, PublicRoom, ToolId } from './types'

type Screen = 'home' | 'create' | 'join' | 'game'
const APP_ORIGIN = 'https://scourgeborn.com'
const GLYPHS = ['void', 'arc', 'blood', 'star', 'ash']

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 400)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

function VoidBackdrop() {
  return (
    <div className="void-backdrop" aria-hidden>
      <div className="void-orb void-orb-a" />
      <div className="void-orb void-orb-b" />
      <div className="void-grid" />
    </div>
  )
}

function CoachBanner({
  room,
  lang,
  playerId,
  seconds,
}: {
  room: PublicRoom
  lang: Lang
  playerId: string | null
  seconds: number
}) {
  const ui = t(lang)
  const coach = coachForPhase(room, playerId ?? undefined, lang)
  const goal = room.mode === 'solo' || (room.status === 'lobby' && room.players.filter((p) => !p.spectator).length <= 1)
    ? ui.goalSolo
    : ui.goalMulti

  return (
    <div className="coach-banner">
      <p className="coach-label">{ui.yourJob}</p>
      <p className="coach-text">{room.status === 'lobby' ? coach : coach}</p>
      {room.status === 'ritual' && (
        <p className="coach-sub">
          {ui.coachTimer}: <strong>{seconds}s</strong> · {ui.coachFail}
        </p>
      )}
      {(room.status === 'lobby' || room.status === 'ritual') && (
        <details className="goal-details">
          <summary>{ui.goalTitle}</summary>
          <p>{goal}</p>
        </details>
      )}
    </div>
  )
}

function MatrixHud({ room, ui }: { room: PublicRoom; ui: ReturnType<typeof t> }) {
  return (
    <div className="matrix-hud">
      <div className="hud-cell">
        <span>{ui.matrixHealth}</span>
        <strong>{room.matrixHealth}%</strong>
        <div className="bar">
          <div className="bar-fill health" style={{ width: `${room.matrixHealth}%` }} />
        </div>
      </div>
      <div className="hud-cell">
        <span>{ui.cycle}</span>
        <strong>
          {room.cycle}/{room.maxCycles}
        </strong>
      </div>
      {room.mode === 'multi' && room.status !== 'lobby' && (
        <div className="hud-cell">
          <span>{ui.scourgeMeter}</span>
          <strong>{room.scourgeMeter}%</strong>
        </div>
      )}
    </div>
  )
}

function TaskList({ room, lang, playerId }: { room: PublicRoom; lang: Lang; playerId: string | null }) {
  const ui = t(lang)
  return (
    <div className="team-tasks">
      <h3>{ui.teamTasks}</h3>
      <ul className="task-list">
        {room.tasks.map((task) => {
          const yours = playerId && task.assignedPlayerIds.includes(playerId)
          const status = task.completed ? ui.statusDone : task.failed ? ui.statusFail : ui.statusLive
          return (
            <li
              key={task.id}
              className={`${task.completed ? 'done' : task.failed ? 'fail' : 'live'}${yours ? ' yours' : ''}`}
            >
              <span>
                {yours && '★ '}
                {taskTitle(task, lang)}
              </span>
              <em>{status}</em>
              {task.kind === 'crystal' && !task.completed && !task.failed && (
                <span className="task-detail">{task.targetCrystal}% / 75%</span>
              )}
              {task.kind === 'glyphs' && !task.completed && !task.failed && (
                <span className="task-detail">{task.glyphHint}</span>
              )}
              {task.kind === 'essence' && !task.completed && !task.failed && (
                <span className="task-detail">
                  {task.essenceValue}% ({task.essenceMin}–{task.essenceMax})
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function crystalFeedback(value: number, ui: ReturnType<typeof t>) {
  const d = Math.abs(value - 75)
  if (d <= 3) return { text: ui.crystalOk, className: 'ok' }
  if (d <= 12) return { text: ui.crystalClose, className: 'warn' }
  return { text: ui.crystalFar, className: 'bad' }
}

function essenceFeedback(value: number, min: number, max: number, ui: ReturnType<typeof t>) {
  if (value >= min && value <= max) return { text: ui.essenceOk, className: 'ok' }
  return { text: ui.essenceFar, className: 'bad' }
}

function RitualTools({
  room,
  ui,
  lang,
  onTool,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  lang: Lang
  onTool: (tool: ToolId, data: Record<string, unknown>) => void
}) {
  const crystalTask = room.tasks.find((t) => t.kind === 'crystal' && !t.completed && !t.failed)
  const glyphTask = room.tasks.find((t) => t.kind === 'glyphs' && !t.completed && !t.failed)
  const essenceTask = room.tasks.find((t) => t.kind === 'essence' && !t.completed && !t.failed)

  const hasJob =
    (room.yourTools.includes('crystal_slider') && crystalTask) ||
    (room.yourTools.includes('glyph_board') && glyphTask) ||
    (room.yourTools.includes('essence_valve') && essenceTask)

  if (!hasJob && !room.yourTools.includes('miasma_cloud')) {
    return <p className="hint panel">{ui.coachWaiting}</p>
  }

  const crystalFb = crystalTask ? crystalFeedback(crystalTask.targetCrystal, ui) : null
  const essenceFb = essenceTask
    ? essenceFeedback(essenceTask.essenceValue, essenceTask.essenceMin, essenceTask.essenceMax, ui)
    : null

  return (
    <div className="ritual-tools">
      {room.yourTools.includes('crystal_slider') && crystalTask && (
        <div className="tool-panel">
          <h3>{ui.toolCrystal}</h3>
          <p className="tool-instruct">{ui.coachCrystal}</p>
          <input
            type="range"
            min={0}
            max={100}
            value={crystalTask.targetCrystal}
            onChange={(e) => onTool('crystal_slider', { value: Number(e.target.value) })}
          />
          <p className={`feedback ${crystalFb?.className}`}>
            {crystalTask.targetCrystal}% — {crystalFb?.text}
          </p>
        </div>
      )}

      {room.yourTools.includes('glyph_board') && glyphTask && (
        <div className="tool-panel">
          <h3>{ui.toolGlyphs}</h3>
          <p className="tool-instruct">{ui.coachGlyphs}</p>
          {glyphTask.glyphSequence.length > 0 ? (
            <ol className="glyph-sequence">
              {glyphTask.glyphSequence.map((g, i) => (
                <li key={`${g}-${i}`} className={i < glyphTask.glyphProgress ? 'done' : i === glyphTask.glyphProgress ? 'next' : ''}>
                  {glyphLabel(g, lang)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="glyph-hint">{glyphTask.glyphHint}</p>
          )}
          <div className="glyph-grid">
            {GLYPHS.map((g) => (
              <button key={g} type="button" className="glyph-btn" onClick={() => onTool('glyph_board', { symbol: g })}>
                {glyphLabel(g, lang)}
              </button>
            ))}
          </div>
          <p className="feedback">
            {glyphTask.glyphProgress >= glyphTask.glyphSequence.length ? ui.glyphDone : ui.glyphNext}
          </p>
        </div>
      )}

      {room.yourTools.includes('essence_valve') && essenceTask && (
        <div className="tool-panel">
          <h3>{ui.toolEssence}</h3>
          <p className="tool-instruct">{ui.coachEssence}</p>
          <input
            type="range"
            min={0}
            max={100}
            value={essenceTask.essenceValue}
            onChange={(e) => onTool('essence_valve', { value: Number(e.target.value) })}
          />
          <p className={`feedback ${essenceFb?.className}`}>
            {essenceTask.essenceValue}% — {essenceFb?.text}
          </p>
        </div>
      )}

      {room.yourTools.includes('miasma_cloud') && (
        <button type="button" className="btn scourge-btn" onClick={() => onTool('miasma_cloud', {})}>
          {ui.toolMiasma}
        </button>
      )}
      {room.yourTools.includes('sabotage_pulse') && (
        <button type="button" className="btn scourge-btn" onClick={() => onTool('sabotage_pulse', {})}>
          {ui.toolSabotage}
        </button>
      )}
    </div>
  )
}

function GameView({
  room,
  lang,
  playerId,
  tvMode,
  onLeave,
  onError,
}: {
  room: PublicRoom
  lang: Lang
  playerId: string | null
  tvMode: boolean
  onLeave: () => void
  onError: (m: string) => void
}) {
  const ui = t(lang)
  const seconds = useCountdown(room.phaseEndsAt)
  const seated = room.players.filter((p) => !p.spectator && p.connected).length

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    try {
      const res = await fn()
      if (!res.ok) onError(res.error ?? ui.error)
    } catch {
      onError(ui.error)
    }
  }

  if (room.status === 'finished') {
    const won = room.outcome === 'keepers_win'
    return (
      <div className={`finale ${won ? 'win' : 'loss'}`}>
        <h2>{outcomeLabel(room.outcome, lang)}</h2>
        {room.mode === 'solo' && room.soloSurvivalMs > 0 && (
          <p>
            {ui.soloTime}: {formatMs(room.soloSurvivalMs)}
          </p>
        )}
        <MatrixHud room={room} ui={ui} />
        <div className="finale-actions">
          <button type="button" className="btn" onClick={onLeave}>
            {ui.leave}
          </button>
          {room.youAreHost && (
            <button type="button" className="btn primary" onClick={() => void act(backToLobby)}>
              {ui.backToLobby}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`game-view${tvMode ? ' tv' : ''}${room.miasmaActive ? ' miasma' : ''}`}>
      <header className="game-header">
        <div>
          <span className="code-stamp">{room.code}</span>
          <span className="phase-stamp">{phaseLabel(room.status, lang)}</span>
        </div>
        {room.phaseEndsAt > 0 && room.status === 'ritual' && (
          <span className="timer">{seconds}s</span>
        )}
      </header>

      <CoachBanner room={room} lang={lang} playerId={playerId} seconds={seconds} />

      {room.miasmaActive && !tvMode && <p className="miasma-banner">{ui.miasma}</p>}

      <MatrixHud room={room} ui={ui} />

      {room.lastEvent && (
        <p className="event-line">
          {ui.lastEvent}: {room.lastEvent}
        </p>
      )}

      {room.status === 'lobby' && (
        <div className="panel lobby-panel">
          <p className="hint">{ui.shareHint}</p>
          <p className="hint">
            {seated} {ui.players.toLowerCase()}
            {seated === 1 ? ' · ' + ui.coachLobbySolo : ` · ${ui.minMulti}`}
          </p>
          {room.youAreHost ? (
            <button type="button" className="btn primary" onClick={() => void act(startGame)}>
              {seated === 1 ? ui.startSolo : ui.startGame}
            </button>
          ) : (
            <p className="hint">{ui.waitingHost}</p>
          )}
        </div>
      )}

      {room.showAffliction && (
        <div className="affliction-modal">
          <h2>{ui.afflictionTitle}</h2>
          <p>{ui.afflictionBody}</p>
          <button type="button" className="btn scourge-btn" onClick={() => void act(acknowledgeAffliction)}>
            {ui.afflictionAck}
          </button>
        </div>
      )}

      {room.status === 'cleansing' && room.cleansing && !room.youCleansingVoted && (
        <div className="panel cleansing">
          <h3>{ui.cleansingHint}</h3>
          <p className="hint">{ui.coachCleansing}</p>
          <div className="vote-grid">
            {room.players
              .filter((p) => !p.spectator)
              .map((p) => (
                <button key={p.id} type="button" className="btn" onClick={() => void act(() => cleansingVote(p.id))}>
                  {p.name}
                </button>
              ))}
            <button type="button" className="btn ghost" onClick={() => void act(() => cleansingVote('skip'))}>
              {ui.voteSkip}
            </button>
          </div>
        </div>
      )}

      {room.status === 'cycle_end' && (
        <div className="panel cycle-panel">
          <p className="coach-text">{ui.coachCycle}</p>
        </div>
      )}

      {(room.status === 'ritual' || room.status === 'cycle_end') && (
        <>
          {!tvMode && room.status === 'ritual' && (
            <RitualTools
              room={room}
              ui={ui}
              lang={lang}
              onTool={(tool, data) => void act(() => ritualTool(tool, data))}
            />
          )}
          <TaskList room={room} lang={lang} playerId={playerId} />
          {room.mode === 'multi' && room.status === 'ritual' && !room.youAreSpectator && (
            <button type="button" className="btn ghost small" onClick={() => void act(callCleansingRite)}>
              {ui.callCleansing}
            </button>
          )}
        </>
      )}

      <footer className="game-footer">
        <button type="button" className="btn ghost" onClick={onLeave}>
          {ui.leave}
        </button>
        {room.youAreHost && room.status !== 'lobby' && (
          <button type="button" className="btn ghost danger" onClick={() => void act(endParty)}>
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
  const [tvMode, setTvMode] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const ui = useMemo(() => t(lang), [lang])

  useEffect(() => rememberLanguage(lang), [lang])
  useEffect(() => subscribeConnection(setConn), [])
  useEffect(() => {
    setRoomHandler((r) => setRoom(r))
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

  if (room && screen === 'game') {
    return (
      <>
        <VoidBackdrop />
        <main className={`app ritual-app${tvMode ? ' tv-app' : ''}`}>
          {error && <p className="error-banner">{error}</p>}
          <GameView
            room={room}
            lang={lang}
            playerId={playerId}
            tvMode={tvMode}
            onLeave={leaveGame}
            onError={setError}
          />
          {room.status === 'lobby' && room.youAreHost && (
            <div className="host-tools">
              <button type="button" className="btn ghost" onClick={() => setShowQr((v) => !v)}>
                {showQr ? ui.hideQr : ui.showQr}
              </button>
              <button type="button" className="btn ghost" onClick={() => setTvMode((v) => !v)}>
                {tvMode ? ui.tvExit : ui.tvMode}
              </button>
              {showQr && (
                <div className="qr-wrap">
                  <JoinQr url={`${APP_ORIGIN}/?join=${room.code}`} alt={ui.joinOnPhone} />
                </div>
              )}
            </div>
          )}
          <p className={`conn ${conn}`}>{conn === 'connected' ? ui.connected : ui.connecting}</p>
        </main>
      </>
    )
  }

  return (
    <>
      <VoidBackdrop />
      <main className="app home ritual-home">
        <header className="hero">
          <p className="stamp">{ui.stamp}</p>
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
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  required
                />
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
    </>
  )
}
