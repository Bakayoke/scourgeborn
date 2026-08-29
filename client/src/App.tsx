import { useEffect, useMemo, useState } from 'react'
import {
  ackResolution,
  backToLobby,
  clearSession,
  createGame,
  endParty,
  ensureSessionBound,
  fetchPartyInfo,
  fetchPublicLobbies,
  joinGame,
  loadPartyPass,
  loadSession,
  proposeTeam,
  revealRole,
  saveSession,
  setRoomHandler,
  startGame,
  subscribeConnection,
  voteMission,
  voteTeam,
  type ConnState,
  type PublicLobbyCard,
} from './api'
import { loadLanguage, outcomeLabel, phaseLabel, playerName, rememberLanguage, roleLabel, t } from './i18n'
import { JoinQr } from './qr'
import type { Lang, PublicRoom } from './types'

type Screen = 'home' | 'create' | 'join' | 'find' | 'game'

const APP_ORIGIN = 'https://scourgeborn.com'

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

function Mist() {
  return (
    <div className="mist" aria-hidden>
      <div className="mist-layer mist-a" />
      <div className="mist-layer mist-b" />
      <div className="mist-layer mist-c" />
      <div className="spore-field" />
    </div>
  )
}

function ScoreBoard({ room, ui }: { room: PublicRoom; ui: ReturnType<typeof t> }) {
  return (
    <div className="score-board">
      <div className="score-cell cleanse">
        <span>{ui.scoreCleanse}</span>
        <strong>{room.scores.cleanses}/3</strong>
      </div>
      <div className="score-cell infect">
        <span>{ui.scoreInfect}</span>
        <strong>{room.scores.infections}/3</strong>
      </div>
      {room.failedElectionStreak > 0 && (
        <div className="score-cell fail">
          <span>{ui.failedElections}</span>
          <strong>{room.failedElectionStreak}/3</strong>
        </div>
      )}
    </div>
  )
}

function PlayerList({ room, ui }: { room: PublicRoom; ui: ReturnType<typeof t> }) {
  return (
    <ul className="player-list">
      {room.players
        .filter((p) => !p.spectator)
        .map((p) => {
          const isLeader = p.id === room.expeditionLeaderId
          const onMission = room.proposedTeamIds.includes(p.id)
          const teamVoted = room.teamVoteSubmittedIds.includes(p.id)
          const missionVoted = room.missionSubmittedIds.includes(p.id)
          return (
            <li key={p.id} className={p.connected ? 'online' : 'offline'}>
              <span className="player-name">
                {p.name}
                {p.id === room.hostId && <em className="badge">{ui.host}</em>}
                {isLeader && room.status !== 'lobby' && (
                  <em className="badge leader">{ui.leaderIs}</em>
                )}
                {onMission && room.status !== 'lobby' && (
                  <em className="badge mission">{ui.onMission}</em>
                )}
              </span>
              <span className="player-meta">
                {!p.connected && ui.statusOffline}
                {p.connected && teamVoted && room.status === 'team_vote' && ui.voted}
                {p.connected && missionVoted && room.status === 'mission' && ui.voted}
                {p.connected &&
                  !teamVoted &&
                  !missionVoted &&
                  (p.connected ? ui.statusOnline : ui.statusOffline)}
                {room.status === 'finished' && p.role && (
                  <em className={`role-tag ${p.role}`}>{roleLabel(p.role, room.language)}</em>
                )}
              </span>
            </li>
          )
        })}
    </ul>
  )
}

function RoleRevealView({
  room,
  ui,
  onReveal,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  onReveal: () => void
}) {
  if (!room.youRoleRevealed) {
    return (
      <div className="phase-panel secret">
        <p className="phase-title">{ui.phaseRoles}</p>
        <button type="button" className="btn reveal-btn" onClick={onReveal}>
          {ui.tapReveal}
        </button>
        <p className="hint">
          {room.rolesRevealedCount}/{room.rolesTotal} {ui.rolesWaiting}
        </p>
      </div>
    )
  }

  const role = room.yourRole!
  const isTraitor = role === 'scourgeborn'
  return (
    <div className={`phase-panel role-card ${role}`}>
      <p className="phase-title">{roleLabel(role, room.language)}</p>
      <p className="role-desc">{isTraitor ? ui.roleScourgebornDesc : ui.roleInnocentDesc}</p>
      <p className="hint">
        {room.rolesRevealedCount}/{room.rolesTotal} {ui.rolesWaiting}
      </p>
    </div>
  )
}

