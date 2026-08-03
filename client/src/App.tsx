import { useEffect, useState } from 'react'
import {
  applyPartyToken,
  advanceReveal,
  backToLobby,
  claimPartySession,
  clearSession,
  createGame,
  endParty,
  fetchPartyInfo,
  fetchPublicLobbies,
  fetchRoomPreview,
  joinGame,
  loadPartyPass,
  loadSession,
  nextRound,
  redeemParty,
  rejoinGame,
  savePartyPass,
  saveSession,
  setLanguage as setRoomLanguage,
  setPublicLobby,
  setRoomHandler,
  startCheckout,
  startGame,
  submitEmojis,
  submitGuess,
  subscribeConnection,
  type ConnState,
  type PublicLobbyCard,
  type RoomPreview,
  voteFunny,
} from './api'
import { loadLanguage, rememberLanguage, t } from './i18n'
import { JoinQr } from './qr'
import type { Lang, PartyInfo, PartyPassLocal, PublicRoom } from './types'

const FACTOPIA_URL = 'https://factopia.net'
const SABOTEXT_URL = 'https://sabotext.com'

function SisterGameLink({
  name,
  href,
  pitch,
  cta,
  compact,
}: {
  name: string
  href: string
  pitch: string
  cta: string
  compact?: boolean
}) {
  return (
    <a
      className={`sister-game${compact ? ' compact' : ''}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <strong>{name}</strong>
      <span>{pitch}</span>
      <em>{cta}</em>
    </a>
  )
}

function SisterGameLinks({ ui, compact }: { ui: ReturnType<typeof t>; compact?: boolean }) {
  return (
    <div className={`sister-games${compact ? ' compact' : ''}`}>
      <SisterGameLink
        name="Factopia"
        href={FACTOPIA_URL}
        pitch={ui.factopiaPitch}
        cta={ui.factopiaCta}
        compact={compact}
      />
      <SisterGameLink
        name="Sabotext"
        href={SABOTEXT_URL}
        pitch={ui.sabotextPitch}
        cta={ui.sabotextCta}
        compact={compact}
      />
    </div>
  )
}

function ConnBadge({ conn, ui }: { conn: ConnState; ui: ReturnType<typeof t> }) {
  if (conn === 'connected') return null
  return (
    <div className={`conn-badge ${conn}`}>
      {conn === 'connecting' ? ui.reconnecting : ui.disconnected}
    </div>
  )
}

export default function App() {
  const [uiLang, setUiLang] = useState<Lang>(() => loadLanguage())
  const ui = t(uiLang)
  const [screen, setScreen] = useState<'home' | 'create' | 'join' | 'find' | 'play'>('home')
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinStep, setJoinStep] = useState<'code' | 'name'>('code')
  const [joinPreview, setJoinPreview] = useState<RoomPreview | null>(null)
  const [createPublic, setCreatePublic] = useState(false)
  const [lobbies, setLobbies] = useState<PublicLobbyCard[]>([])
  const [lobbiesBusy, setLobbiesBusy] = useState(false)
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
  const [conn, setConn] = useState<ConnState>('connecting')

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

  useEffect(() => subscribeConnection(setConn), [])

  useEffect(() => {
    if (room?.notice) setBanner(room.notice)
  }, [room?.notice])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const join = params.get('join')
    if (join && /^[A-Z]{4}$/i.test(join)) {
      setJoinCode(join.toUpperCase())
      setJoinStep('code')
      setJoinPreview(null)
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
        if (res.ok && res.room && res.playerId) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (screen !== 'find') return
    let cancelled = false
    async function load() {
      setLobbiesBusy(true)
      try {
        const list = await fetchPublicLobbies(uiLang)
        if (!cancelled) setLobbies(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : ui.error)
      } finally {
        if (!cancelled) setLobbiesBusy(false)
      }
    }
    void load()
    const id = setInterval(() => void load(), 8000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [screen, uiLang, ui.error])

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
      if (res.url) window.location.href = res.url
      else setError(res.error || ui.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await createGame(name, uiLang, partyPass?.token, createPublic && hasParty)
      if (!res.ok) {
        setError(res.error)
        return
      }
      saveSession({ code: res.room.code, playerId: res.playerId, name })
      setRoom(res.room)
      setPlayerId(res.playerId)
      setScreen('play')
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onPreviewJoin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const preview = await fetchRoomPreview(joinCode)
      setJoinPreview(preview)
      setJoinStep('name')
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await joinGame(joinCode, name)
      if (!res.ok) {
        setError(res.error)
        return
      }
      saveSession({ code: res.room.code, playerId: res.playerId, name })
      setRoom(res.room)
      setPlayerId(res.playerId)
      setScreen('play')
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error)
    } finally {
      setBusy(false)
    }
  }

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await redeemParty(promo)
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
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
  }

  function openJoin(code?: string) {
    setJoinCode(code ?? '')
    setJoinStep('code')
    setJoinPreview(null)
    setScreen('join')
  }

  return (
    <div className="app">
      <div className="blobs" aria-hidden="true">
        <div className="blob blob-a" />
        <div className="blob blob-b" />
        <div className="blob blob-c" />
      </div>
      <ConnBadge conn={conn} ui={ui} />
      <header className="topbar">
        <button type="button" className="brand" onClick={() => (room ? null : setScreen('home'))}>
          {ui.brand}
        </button>
        <div className="row">
          <button
            type="button"
            className={`btn btn-ghost btn-small${uiLang === 'sv' ? ' selected-mode' : ''}`}
            onClick={() => setUiLang('sv')}
          >
            SV
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-small${uiLang === 'en' ? ' selected-mode' : ''}`}
            onClick={() => setUiLang('en')}
          >
            EN
          </button>
        </div>
      </header>

      {banner && (
        <div className="banner" role="status">
          {banner}
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setBanner(null)}>
            ×
          </button>
        </div>
      )}

      {screen === 'home' && (
        <div className="panel hero">
          <div className="emoji-trail" aria-hidden="true">
            <span>🔥</span>
            <span>🍕</span>
            <span>🚀</span>
            <span>👻</span>
            <span>🎉</span>
          </div>
          <h1 className="logo">{ui.brand}</h1>
          <p className="tagline">{ui.tagline}</p>
          <p className="support">{ui.heroSupport}</p>
          <div className="cta-row">
            <button type="button" className="btn" onClick={() => setScreen('create')}>
              {ui.create}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openJoin()}>
              {ui.join}
            </button>
            <button type="button" className="btn btn-ghost btn-accent" onClick={() => setScreen('find')}>
              {ui.findGame}
            </button>
          </div>
          <SisterGameLinks ui={ui} />
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
              <label className="muted row" style={{ marginTop: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={firstTime}
                  onChange={(e) => setFirstTime(e.target.checked)}
                />
                {ui.firstTime}
              </label>
            </div>
          )}
          {hasParty && partyPass && (
            <p className="muted">
              {ui.partyActive} {ui.partyUntil}{' '}
              {new Date(partyPass.expiresAt).toLocaleString(uiLang === 'en' ? 'en' : 'sv')}
            </p>
          )}
        </div>
      )}

      {screen === 'create' && (
        <form className="panel" onSubmit={(e) => void onCreate(e)}>
          <h2>{ui.create}</h2>
          <label>
            {ui.yourName}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
          </label>
          {hasParty ? (
            <label className="row" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                checked={createPublic}
                onChange={(e) => setCreatePublic(e.target.checked)}
              />
              {ui.createPublic}
            </label>
          ) : (
            <p className="muted">{ui.createPublicNeedParty}</p>
          )}
          <div className="cta-row">
            <button type="submit" className="btn" disabled={busy}>
              {ui.start}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setScreen('home')}>
              {ui.back}
            </button>
          </div>
        </form>
      )}

      {screen === 'join' && joinStep === 'code' && (
        <form className="panel" onSubmit={(e) => void onPreviewJoin(e)}>
          <h2>{ui.join}</h2>
          <label>
            {ui.roomCode}
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              required
            />
          </label>
          <div className="cta-row">
            <button type="submit" className="btn" disabled={busy || joinCode.length < 4}>
              {ui.continueJoin}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setScreen('home')}>
              {ui.back}
            </button>
          </div>
        </form>
      )}

      {screen === 'join' && joinStep === 'name' && (
        <form className="panel" onSubmit={(e) => void onJoin(e)}>
          <h2>{ui.join}</h2>
          {joinPreview && (
            <p className="muted">
              {joinPreview.code} · {joinPreview.playerCount} {ui.previewPlayers} ·{' '}
              {joinPreview.hostName}
            </p>
          )}
          <label>
            {ui.yourName}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
          </label>
          <div className="cta-row">
            <button type="submit" className="btn" disabled={busy}>
              {ui.join}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setJoinStep('code')
                setJoinPreview(null)
              }}
            >
              {ui.back}
            </button>
          </div>
        </form>
      )}

      {screen === 'find' && (
        <div className="panel">
          <h2>{ui.findGame}</h2>
          {lobbiesBusy && lobbies.length === 0 && <p className="muted">{ui.findBusy}</p>}
          {!lobbiesBusy && lobbies.length === 0 && <p className="muted">{ui.findEmpty}</p>}
          <ul className="lobby-list">
            {lobbies.map((l) => (
              <li key={l.code}>
                <button type="button" className="btn btn-ghost" onClick={() => openJoin(l.code)}>
                  <strong>{l.code}</strong>
                  <span className="muted">
                    {l.hostName} · {l.playerCount} {ui.previewPlayers}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('home')}>
            {ui.back}
          </button>
        </div>
      )}

      {screen === 'play' && room && playerId && (
        <PlayView
          room={room}
          playerId={playerId}
          uiLang={uiLang}
          setUiLang={setUiLang}
          setRoom={setRoom}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          copied={copied}
          setCopied={setCopied}
          leave={leave}
          hasParty={hasParty}
          partyInfo={partyInfo}
          checkout={checkout}
          promo={promo}
          setPromo={setPromo}
          onRedeem={onRedeem}
          firstTime={firstTime}
          setFirstTime={setFirstTime}
        />
      )}

      {error && screen !== 'play' && <p className="error">{error}</p>}
    </div>
  )
}

