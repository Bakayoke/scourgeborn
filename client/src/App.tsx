import { useEffect, useMemo, useState } from 'react'
import {
  applyPartyToken,
  castVote,
  claimPartySession,
  clearSession,
  createGame,
  fetchPartyInfo,
  joinGame,
  loadPartyPass,
  loadSession,
  lockVotes,
  pauseAdventure,
  pickClass,
  redeemParty,
  rejoinGame,
  rematch,
  resumeAdventure,
  savePartyPass,
  saveSession,
  setDmNote,
  setLanguage as setRoomLanguage,
  setRoomHandler,
  startAdventure,
  startCheckout,
} from './api'
import { detectPreferredLanguage, formatExpiry, rememberLanguage, t } from './i18n'
import { renderEndingCard } from './shareCard'
import type { AdventureMode, Lang, PartyInfo, PartyPassLocal, PlayerClass, PublicRoom } from './types'

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

function vibe(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

function modeLabel(mode: AdventureMode, ui: ReturnType<typeof t>) {
  if (mode === 'orcs') return ui.modeOrcs
  if (mode === 'dragon') return ui.modeDragon
  if (mode === 'chaos') return ui.modeChaos
  return ui.modeStory
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
    void fetchPartyInfo()
      .then(setPartyInfo)
      .catch((e) => {
        setError(e instanceof Error ? e.message : ui.stripeMissing)
      })
  }, [ui.stripeMissing])

  useEffect(() => {
    setRoomHandler((r) => setRoom(r))
    return () => setRoomHandler(null)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const join = params.get('join')
    if (join && /^[A-Z]{4}$/i.test(join)) {
      setJoinCode(join.toUpperCase())
      setScreen('join')
      window.history.replaceState({}, '', '/')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.stripeMissing)
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
      {error && <p className="error">{error}</p>}
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
  const [showQr, setShowQr] = useState(false)
  const [dmDraft, setDmDraft] = useState('')
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [tvMode, setTvMode] = useState(false)
  const maxVotes = useMemo(
    () => Math.max(1, ...room.choices.map((c) => c.votes), room.voterCount || 1),
    [room.choices, room.voterCount],
  )
  const closeRaceLive = useMemo(() => {
    const sorted = [...room.choices].sort((a, b) => b.votes - a.votes)
    return Boolean(sorted[0] && sorted[1] && sorted[0].votes > 0 && sorted[0].votes === sorted[1].votes)
  }, [room.choices])
  const classesReady = room.players.filter((p) => p.connected && p.classId).length
  const classesNeeded = room.players.filter((p) => p.connected).length
  const yourChoiceText = room.choices.find((c) => c.id === room.yourVote)?.text

  const inLobby = room.status === 'lobby' || room.status === 'class_pick'
  const voting = room.status === 'voting'
  const resolving = room.status === 'resolve'
  const finished = room.status === 'finished'
  const paused = room.status === 'paused'
  const tense = voting && seconds > 0 && seconds <= 5
  const hasParty = room.premiumTier === 'party'
  const joinUrl = `https://partypaths.com/?join=${room.code}`

  useEffect(() => {
    const app = document.querySelector('.app')
    app?.classList.toggle('tv', tvMode)
    if (tvMode) {
      void document.documentElement.requestFullscreen?.().catch(() => null)
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => null)
    }
    return () => {
      app?.classList.remove('tv')
    }
  }, [tvMode])

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setTvMode(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    if (tense) vibe([30, 40, 30])
  }, [tense, seconds])

  useEffect(() => {
    if (resolving && room.lastResolve?.heroBanner) vibe([40, 30, 60])
  }, [resolving, room.lastResolve?.heroBanner])

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

  async function onStart(mode: AdventureMode = 'story') {
    setBusy(true)
    setError(null)
    try {
      const res = await startAdventure(mode)
      if (!res.ok) setError(res.error || ui.needClasses)
      else if (res.room) {
        vibe(20)
        setRoom(res.room)
      }
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onVote(choiceId: string) {
    setBusy(true)
    setError(null)
    vibe(12)
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
      else if (res.room) {
        vibe([20, 30, 40])
        setRoom(res.room)
      }
    } finally {
      setBusy(false)
    }
  }

  async function onRematch(mode: AdventureMode = 'story') {
    setBusy(true)
    try {
      const res = await rematch(mode)
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } finally {
      setBusy(false)
    }
  }

  async function onPauseToggle() {
    setBusy(true)
    try {
      const res = paused ? await resumeAdventure() : await pauseAdventure()
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } finally {
      setBusy(false)
    }
  }

  async function onSendDm(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await setDmNote(dmDraft)
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) {
        setRoom(res.room)
        setDmDraft('')
      }
    } finally {
      setBusy(false)
    }
  }

  async function onClearDm() {
    const res = await setDmNote('')
    if (res.ok && res.room) setRoom(res.room)
  }

  async function onShare() {
    setShareMsg(ui.sharing)
    const blob = await renderEndingCard({
      title: room.title,
      ending: room.narrative,
      players: room.players.map((p) => {
        const cls = room.classes.find((c) => c.id === p.classId)
        return cls ? `${p.name} (${cls.name})` : p.name
      }),
      code: room.code,
      modeLabel: modeLabel(room.adventureMode || 'story', ui),
    })
    if (!blob) {
      setShareMsg(ui.error)
      return
    }
    const file = new File([blob], `partypaths-${room.code}.png`, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Party Paths',
          text: `${room.title} — ${ui.joinUrl}`,
        })
        setShareMsg(ui.shareSaved)
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
        setShareMsg(ui.shareSaved)
      }
    } catch {
      setShareMsg(null)
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

  function ModeButtons({
    onPickMode,
  }: {
    onPickMode: (mode: AdventureMode) => void
  }) {
    return (
      <div className="mode-grid">
        {(
          [
            ['story', ui.modeStory],
            ['orcs', ui.modeOrcs],
            ['dragon', hasParty ? ui.modeDragon : ui.modeDragonLocked],
            ['chaos', ui.modeChaos],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className="btn btn-ghost"
            disabled={busy || (mode === 'dragon' && !hasParty)}
            onClick={() => onPickMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="panel">
      {showQr && (
        <div className="qr-overlay" role="dialog" aria-label={ui.showQr}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(joinUrl)}`}
            alt={`QR ${room.code}`}
          />
          <div className="code-big">{room.code}</div>
          <p className="muted">{ui.joinUrl}</p>
          <button type="button" className="btn" onClick={() => setShowQr(false)}>
            {ui.hideQr}
          </button>
        </div>
      )}

      <div className="tv-chrome">
        <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
          <div>
            <span className="muted">{ui.code}</span>
            <div className="code-big">{room.code}</div>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setTvMode((v) => !v)}
            >
              {tvMode ? ui.tvExit : ui.tvMode}
            </button>
            <button type="button" className="btn btn-ghost btn-small hide-on-tv" onClick={copyCode}>
              {copied ? ui.copied : ui.copy}
            </button>
            <button type="button" className="btn btn-ghost btn-small hide-on-tv" onClick={leave}>
              {ui.leave}
            </button>
          </div>
        </div>
      </div>

      <p className="muted hide-on-tv shareHint-hide">{ui.shareHint}</p>
      <p className="muted hide-on-tv">{hasParty ? ui.partyTier : ui.freeTier}</p>

      {inLobby && tvMode && (
        <div className="tv-only tv-lobby-qr">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(joinUrl)}`}
            alt={`QR ${room.code}`}
          />
          <div>
            <p className="scene-title" style={{ margin: 0 }}>
              {ui.joinOnPhone}
            </p>
            <p className="muted" style={{ fontSize: '1.25rem' }}>
              partypaths.com · {room.code}
            </p>
            <p className="muted">
              {classesReady}/{classesNeeded} {ui.readyCount}
            </p>
          </div>
        </div>
      )}

      <h3 className="hide-on-tv" style={{ marginBottom: 0 }}>
        {ui.players}
      </h3>
      <ul className="player-list hide-on-tv">
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
      <div className="chip-row tv-only">
        {room.players.map((p) => {
          const cls = room.classes.find((c) => c.id === p.classId)
          return (
            <span
              key={p.id}
              className={`chip${p.connected ? '' : ' offline'}${p.id === playerId ? ' me' : ''}`}
            >
              {p.name}
              {cls ? ` · ${cls.name}` : ''}
            </span>
          )
        })}
      </div>

      {isHost && (
        <div className="host-tools">
          <div className="row">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowQr(true)}>
              {ui.showQr}
            </button>
            {(voting || resolving || paused) && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy}
                onClick={() => void onPauseToggle()}
              >
                {paused ? ui.resume : ui.pause}
              </button>
            )}
          </div>
          {(voting || paused) && (
            <form onSubmit={(e) => void onSendDm(e)}>
              <label className="muted">{ui.dmNote}</label>
              <textarea
                value={dmDraft}
                onChange={(e) => setDmDraft(e.target.value)}
                placeholder={ui.dmPlaceholder}
                maxLength={280}
              />
              <div className="row">
                <button type="submit" className="btn btn-small" disabled={busy || !dmDraft.trim()}>
                  {ui.sendDm}
                </button>
                {room.dmNote && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => void onClearDm()}
                  >
                    {ui.clearDm}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {inLobby && (
        <>
          <h2 className="scene-title" style={{ marginTop: '1.25rem' }}>
            {ui.pickClass}
          </h2>
          {!me?.classId && <div className="player-hint">{ui.pickClassHint}</div>}
          {me?.classId && !isHost && <div className="player-hint ok">{ui.classReadyWait}</div>}
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
            <>
              <p className="muted" style={{ marginTop: '1rem' }}>
                {ui.modes} · {classesReady}/{classesNeeded} {ui.readyCount}
              </p>
              <ModeButtons onPickMode={(mode) => void onStart(mode)} />
            </>
          ) : (
            me?.classId && <p className="muted">{ui.waitingHost}</p>
          )}
        </>
      )}

      {paused && <div className="paused-banner">{ui.paused}</div>}
      {room.dmNote && <div className="dm-banner">{room.dmNote}</div>}

      {(voting || resolving || finished || paused) && !inLobby && (
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

          {room.lastResolve?.heroBanner && (resolving || finished) && (
            <div className="hero-banner">{room.lastResolve.heroBanner}</div>
          )}

          {(resolving || finished) && room.lastResolve && (
            <div className="resolve-box">
              <strong>{ui.winning}:</strong> {room.lastResolve.winningText}
              {room.lastResolve.closeRace && (
                <span className="close-race"> · {ui.closeRace}</span>
              )}
              {room.lastResolve.combatLog && <p>{room.lastResolve.combatLog}</p>}
              {room.lastResolve.voteReveal && room.lastResolve.voteReveal.length > 0 && (
                <ul className="vote-reveal">
                  {room.lastResolve.voteReveal.map((v) => (
                    <li key={v.playerId}>
                      <strong>{v.playerName}</strong> {ui.votedFor} {v.choiceText}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {voting && (
            <>
              {!room.yourVote ? (
                <div className="player-hint">{ui.tapToVote}</div>
              ) : (
                <div className="player-hint ok">
                  {ui.youVoted}: {yourChoiceText} · {ui.waitingOthers}
                  <div className="muted" style={{ fontWeight: 500, marginTop: '0.25rem' }}>
                    {ui.changeVote}
                  </div>
                </div>
              )}
              <p className="muted">
                <span className={`timer${tense ? ' tense' : ''}`}>
                  {seconds}
                  {ui.seconds}
                </span>
                {tense && <span className="close-race"> {ui.tense}</span>}
                {closeRaceLive && <span className="close-race"> · {ui.closeRace}</span>}
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

          {finished && (
            <>
              <div className="cta-row">
                <button type="button" className="btn" disabled={busy} onClick={() => void onShare()}>
                  {ui.shareCard}
                </button>
              </div>
              {shareMsg && <p className="muted">{shareMsg}</p>}
              {isHost && (
                <>
                  <p className="muted" style={{ marginTop: '1rem' }}>
                    {ui.modes}
                  </p>
                  <ModeButtons onPickMode={(mode) => void onRematch(mode)} />
                </>
              )}
            </>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      {!hasParty && isHost && (
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