function ElectionView({
  room,
  ui,
  onPick,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  onPick: (id: string) => void
}) {
  const candidates = room.players.filter(
    (p) => !p.spectator && p.id !== room.expeditionLeaderId,
  )

  if (!room.youAreLeader) {
    return (
      <div className="phase-panel">
        <p className="phase-title">{ui.phaseElection}</p>
        <p className="hint">
          {ui.leaderIs}: <strong>{playerName(room, room.expeditionLeaderId)}</strong>
        </p>
        <p className="hint">{ui.teamWaiting}</p>
      </div>
    )
  }

  return (
    <div className="phase-panel">
      <p className="phase-title">{ui.leaderPick}</p>
      <div className="pick-grid">
        {candidates.map((p) => (
          <button key={p.id} type="button" className="btn pick-btn" onClick={() => onPick(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function TeamVoteView({
  room,
  ui,
  onVote,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  onVote: (yes: boolean) => void
}) {
  const team = room.proposedTeamIds.map((id) => playerName(room, id)).join(' + ')

  if (room.youTeamVoted) {
    return (
      <div className="phase-panel">
        <p className="phase-title">{ui.phaseTeamVote}</p>
        <p className="hint">{team}</p>
        <p className="hint">
          {room.teamVoteSubmittedCount}/{room.teamVoteTotal} {ui.teamWaiting}
        </p>
      </div>
    )
  }

  return (
    <div className="phase-panel">
      <p className="phase-title">{ui.teamVoteHint}</p>
      <p className="team-line">{team}</p>
      <div className="vote-row">
        <button type="button" className="btn vote-yes" onClick={() => onVote(true)}>
          {ui.voteYes}
        </button>
        <button type="button" className="btn vote-no" onClick={() => onVote(false)}>
          {ui.voteNo}
        </button>
      </div>
    </div>
  )
}

function MissionView({
  room,
  ui,
  onVote,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  onVote: (v: 'cleanse' | 'infect') => void
}) {
  if (!room.youOnMission) {
    return (
      <div className="phase-panel">
        <p className="phase-title">{ui.phaseMission}</p>
        <p className="hint">
          {room.proposedTeamIds.map((id) => playerName(room, id)).join(' + ')}
        </p>
        <p className="hint">{ui.missionWaiting}</p>
      </div>
    )
  }

  if (room.youMissionVoted) {
    return (
      <div className="phase-panel">
        <p className="phase-title">{ui.phaseMission}</p>
        <p className="hint">{ui.missionWaiting}</p>
      </div>
    )
  }

  const canInfect = room.yourRole === 'scourgeborn'
  return (
    <div className="phase-panel secret">
      <p className="phase-title">{ui.phaseMission}</p>
      <p className="hint">{ui.missionHint}</p>
      <div className="vote-row">
        <button type="button" className="btn mission-cleanse" onClick={() => onVote('cleanse')}>
          {ui.missionCleanse}
        </button>
        {canInfect && (
          <button type="button" className="btn mission-infect" onClick={() => onVote('infect')}>
            {ui.missionInfect}
          </button>
        )}
      </div>
    </div>
  )
}

function ResolutionView({ room, ui }: { room: PublicRoom; ui: ReturnType<typeof t> }) {
  const result = room.lastMissionResult
  const success = result?.success
  return (
    <div className={`phase-panel resolution ${success ? 'success' : 'fail'}`}>
      <p className="phase-title">{success ? ui.missionSuccess : ui.missionFail}</p>
      {result && (
        <p className="hint">
          {result.teamIds.map((id) => playerName(room, id)).join(' + ')}
        </p>
      )}
      <p className="hint dim">{ui.autoAdvance}</p>
    </div>
  )
}

function FinaleView({
  room,
  ui,
  onLeave,
  onBackLobby,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  onLeave: () => void
  onBackLobby: () => void
}) {
  const won = room.outcome === 'innocents_win'
  return (
    <div className={`finale ${won ? 'innocents' : 'scourgeborn'}`}>
      <div className="finale-body">
        <h2>{outcomeLabel(room.outcome, room.language)}</h2>
        <p>{won ? ui.outcomeInnocentsDesc : ui.outcomeScourgebornDesc}</p>
        <ScoreBoard room={room} ui={ui} />
        <PlayerList room={room} ui={ui} />
      </div>
      <div className="finale-footer">
        <button type="button" className="btn" onClick={onLeave}>
          {ui.leave}
        </button>
        {room.youAreHost && (
          <button type="button" className="btn primary" onClick={onBackLobby}>
            {ui.backToLobby}
          </button>
        )}
        {!room.youAreHost && <p className="hint">{ui.waitingHostFinale}</p>}
      </div>
    </div>
  )
}

function GameView({
  room,
  lang,
  tvMode,
  onLeave,
  onError,
}: {
  room: PublicRoom
  lang: Lang
  tvMode: boolean
  onLeave: () => void
  onError: (msg: string) => void
}) {
  const ui = t(lang)
  const seconds = useCountdown(room.phaseEndsAt)
  const seated = room.players.filter((p) => !p.spectator && p.connected).length

  async function act(fn: () => Promise<{ ok: boolean; error?: string; room?: PublicRoom }>) {
    try {
      const res = await fn()
      if (!res.ok) onError(res.error ?? ui.error)
    } catch {
      onError(ui.error)
    }
  }

  if (room.status === 'finished') {
    return (
      <FinaleView
        room={room}
        ui={ui}
        onLeave={onLeave}
        onBackLobby={() => void act(backToLobby)}
      />
    )
  }

  return (
    <div className={`game-view${tvMode ? ' tv' : ''}`}>
      <header className="game-header">
        <div>
          <span className="code-stamp">{room.code}</span>
          <span className="phase-stamp">{phaseLabel(room.status, lang)}</span>
        </div>
        {room.phaseEndsAt > 0 && (
          <span className="timer">{seconds}{ui.timerLeft}</span>
        )}
      </header>

      <ScoreBoard room={room} ui={ui} />

      {room.status === 'lobby' && (
        <div className="phase-panel">
          <p className="hint">{ui.shareHint}</p>
          <PlayerList room={room} ui={ui} />
          <p className="hint">
            {seated}/{room.minPlayers} {ui.players.toLowerCase()}
          </p>
          {room.youAreHost ? (
            <>
              <p className="hint">{seated >= room.minPlayers ? ui.hostHint : ui.needPlayers}</p>
              <button
                type="button"
                className="btn primary"
                disabled={seated < room.minPlayers}
                onClick={() => void act(startGame)}
              >
                {ui.startGame}
              </button>
            </>
          ) : (
            <p className="hint">{ui.waitingHost}</p>
          )}
        </div>
      )}

      {room.status === 'roles' && (
        <RoleRevealView room={room} ui={ui} onReveal={() => void act(revealRole)} />
      )}

      {room.status === 'election' && (
        <ElectionView room={room} ui={ui} onPick={(id) => void act(() => proposeTeam(id))} />
      )}

      {room.status === 'team_vote' && (
        <TeamVoteView room={room} ui={ui} onVote={(yes) => void act(() => voteTeam(yes))} />
      )}

      {room.status === 'mission' && (
        <MissionView room={room} ui={ui} onVote={(v) => void act(() => voteMission(v))} />
      )}

      {room.status === 'resolution' && <ResolutionView room={room} ui={ui} />}

      {room.status !== 'lobby' && (
        <section className="roster-panel">
          <PlayerList room={room} ui={ui} />
        </section>
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
  const [error, setError] = useState<string | null>(null)
  const [conn, setConn] = useState<ConnState>('connecting')
  const [tvMode, setTvMode] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [lobbies, setLobbies] = useState<PublicLobbyCard[]>([])
  const [partyEnabled, setPartyEnabled] = useState(false)

  const ui = useMemo(() => t(lang), [lang])

  useEffect(() => {
    rememberLanguage(lang)
  }, [lang])

  useEffect(() => {
    return subscribeConnection(setConn)
  }, [])

  useEffect(() => {
    setRoomHandler((r) => setRoom(r))
    return () => setRoomHandler(null)
  }, [])

  useEffect(() => {
    if (room?.status === 'resolution') {
      const tId = setTimeout(() => void ackResolution(), 6000)
      return () => clearTimeout(tId)
    }
  }, [room?.status, room?.missionRound])

  useEffect(() => {
    void fetchPartyInfo()
      .then((info) => setPartyEnabled(info.enabled))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const session = loadSession()
    if (session) {
      setName(session.name)
      setCode(session.code)
      void ensureSessionBound().then((res) => {
        if (res?.ok && res.room && res.playerId) {
          setRoom(res.room)
          setScreen('game')
        }
      })
    }
  }, [])

  function bindSession(r: PublicRoom, pid: string, playerName: string) {
    saveSession({ code: r.code, playerId: pid, name: playerName })
    setRoom(r)
    setScreen('game')
  }

  function leaveGame() {
    clearSession()
    setRoom(null)
    setScreen('home')
  }

  async function handleCreate() {
    setError(null)
    const pass = loadPartyPass()
    const res = await createGame(name, lang, pass?.token ?? null, false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bindSession(res.room, res.playerId, name)
  }

  async function handleJoin(joinCode?: string) {
    setError(null)
    const c = (joinCode ?? code).trim().toUpperCase()
    const res = await joinGame(c, name)
    if (!res.ok) {
      setError(res.error)
      return
    }
    bindSession(res.room, res.playerId, name)
  }

  async function loadLobbies() {
    try {
      setLobbies(await fetchPublicLobbies(lang))
    } catch {
      setLobbies([])
    }
  }

  const joinUrl = `${APP_ORIGIN}/?join=${room?.code ?? ''}`

  if (room && screen === 'game') {
    return (
      <>
        <Mist />
        <main className={`app${tvMode ? ' tv-app' : ''}`}>
          {room.notice && <p className="notice">{room.notice}</p>}
          {error && <p className="error-banner">{error}</p>}
          <GameView
            room={room}
            lang={lang}
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
                  <JoinQr url={joinUrl} alt={ui.joinUrl} />
                  <p className="hint">{ui.joinOnPhone}</p>
                </div>
              )}
            </div>
          )}
          <p className={`conn ${conn}`}>
            {conn === 'connected' ? ui.connected : conn === 'connecting' ? ui.connecting : ui.disconnected}
          </p>
        </main>
      </>
    )
  }

  return (
    <>
      <Mist />
      <main className="app home">
        <header className="hero">
          <p className="stamp">{ui.outbreakStamp}</p>
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
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setScreen('find')
                void loadLobbies()
              }}
            >
              {ui.findGame}
            </button>
            <div className="lang-toggle">
              <span>{ui.language}</span>
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
            <button type="button" className="btn ghost" onClick={() => setScreen('home')}>
              {ui.back}
            </button>
          </form>
        )}

        {screen === 'find' && (
          <div className="lobby-find">
            <button type="button" className="btn ghost" onClick={() => setScreen('home')}>
              {ui.back}
            </button>
            <ul>
              {lobbies.map((l) => (
                <li key={l.code}>
                  <button
                    type="button"
                    className="lobby-card"
                    onClick={() => {
                      setCode(l.code)
                      setScreen('join')
                    }}
                  >
                    <strong>{l.code}</strong>
                    <span>
                      {l.playerCount} · {l.hostName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {lobbies.length === 0 && <p className="hint">{ui.error}</p>}
          </div>
        )}

        <section className="how-to">
          <h2>{ui.howTo}</h2>
          <ol>
            {ui.howToSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {partyEnabled && (
          <p className="hint tier">{ui.freeTier}</p>
        )}

        <p className={`conn ${conn}`}>
          {conn === 'connected' ? ui.connected : conn === 'connecting' ? ui.connecting : ui.disconnected}
        </p>
      </main>
    </>
  )
}
