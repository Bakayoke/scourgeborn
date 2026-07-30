import { useEffect, useMemo, useState } from 'react'
import {
  applyPartyToken,
  castVote,
  claimPartySession,
  clearSession,
  createGame,
  fetchPartyInfo,
  getSocket,
  joinGame,
  loadPartyPass,
  loadSession,
  lockVotes,
  pickClass,
  redeemParty,
  rejoinGame,
  rematch,
  savePartyPass,
  saveSession,
  setLanguage as setRoomLanguage,
  startAdventure,
  startCheckout,
} from './api'
import { detectPreferredLanguage, formatExpiry, rememberLanguage, t } from './i18n'
import type { Lang, PartyInfo, PartyPassLocal, PlayerClass, PublicRoom } from './types'

type Screen = 'home' | 'create' | 'join' | 'play'

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endsAt) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [endsAt])
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

export default function App() {
  const [uiLang, setUiLang] = useState<Lang>(() => detectPreferredLanguage())
  const ui = t(uiLang)
  const [screen, setScreen] = useState<Screen>('home')
  const [name, setName] = useState(() => loadSession()?.name ?? '')
  const [joinCode, setJoinCode] = useState('')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [partyPass, setPartyPass] = useState<PartyPassLocal | null>(() => loadPartyPass())
  const [partyInfo, setPartyInfo] = useState<PartyInfo | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [promo, setPromo] = useState('')
  const [firstTime, setFirstTime] = useState(true)

  const hasParty = Boolean(partyPass && partyPass.expiresAt > Date.now())

  useEffect(() => {
    rememberLanguage(uiLang)
  }, [uiLang])

  useEffect(() => {
    void fetchPartyInfo().then(setPartyInfo)
  }, [])

  useEffect(() => {
    const sock = getSocket()
    const onRoom = (r: PublicRoom) => setRoom(r)
    sock.on('room', onRoom)
    return () => {
      sock.off('room', onRoom)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('party_session')
    const cancelled = params.get('party_cancel')
    if (cancelled) {
      setBanner(ui.partyCancel)
      window.history.replaceState({}, '', '/')
    }
    if (!sessionId) return
    void (async () => {
      const res = await claimPartySession(sessionId)
      if (res.token && res.expiresAt) {
        const pass = { token: res.token, expiresAt: res.expiresAt }
        savePartyPass(pass)
        setPartyPass(pass)
        setBanner(ui.partyThanks)
        if (res.roomCode) {
          await applyPartyToken(res.token).catch(() => null)
        }
      } else if (res.error) {
        setError(res.error)
      }
      window.history.replaceState({}, '', '/')
    })()
  }, [ui.partyCancel, ui.partyThanks])

  useEffect(() => {
    const session = loadSession()
    if (!session) return
    void (async () => {
      try {
        const res = await rejoinGame(session.code, session.playerId)
        if (res.ok) {
          setRoom(res.room)
          setPlayerId(res.playerId)
          setName(session.name)
          setScreen('play')
          if (hasParty && partyPass) {
            await applyPartyToken(partyPass.token).catch(() => null)
          }
        } else {
          clearSession()
        }
      } catch {
        /* stay on home */
      }
    })()
  }, [])

  function toggleLang() {
    const next: Lang = uiLang === 'sv' ? 'en' : 'sv'
    setUiLang(next)
    if (room && playerId === room.hostId) {
      void setRoomLanguage(next).then((res) => {
        if (res.ok && res.room) setRoom(res.room)
      })
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await createGame(name, uiLang, hasParty ? partyPass?.token : null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      saveSession({ code: res.room.code, playerId: res.playerId, name })
      setRoom(res.room)
      setPlayerId(res.playerId)
      setScreen('play')
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await joinGame(joinCode.trim().toUpperCase(), name)
      if (!res.ok) {
        setError(res.error)
        return
      }
      saveSession({ code: res.room.code, playerId: res.playerId, name })
      setRoom(res.room)
      setPlayerId(res.playerId)
      setUiLang(res.room.language)
      setScreen('play')
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  function leave() {
    clearSession()
    setRoom(null)
    setPlayerId(null)
    setScreen('home')
    setError(null)
  }

  async function checkout(plan: 'day' | 'week') {
    setBusy(true)
    setError(null)
    try {
      const res = await startCheckout({
        locale: uiLang,
        roomCode: room?.code,
        plan,
        firstTime,
      })
      if (res.url) {
        window.location.href = res.url
        return
      }
      setError(res.error || ui.stripeMissing)
    } catch {
      setError(ui.stripeMissing)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <p className="brand-sm">{ui.brand}</p>
        <button type="button" className="lang-toggle" onClick={toggleLang}>
          {ui.language}: {uiLang.toUpperCase()}
        </button>
      </div>

      {banner && <div className="banner">{banner}</div>}
      {hasParty && partyPass && (
        <p className="muted">
          {ui.partyActive} · {ui.partyUntil} {formatExpiry(partyPass.expiresAt, uiLang)}
        </p>
      )}

      {screen === 'home' && (
        <section className="hero">
          <h1 className="brand">{ui.brand}</h1>
          <p className="tagline">{ui.tagline}</p>
          <p className="support">{ui.heroSupport}</p>
          <div className="cta-row">
            <button type="button" className="btn" onClick={() => setScreen('create')}>
              {ui.create}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setScreen('join')}>
              {ui.join}
            </button>
          </div>
          {!hasParty && (
            <div className="party-box">
              <p className="muted">{ui.partyBlurb}</p>
              <p className="muted">{ui.freeTier}</p>
              <div className="cta-row">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={busy || partyInfo?.enabled === false}
                  onClick={() => void checkout('day')}
                >
                  {ui.unlockParty} · {partyInfo?.amountLabel ?? '…'} / {ui.partyDay}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy || partyInfo?.enabled === false}
                  onClick={() => void checkout('week')}
                >
                  {partyInfo?.weekAmountLabel ?? '…'} / {ui.partyWeek}
                </button>
              </div>
              <label className="muted" style={{ display: 'block', marginTop: '0.6rem' }}>
                <input
                  type="checkbox"
                  checked={firstTime}
                  onChange={(e) => setFirstTime(e.target.checked)}
                />{' '}
                {ui.firstTime}
                {partyInfo ? ` (${partyInfo.firstPartyDayLabel})` : ''}
              </label>
            </div>
          )}
        </section>
      )}

      {screen === 'create' && (
        <form className="panel" onSubmit={(e) => void onCreate(e)}>
          <h2 className="scene-title">{ui.create}</h2>
          <div className="field">
            <label htmlFor="name">{ui.yourName}</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={20}
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {ui.start}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setScreen('home')}>
              {ui.back}
            </button>
          </div>
        </form>
      )}

      {screen === 'join' && (
        <form className="panel" onSubmit={(e) => void onJoin(e)}>
          <h2 className="scene-title">{ui.join}</h2>
          <div className="field">
            <label htmlFor="join-name">{ui.yourName}</label>
            <input
              id="join-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={20}
            />
          </div>
          <div className="field">
            <label htmlFor="code">{ui.roomCode}</label>
            <input
              id="code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              required
              maxLength={4}
              autoFocus
              autoCapitalize="characters"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {ui.join}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setScreen('home')}>
              {ui.back}
            </button>
          </div>
        </form>
      )}

      {screen === 'play' && room && playerId && (
        <PlayView
          room={room}
          playerId={playerId}
          uiLang={uiLang}
          partyInfo={partyInfo}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          setRoom={setRoom}
          leave={leave}
          checkout={checkout}
          promo={promo}
          setPromo={setPromo}
          copied={copied}
          setCopied={setCopied}
          firstTime={firstTime}
          setFirstTime={setFirstTime}
        />
      )}
    </div>
  )
}

function PlayView({
  room,
  playerId,
  uiLang,
  partyInfo,
  busy,
  setBusy,
  error,
  setError,
  setRoom,
  leave,
  checkout,
  promo,
  setPromo,
  copied,
  setCopied,
  firstTime,
  setFirstTime,
}: {
  room: PublicRoom
  playerId: string
  uiLang: Lang
  partyInfo: PartyInfo | null
  busy: boolean
  setBusy: (v: boolean) => void
  error: string | null
  setError: (v: string | null) => void
  setRoom: (r: PublicRoom) => void
  leave: () => void
  checkout: (plan: 'day' | 'week') => Promise<void>
  promo: string
  setPromo: (v: string) => void
  copied: boolean
  setCopied: (v: boolean) => void
  firstTime: boolean
  setFirstTime: (v: boolean) => void
}) {
  const ui = t(room.language || uiLang)
  const isHost = room.hostId === playerId
  const me = room.players.find((p) => p.id === playerId)
  const seconds = useCountdown(room.voteEndsAt)
  const maxVotes = useMemo(
    () => Math.max(1, ...room.choices.map((c) => c.votes), room.voterCount || 1),
    [room.choices, room.voterCount],
  )

  const inLobby = room.status === 'lobby' || room.status === 'class_pick'
  const voting = room.status === 'voting'
  const resolving = room.status === 'resolve'
  const finished = room.status === 'finished'

  async function onPick(classId: PlayerClass) {
    setBusy(true)
    setError(null)
    try {
      const res = await pickClass(classId)
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onStart() {
    setBusy(true)
    setError(null)
    try {
      const res = await startAdventure()
      if (!res.ok) setError(res.error || ui.needClasses)
      else if (res.room) setRoom(res.room)
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onVote(choiceId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await castVote(choiceId)
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onLock() {
    setBusy(true)
    try {
      const res = await lockVotes()
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } finally {
      setBusy(false)
    }
  }

  async function onRematch() {
    setBusy(true)
    try {
      const res = await rematch()
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } finally {
      setBusy(false)
    }
  }

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await redeemParty(promo)
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } finally {
      setBusy(false)
    }
  }

  function copyCode() {
    void navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <span className="muted">{ui.code}</span>
          <div className="code-big">{room.code}</div>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-small" onClick={copyCode}>
            {copied ? ui.copied : ui.copy}
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={leave}>
            {ui.leave}
          </button>
        </div>
      </div>
      <p className="muted">{ui.shareHint}</p>
      <p className="muted">{room.premiumTier === 'party' ? ui.partyTier : ui.freeTier}</p>

      <h3 style={{ marginBottom: 0 }}>{ui.players}</h3>
      <ul className="player-list">
        {room.players.map((p) => {
          const cls = room.classes.find((c) => c.id === p.classId)
          return (
            <li key={p.id} className={p.connected ? undefined : 'offline'}>
              <span>
                {p.name}
                {p.id === room.hostId ? ` · ${ui.host}` : ''}
                {cls ? ` · ${cls.name}` : ''}
              </span>
              <span className="muted">{p.connected ? '●' : '○'}</span>
            </li>
          )
        })}
      </ul>

      {inLobby && (
        <>
          <h2 className="scene-title" style={{ marginTop: '1.25rem' }}>
            {ui.pickClass}
          </h2>
          <div className="class-grid">
            {room.classes.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`class-btn${me?.classId === c.id ? ' selected' : ''}`}
                onClick={() => void onPick(c.id)}
                disabled={busy}
              >
                <h3>
                  {c.name}
                  {me?.classId === c.id ? ` · ${ui.classPicked}` : ''}
                </h3>
                <p>{c.blurb}</p>
                <div className="stats">
                  M{c.might} · A{c.arcana} · C{c.cunning} — {c.ability}
                </div>
              </button>
            ))}
          </div>
          {isHost ? (
            <div className="cta-row">
              <button type="button" className="btn" disabled={busy} onClick={() => void onStart()}>
                {ui.startAdventure}
              </button>
            </div>
          ) : (
            <p className="muted">{ui.waitingHost}</p>
          )}
        </>
      )}

      {(voting || resolving || finished) && (
        <>
          <div className="bars" style={{ marginTop: '1rem' }}>
            <div>
              <div className="bar-label">
                <span>{ui.partyHp}</span>
                <span>
                  {room.partyHp}/{room.partyHpMax}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(100 * room.partyHp) / Math.max(1, room.partyHpMax)}%` }}
                />
              </div>
            </div>
            {room.combat && (
              <div>
                <div className="bar-label">
                  <span>
                    {ui.enemy}: {room.combat.enemyName}
                  </span>
                  <span>
                    {room.combat.enemyHp}/{room.combat.enemyHpMax}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill enemy"
                    style={{
                      width: `${(100 * room.combat.enemyHp) / Math.max(1, room.combat.enemyHpMax)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <p className="muted">{room.combat ? ui.combat : finished ? ui.ending : ui.scene}</p>
          <h2 className="scene-title">{room.title}</h2>
          <p className="scene-body">{room.narrative}</p>

          {(resolving || finished) && room.lastResolve && (
            <div className="resolve-box">
              <strong>{ui.winning}:</strong> {room.lastResolve.winningText}
              {room.lastResolve.combatLog && <p>{room.lastResolve.combatLog}</p>}
            </div>
          )}

          {voting && (
            <>
              <p className="muted">
                <span className="timer">{seconds}{ui.seconds}</span>
                {' · '}
                {room.votedCount}/{room.voterCount} {ui.votesIn}
              </p>
              <div className="vote-grid">
                {room.choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`vote-btn${room.yourVote === c.id ? ' mine' : ''}`}
                    onClick={() => void onVote(c.id)}
                    disabled={busy}
                  >
                    <span className="vote-count">{c.votes}</span>
                    {c.text}
                    <span
                      className="tally-bar"
                      style={{ width: `${(100 * c.votes) / maxVotes}%` }}
                    />
                  </button>
                ))}
              </div>
              {isHost && (
                <div className="cta-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void onLock()}
                  >
                    {ui.lockVotes}
                  </button>
                </div>
              )}
            </>
          )}

          {resolving && room.lastResolve && (
            <div className="vote-grid">
              {room.choices.map((c) => (
                <div
                  key={c.id}
                  className={`vote-btn${c.id === room.lastResolve?.winningChoiceId ? ' winner' : ''}`}
                >
                  <span className="vote-count">{room.lastResolve?.tally[c.id] ?? c.votes}</span>
                  {c.text}
                </div>
              ))}
            </div>
          )}

          {finished && isHost && (
            <div className="cta-row">
              <button type="button" className="btn" disabled={busy} onClick={() => void onRematch()}>
                {ui.rematch}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      {room.premiumTier !== 'party' && isHost && (
        <div className="party-box">
          <p className="muted">{ui.partyBlurb}</p>
          <div className="cta-row">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || partyInfo?.enabled === false}
              onClick={() => void checkout('day')}
            >
              {ui.unlockParty} · {partyInfo?.amountLabel ?? '…'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy || partyInfo?.enabled === false}
              onClick={() => void checkout('week')}
            >
              {partyInfo?.weekAmountLabel ?? '…'} / {ui.partyWeek}
            </button>
          </div>
          <label className="muted" style={{ display: 'block', marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={firstTime}
              onChange={(e) => setFirstTime(e.target.checked)}
            />{' '}
            {ui.firstTime}
          </label>
          <form className="row" style={{ marginTop: '0.75rem' }} onSubmit={(e) => void onRedeem(e)}>
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder={ui.redeemCode}
              style={{
                flex: 1,
                minWidth: 140,
                padding: '0.55rem 0.7rem',
                borderRadius: 4,
                border: '1px solid var(--line)',
                background: 'rgba(8,14,10,0.65)',
                color: 'var(--ink)',
              }}
            />
            <button type="submit" className="btn btn-ghost btn-small" disabled={busy}>
              {ui.redeem}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