function PlayView({
  room,
  playerId,
  uiLang,
  setUiLang,
  setRoom,
  busy,
  setBusy,
  error,
  setError,
  copied,
  setCopied,
  leave,
  hasParty,
  partyInfo,
  checkout,
  promo,
  setPromo,
  onRedeem,
  firstTime,
  setFirstTime,
}: {
  room: PublicRoom
  playerId: string
  uiLang: Lang
  setUiLang: (l: Lang) => void
  setRoom: (r: PublicRoom) => void
  busy: boolean
  setBusy: (b: boolean) => void
  error: string | null
  setError: (e: string | null) => void
  copied: boolean
  setCopied: (v: boolean) => void
  leave: () => void
  hasParty: boolean
  partyInfo: PartyInfo | null
  checkout: (plan: 'day' | 'week') => Promise<void>
  promo: string
  setPromo: (v: string) => void
  onRedeem: (e: React.FormEvent) => Promise<void>
  firstTime: boolean
  setFirstTime: (v: boolean) => void
}) {
  const ui = t(room.language || uiLang)
  const isHost = room.hostId === playerId
  const [showQr, setShowQr] = useState(false)
  const [tvMode, setTvMode] = useState(false)
  const [emojiDraft, setEmojiDraft] = useState('')
  const [guessDraft, setGuessDraft] = useState('')
  const joinUrl = `https://partypaths.com/?join=${room.code}`
  const inLobby = room.status === 'lobby'
  const activeCount = room.players.filter(
    (p) => p.connected && !p.spectator && p.id !== room.hostId,
  ).length
  const isHostOnly = isHost
  const canPlay = !room.youAreSpectator && !isHostOnly

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
    setEmojiDraft('')
    setGuessDraft('')
  }, [room.status, room.hopIndex, room.roundIndex])

  async function copyCode() {
    await navigator.clipboard.writeText(room.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function copyJoinLink() {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; room?: PublicRoom }>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fn()
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } catch {
      setError(ui.error)
    } finally {
      setBusy(false)
    }
  }

  function phaseTitle() {
    switch (room.status) {
      case 'emoji':
        return ui.phaseEmoji
      case 'guess':
        return ui.phaseGuess
      case 'reveal':
        return ui.phaseReveal
      case 'funny_vote':
        return ui.phaseFunny
      case 'scoreboard':
        return ui.phaseScore
      case 'finished':
        return ui.phaseFinished
      default:
        return ui.lobby
    }
  }

  return (
    <div className="panel">
      {showQr && (
        <div className="qr-overlay" role="dialog" aria-label={ui.showQr}>
          <JoinQr url={joinUrl} size={320} alt={`QR ${room.code}`} />
          <div className="code-big">{room.code}</div>
          <p className="muted">{ui.joinUrl}</p>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void copyJoinLink()}>
            {copied ? ui.copied : ui.copyLink}
          </button>
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
            <button type="button" className="btn btn-small" onClick={() => setTvMode((v) => !v)}>
              {tvMode ? ui.tvExit : ui.tvMode}
            </button>
            <button type="button" className="btn btn-ghost btn-small hide-on-tv" onClick={() => void copyCode()}>
              {copied ? ui.copied : ui.copy}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small hide-on-tv"
              onClick={() => void copyJoinLink()}
            >
              {ui.copyLink}
            </button>
            <button type="button" className="btn btn-ghost btn-small hide-on-tv" onClick={leave}>
              {ui.leave}
            </button>
          </div>
        </div>
      </div>

      <p className="muted hide-on-tv">{ui.shareHint}</p>
      <p className="muted hide-on-tv">{hasParty ? ui.partyTier : ui.freeTier}</p>
      {room.youAreSpectator && <div className="player-hint">{ui.spectatorHint}</div>}
      {isHost && <div className="player-hint ok hide-on-tv">{ui.hostHint}</div>}

      {inLobby && tvMode && (
        <div className="tv-only tv-lobby-qr">
          <JoinQr url={joinUrl} size={280} alt={`QR ${room.code}`} />
          <div>
            <p className="scene-title" style={{ margin: 0 }}>
              {ui.joinOnPhone}
            </p>
            <p className="muted" style={{ fontSize: '1.25rem' }}>
              partypaths.com · {room.code}
            </p>
          </div>
        </div>
      )}

      <h3 className="hide-on-tv" style={{ marginBottom: 0 }}>
        {ui.players}
      </h3>
      <ul className="player-list hide-on-tv">
        {room.players.map((p) => (
          <li key={p.id} className={p.connected ? undefined : 'offline'}>
            <span>
              {p.name}
              {p.id === room.hostId ? ` · ${ui.host}` : ''}
              {p.spectator ? ` · ${ui.spectator}` : ''}
            </span>
            <span className="muted">{p.connected ? '●' : '○'}</span>
          </li>
        ))}
      </ul>
      {room.waitlist.length > 0 && (
        <div className="waitlist hide-on-tv">
          <h3 style={{ marginBottom: 0 }}>{ui.waitlist}</h3>
          <ul className="player-list">
            {room.waitlist.map((w) => (
              <li key={w.id}>
                <span>{w.name}</span>
                <span className="muted">○</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="chip-row tv-only">
        {room.players.map((p) => (
          <span
            key={p.id}
            className={`chip${p.connected ? '' : ' offline'}${p.id === playerId ? ' me' : ''}`}
          >
            {p.name}
            {p.spectator ? ` · ${ui.spectator}` : ''}
          </span>
        ))}
      </div>

      {isHost && (
        <div className="host-tools hide-on-tv">
          <div className="row">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowQr(true)}>
              {ui.showQr}
            </button>
          </div>
        </div>
      )}

      {inLobby && (
        <>
          <div className="player-hint ok hide-on-tv" style={{ whiteSpace: 'pre-line' }}>
            <strong>{ui.howTo}</strong>
            {'\n'}
            {ui.howToBody}
          </div>
          {isHost && (
            <>
              <p className="muted">{ui.openLobby}</p>
              {hasParty ? (
                <div className="mode-grid" style={{ marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className={`btn btn-ghost${!room.isPublic ? ' selected-mode' : ''}`}
                    disabled={busy}
                    onClick={() => void run(() => setPublicLobby(false))}
                  >
                    {ui.openLobbyOff}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-ghost${room.isPublic ? ' selected-mode' : ''}`}
                    disabled={busy}
                    onClick={() => void run(() => setPublicLobby(true))}
                  >
                    {ui.openLobbyOn}
                  </button>
                </div>
              ) : (
                <p className="muted">{ui.openLobbyNeedParty}</p>
              )}
              <div className="row" style={{ marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  className={`btn btn-ghost btn-small${room.language === 'sv' ? ' selected-mode' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setUiLang('sv')
                    void run(() => setRoomLanguage('sv'))
                  }}
                >
                  SV
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-small${room.language === 'en' ? ' selected-mode' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setUiLang('en')
                    void run(() => setRoomLanguage('en'))
                  }}
                >
                  EN
                </button>
              </div>
              {activeCount < 3 && <p className="muted">{ui.needPlayers}</p>}
              <button
                type="button"
                className="btn"
                disabled={busy || activeCount < 3}
                onClick={() => void run(() => startGame())}
              >
                {ui.startGame}
              </button>
            </>
          )}
          {!isHost && <p className="muted">{ui.waitingHost}</p>}
        </>
      )}

      {!inLobby && (
        <>
          <p className="muted" style={{ marginTop: '1rem' }}>
            {ui.roundOf} {room.roundIndex}/{room.maxRounds}
            {(room.status === 'emoji' || room.status === 'guess') && (
              <>
                {' · '}
                {ui.hopOf} {room.hopIndex + 1}/{room.hopCount}
              </>
            )}
          </p>
          <h2 className="scene-title">{phaseTitle()}</h2>
          {(room.status === 'emoji' || room.status === 'guess' || room.status === 'funny_vote') && (
            <p className="muted">
              {room.submittedCount}/{room.submitterCount} {ui.submitted}
              {' · '}
              {ui.waitingAll}
            </p>
          )}

          {room.status === 'emoji' && canPlay && room.yourMeaning && (
            <div className="hide-on-tv">
              <p className="muted">{ui.yourWord}</p>
              <h3 className="scene-title" style={{ fontSize: '2rem' }}>
                {room.yourMeaning}
              </h3>
              <p className="muted">{ui.explainWithEmoji}</p>
              <input
                value={emojiDraft}
                onChange={(e) => setEmojiDraft(e.target.value)}
                placeholder={ui.emojiPlaceholder}
                inputMode="text"
                autoComplete="off"
                style={{ fontSize: '1.8rem', textAlign: 'center' }}
              />
              <div className="cta-row">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !emojiDraft.trim()}
                  onClick={() => void run(() => submitEmojis(emojiDraft))}
                >
                  {ui.submitEmojis}
                </button>
              </div>
              {room.youSubmitted && <div className="player-hint ok">{ui.youSubmitted}</div>}
            </div>
          )}

          {room.status === 'guess' && canPlay && room.yourPromptEmojis && (
            <div className="hide-on-tv">
              <p className="muted">{ui.guessTheWord}</p>
              <div className="emoji-prompt">{room.yourPromptEmojis}</div>
              <input
                value={guessDraft}
                onChange={(e) => setGuessDraft(e.target.value)}
                placeholder={ui.guessPlaceholder}
                maxLength={48}
                autoComplete="off"
              />
              <div className="cta-row">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !guessDraft.trim()}
                  onClick={() => void run(() => submitGuess(guessDraft))}
                >
                  {ui.submitGuess}
                </button>
              </div>
              {room.youSubmitted && <div className="player-hint ok">{ui.youSubmitted}</div>}
            </div>
          )}

          {(room.status === 'emoji' || room.status === 'guess') && tvMode && (
            <div className="tv-only">
              <p className="scene-body">
                {room.submittedCount}/{room.submitterCount} {ui.submitted}
              </p>
            </div>
          )}

          {room.paths &&
            (room.status === 'reveal' ||
              room.status === 'funny_vote' ||
              room.status === 'scoreboard' ||
              room.status === 'finished') && (
              <div className="path-grid">
                {room.paths.map((path) => (
                  <div
                    key={path.id}
                    className={`path-card${room.yourFunnyVote === path.id ? ' selected' : ''}`}
                  >
                    <div className="muted">
                      {path.originName} · {ui.seedWord}: <strong>{path.seedWord}</strong>
                      {room.funnyVotes?.[path.id] ? ` · ${room.funnyVotes[path.id]}` : ''}
                    </div>
                    <ol className="path-steps">
                      {path.steps.map((s, i) => (
                        <li key={`${path.id}-${i}`}>
                          <span className="emoji-prompt small">{s.emojis || '❓'}</span>
                          <span>
                            {s.guesserName}: {s.guess}{' '}
                            <em className={s.correct ? 'ok' : 'bad'}>
                              ({s.correct ? ui.correct : ui.wrong}
                              {!s.correct ? ` ← ${s.meaning}` : ''})
                            </em>
                          </span>
                        </li>
                      ))}
                    </ol>
                    {room.status === 'funny_vote' &&
                      canPlay &&
                      path.originPlayerId !== playerId && (
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={busy}
                          onClick={() => void run(() => voteFunny(path.id))}
                        >
                          {ui.voteFunny}
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}

          {room.status === 'reveal' && isHost && (
            <div className="cta-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void run(() => advanceReveal())}
              >
                {ui.continueFunny}
              </button>
            </div>
          )}

          {room.status === 'funny_vote' && canPlay && (
            <p className="muted hide-on-tv">{ui.voteFunnyHint}</p>
          )}

          {(room.status === 'scoreboard' || room.status === 'finished') && (
            <>
              <h3>{ui.scores}</h3>
              <p className="muted">{ui.pointsHint}</p>
              <ul className="player-list">
                {room.scores.map((s) => (
                  <li key={s.playerId}>
                    <span>{s.name}</span>
                    <strong>{s.score}</strong>
                  </li>
                ))}
              </ul>
              {isHost && room.status === 'scoreboard' && (
                <div className="cta-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || room.roundIndex >= room.maxRounds}
                    onClick={() => void run(() => nextRound())}
                  >
                    {ui.nextRound}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void run(() => endParty())}
                  >
                    {ui.endParty}
                  </button>
                </div>
              )}
              {isHost && room.status === 'finished' && (
                <div className="cta-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void run(() => backToLobby())}
                  >
                    {ui.backToLobby}
                  </button>
                </div>
              )}
              <SisterGameLinks ui={ui} compact />
            </>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      {!hasParty && isHost && (
        <div className="party-box hide-on-tv">
          <p className="muted">{ui.partyBlurb}</p>
          <div className="cta-row">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || partyInfo?.enabled === false}
              onClick={() => void checkout('day')}
            >
              {ui.unlockParty}
            </button>
          </div>
          <form onSubmit={(e) => void onRedeem(e)} className="row" style={{ marginTop: '0.75rem' }}>
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder={ui.redeemCode}
            />
            <button type="submit" className="btn btn-ghost btn-small" disabled={busy}>
              {ui.redeem}
            </button>
          </form>
          <label className="muted row">
            <input
              type="checkbox"
              checked={firstTime}
              onChange={(e) => setFirstTime(e.target.checked)}
            />
            {ui.firstTime}
          </label>
        </div>
      )}
    </div>
  )
}
