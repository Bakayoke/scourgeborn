import { useEffect, useRef, useState } from 'react'
import {
  applyPartyToken,
  backToLobby,
  castVote,
  claimPartySession,
  clearSession,
  continueTurn,
  createGame,
  endParty,
  ensureSessionBound,
  fetchPartyInfo,
  fetchHealth,
  fetchPublicLobbies,
  fetchRoomPreview,
  joinGame,
  loadPartyPass,
  loadSession,
  redeemParty,
  rejoinGame,
  savePartyPass,
  saveSession,
  setLanguage as setRoomLanguage,
  setPublicLobby,
  setRoomHandler,
  startCheckout,
  startGame,
  subscribeConnection,
  type ConnState,
  type PublicLobbyCard,
  type RoomPreview,
} from './api'
import { loadLanguage, REGION_LABELS, rememberLanguage, t } from './i18n'
import { JoinQr } from './qr'
import type {
  Lang,
  LiveEvent,
  MapRegion,
  PartyInfo,
  PartyPassLocal,
  PublicRoom,
  RegionId,
} from './types'

const FACTOPIA_URL = 'https://factopia.net'
const SABOTEXT_URL = 'https://sabotext.com'
const PARTYPATHS_URL = 'https://partypaths.com'
const APP_ORIGIN = 'https://scourgeborn.com'

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
        name="Party Paths"
        href={PARTYPATHS_URL}
        pitch={ui.partypathsPitch}
        cta={ui.partypathsCta}
        compact={compact}
      />
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

function regionName(id: RegionId, lang: Lang) {
  return REGION_LABELS[id][lang]
}

function usePhaseSecondsLeft(endsAt: number) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!endsAt) {
      setLeft(0)
      return
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [endsAt])
  return left
}

function eventText(ev: LiveEvent, lang: Lang) {
  return lang === 'en' ? ev.textEn : ev.textSv
}

function LiveEventTicker({
  events,
  lang,
  label,
}: {
  events: LiveEvent[]
  lang: Lang
  label: string
}) {
  const list = (events ?? []).slice(0, 6)
  if (list.length === 0) return null
  return (
    <div className="live-ticker" aria-live="polite">
      <span className="live-ticker-label">{label}</span>
      <ul>
        {list.map((ev) => (
          <li key={ev.id} className={`live-item kind-${ev.kind}`}>
            <span>{eventText(ev, lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorldMap({
  regions,
  lang,
  focusRegionId,
  selectable,
  selectedId,
  quarantineLabel,
  onSelect,
}: {
  regions: MapRegion[]
  lang: Lang
  focusRegionId?: RegionId | null
  selectable?: boolean
  selectedId?: string | null
  quarantineLabel: string
  onSelect?: (id: RegionId) => void
}) {
  const prevInfection = useRef<Partial<Record<RegionId, number>>>({})
  const [fx, setFx] = useState<
    Partial<Record<RegionId, { delta: number; mode: 'seeping' | 'healing' }>>
  >({})

  useEffect(() => {
    const changed: RegionId[] = []
    const nextFx: typeof fx = {}
    for (const r of regions) {
      const prev = prevInfection.current[r.id]
      if (prev !== undefined && r.infection !== prev) {
        changed.push(r.id)
        nextFx[r.id] = {
          delta: r.infection - prev,
          mode: r.infection > prev ? 'seeping' : 'healing',
        }
      }
      prevInfection.current[r.id] = r.infection
    }
    if (changed.length === 0) return
    setFx((s) => ({ ...s, ...nextFx }))
    const t = window.setTimeout(() => {
      setFx((s) => {
        const copy = { ...s }
        for (const id of changed) delete copy[id]
        return copy
      })
    }, 1400)
    return () => window.clearTimeout(t)
  }, [regions])

  return (
    <div className="world-map geo" aria-label="map">
      {regions.map((r) => {
        const isFocus = focusRegionId === r.id
        const isSelected = selectedId === r.id
        const pulse = fx[r.id]
        const className = `region-tile region-${r.id}${r.quarantined ? ' quarantined' : ''}${isFocus ? ' focus' : ''}${isSelected ? ' selected' : ''}${selectable ? ' clickable' : ''}${pulse ? ` ${pulse.mode}` : ''}`
        const style = { ['--infection' as string]: `${r.infection}` }
        const body = (
          <>
            <strong>{regionName(r.id, lang)}</strong>
            <span className="blight-meter">
              <i style={{ width: `${r.infection}%` }} />
            </span>
            <em>{r.infection}%</em>
            {r.quarantined && <small className="quarantine-tag">{quarantineLabel}</small>}
            {pulse && (
              <span className={`delta-badge ${pulse.delta > 0 ? 'up' : 'down'}`}>
                {pulse.delta > 0 ? '+' : ''}
                {pulse.delta}%
              </span>
            )}
          </>
        )
        if (selectable && onSelect) {
          return (
            <button
              key={r.id}
              type="button"
              className={className}
              style={style}
              onClick={() => onSelect(r.id)}
            >
              {body}
            </button>
          )
        }
        return (
          <div key={r.id} className={className} style={style}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

function FinaleOverlay({
  room,
  ui,
  busy,
  onLobby,
  onEnd,
}: {
  room: PublicRoom
  ui: ReturnType<typeof t>
  busy: boolean
  onLobby: () => void
  onEnd: () => void
}) {
  const victory =
    room.outcome === 'victory_cure' ||
    room.outcome === 'victory_heart' ||
    room.outcome === 'victory_contained'
  const title =
    room.outcome === 'victory_cure'
      ? ui.finaleVictoryCureTitle
      : room.outcome === 'victory_heart'
        ? ui.finaleVictoryHeartTitle
        : room.outcome === 'victory_contained'
          ? ui.finaleVictoryContainedTitle
          : ui.finaleDefeatTitleLong
  const subtitle =
    room.outcome === 'victory_cure'
      ? ui.outcomeVictoryCure
      : room.outcome === 'victory_heart'
        ? ui.outcomeVictoryHeart
        : room.outcome === 'victory_contained'
          ? ui.outcomeVictoryContained
          : ui.outcomeDefeatPlague

  return (
    <div className={`finale-overlay ${victory ? 'victory' : 'defeat'} outcome-${room.outcome}`}>
      <div className="finale-card">
        <p className="finale-kicker">{victory ? ui.finaleVictoryTitle : ui.finaleDefeatTitle}</p>
        <h2 className="finale-title">{title}</h2>
        <p className="finale-sub">{subtitle}</p>
        <div className="finale-stats">
          <div>
            <span>{ui.finaleCouncils}</span>
            <strong>{room.turnIndex}</strong>
          </div>
          <div>
            <span>{ui.finaleInfection}</span>
            <strong>{room.worldInfection}%</strong>
          </div>
          <div>
            <span>{ui.finaleCure}</span>
            <strong>{room.cureProgress}%</strong>
          </div>
          <div>
            <span>{ui.finaleHeart}</span>
            <strong>{room.heartHp}</strong>
          </div>
        </div>
        {room.youAreHost && (
          <div className="cta-row finale-cta">
            <button type="button" className="btn" disabled={busy} onClick={onLobby}>
              {ui.backToLobby}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onEnd}>
              {ui.endParty}
            </button>
          </div>
        )}
      </div>
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
    void fetchHealth()
      .then((h) => {
        if (h.persist && !h.persist.configured) {
          setBanner(
            uiLang === 'en'
              ? 'Server has no Redis — rooms vanish on restart. Add REDIS_URL on Railway.'
              : 'Servern saknar Redis — rum försvinner vid omstart. Lägg till REDIS_URL på Railway.',
          )
        }
      })
      .catch(() => null)
  }, [ui.stripeMissing, uiLang])

  useEffect(() => {
    setRoomHandler((r) => setRoom(r))
    return () => setRoomHandler(null)
  }, [])

  useEffect(() => subscribeConnection(setConn), [])

  useEffect(() => {
    if (conn !== 'connected' || screen !== 'play' || !room) return
    const session = loadSession()
    if (!session || session.code !== room.code) return
    let cancelled = false
    void (async () => {
      const res = await ensureSessionBound(4)
      if (cancelled || !res) return
      if (res.ok && res.room) {
        setRoom(res.room)
        if (res.playerId) setPlayerId(res.playerId)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn])

  useEffect(() => {
    if (room?.notice) setBanner(room.notice)
  }, [room?.notice])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const joinParam = params.get('join')
    const joinCodeFromUrl =
      joinParam && /^[A-Z]{4}$/i.test(joinParam) ? joinParam.toUpperCase() : null

    if (joinCodeFromUrl) {
      setJoinCode(joinCodeFromUrl)
      setJoinStep('name')
      setJoinPreview(null)
      setScreen('join')
      window.history.replaceState({}, '', '/')
      void fetchRoomPreview(joinCodeFromUrl)
        .then(setJoinPreview)
        .catch(() => setJoinPreview(null))
    }

    const sessionId = params.get('party_session')
    const cancelled = params.get('party_cancel')
    if (cancelled) {
      setBanner(ui.partyCancel)
      if (!joinCodeFromUrl) window.history.replaceState({}, '', '/')
    }
    if (sessionId) {
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
        if (!joinCodeFromUrl) window.history.replaceState({}, '', '/')
      })()
    }

    if (joinCodeFromUrl) {
      clearSession()
      return
    }

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
        /* stay on home / join */
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
    const code = joinCode.trim().toUpperCase()
    if (!/^[A-Z]{4}$/.test(code)) {
      setError(uiLang === 'en' ? 'Enter the 4-letter code' : 'Ange den fyrabokstavs koden')
      return
    }
    setJoinCode(code)
    setError(null)
    setJoinPreview(null)
    setJoinStep('name')
    void fetchRoomPreview(code)
      .then(setJoinPreview)
      .catch(() => setJoinPreview(null))
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const code = joinCode.trim().toUpperCase()
      const session = loadSession()
      if (session && session.code !== code) clearSession()
      const res = await joinGame(code, name)
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
      if (!res.ok) {
        setError(res.error || ui.error)
        return
      }
      if (res.token && res.expiresAt) {
        const pass = { token: res.token, expiresAt: res.expiresAt }
        savePartyPass(pass)
        setPartyPass(pass)
      }
      if (res.room) setRoom(res.room)
      setPromo('')
      setBanner(ui.partyThanks)
    } catch (err) {
      setError(err instanceof Error ? err.message : ui.error)
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
    const next = (code ?? '').toUpperCase()
    const session = loadSession()
    if (next && session && session.code !== next) clearSession()
    setJoinCode(next)
    setJoinPreview(null)
    setError(null)
    if (next.length === 4) {
      setJoinStep('name')
      void fetchRoomPreview(next)
        .then(setJoinPreview)
        .catch(() => setJoinPreview(null))
    } else {
      setJoinStep('code')
    }
    setScreen('join')
  }

  return (
    <div className="app">
      <div className="mist" aria-hidden="true">
        <div className="mist-layer mist-a" />
        <div className="mist-layer mist-b" />
        <div className="mist-layer mist-c" />
        <div className="spore-field" />
        <div className="hazard-rail" />
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
          <p className="outbreak-stamp" aria-hidden="true">
            {ui.outbreakStamp}
          </p>
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
          <details className="how-to">
            <summary>{ui.howTo}</summary>
            <ol>
              {ui.howToSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="cta-row">
            <button type="submit" className="btn" disabled={joinCode.trim().length < 4}>
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
          {!joinPreview && (
            <p className="muted">
              {joinCode} · {uiLang === 'en' ? 'Enter your name to join' : 'Skriv ditt namn för att gå med'}
            </p>
          )}
          <label>
            {ui.yourName}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="nickname"
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="cta-row">
            <button type="submit" className="btn" disabled={busy || name.trim().length < 1}>
              {busy ? (uiLang === 'en' ? 'Joining…' : 'Ansluter…') : ui.join}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setJoinStep('code')
                setJoinPreview(null)
                setError(null)
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
          uiLang={uiLang}
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
  uiLang,
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
  uiLang: Lang
  setRoom: (r: PublicRoom) => void
  busy: boolean
  setBusy: (b: boolean) => void
  error: string | null
  setError: (e: string | null) => void
  copied: boolean
  setCopied: (c: boolean) => void
  leave: () => void
  hasParty: boolean
  partyInfo: PartyInfo | null
  checkout: (plan: 'day' | 'week') => Promise<void>
  promo: string
  setPromo: (s: string) => void
  onRedeem: (e: React.FormEvent) => Promise<void>
  firstTime: boolean
  setFirstTime: (v: boolean) => void
}) {
  const ui = t(uiLang)
  const [tv, setTv] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const playRef = useRef<HTMLDivElement>(null)
  const joinUrl = `${APP_ORIGIN}/?join=${room.code}`
  const seated = room.players.filter((p) => !p.spectator && p.id !== room.hostId)
  const connectedSeated = seated.filter((p) => p.connected)
  const soloHost = connectedSeated.length === 0
  const canStart = room.youAreHost
  const canVote =
    typeof room.youCanVote === 'boolean'
      ? room.youCanVote && !room.youAreSpectator
      : !room.youAreSpectator && (!room.youAreHost || soloHost)
  const secondsLeft = usePhaseSecondsLeft(
    room.status === 'council' || room.status === 'resolve' ? room.phaseEndsAt : 0,
  )

  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setTv(false)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  async function toggleTv() {
    const el = playRef.current
    if (tv) {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen()
        } catch {
          /* ignore */
        }
      }
      setTv(false)
      return
    }
    setTv(true)
    if (!el) return
    const req =
      el.requestFullscreen?.bind(el) ??
      (
        el as HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void> | void
        }
      ).webkitRequestFullscreen?.bind(el)
    if (!req) return
    try {
      await req()
    } catch {
      /* CSS fixed overlay still applies */
    }
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; room?: PublicRoom }>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fn()
      if (!res.ok) setError(res.error || ui.error)
      else if (res.room) setRoom(res.room)
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.error)
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

  function copyLink() {
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const phaseTitle =
    room.status === 'lobby'
      ? ui.lobby
      : room.status === 'council'
        ? ui.phaseCouncil
        : room.status === 'resolve'
          ? ui.phaseResolve
          : ui.phaseFinished

  const playClass = `play${tv ? ' tv' : ''}${tv && canVote ? ' tv-interactive' : ''}${
    room.status === 'finished' ? ' finale-active' : ''
  }`

  return (
    <div ref={playRef} className={playClass}>
      {room.status === 'finished' && (
        <FinaleOverlay
          room={room}
          ui={ui}
          busy={busy}
          onLobby={() => void run(() => backToLobby())}
          onEnd={() => void run(() => endParty())}
        />
      )}

      <div className="play-top">
        <div>
          <p className="phase-label">
            {phaseTitle}
            {secondsLeft > 0 && (
              <span className={`phase-timer${secondsLeft <= 5 ? ' urgent' : ''}`}>
                {secondsLeft} {ui.timerLeft}
              </span>
            )}
          </p>
          {room.status !== 'lobby' && (
            <p className="muted">
              {ui.turnOf} {room.turnIndex}
              {room.maxRounds > 0 ? ` / ${room.maxRounds}` : ''}
            </p>
          )}
        </div>
        <div className="row wrap">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void toggleTv()}>
            {tv ? ui.tvExit : ui.tvMode}
          </button>
          {!tv && (
            <button type="button" className="btn btn-ghost btn-small" onClick={leave}>
              {ui.leave}
            </button>
          )}
        </div>
      </div>

      {room.status !== 'lobby' && (
        <div className="meters">
          <div className="meter">
            <span>{ui.resourcePoints}</span>
            <strong>{room.resourcePoints}</strong>
          </div>
          <div className="meter danger">
            <span>{ui.worldInfection}</span>
            <strong>{room.worldInfection}%</strong>
          </div>
          <div className="meter">
            <span>{ui.cureProgress}</span>
            <strong>{room.cureProgress}%</strong>
          </div>
          <div className="meter">
            <span>{ui.heartHp}</span>
            <strong>{room.heartHp}</strong>
          </div>
        </div>
      )}

      {room.status === 'lobby' && (
        <div className="panel lobby-panel">
          <div className="code-block">
            <span className="muted">{ui.code}</span>
            <strong className="room-code">{room.code}</strong>
            <div className="cta-row">
              <button type="button" className="btn btn-small" onClick={copyCode}>
                {copied ? ui.copied : ui.copy}
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={copyLink}>
                {ui.copyLink}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setShowQr(!showQr)}
              >
                {showQr ? ui.hideQr : ui.showQr}
              </button>
            </div>
            {showQr && <JoinQr url={joinUrl} alt={ui.joinOnPhone} />}
            <p className="muted">{ui.shareHint}</p>
          </div>

          <div className="roster">
            <h3>{ui.tvRoster}</h3>
            <table>
              <thead>
                <tr>
                  <th>{ui.tableName}</th>
                  <th>{ui.tableRole}</th>
                  <th>{ui.tableStatus}</th>
                </tr>
              </thead>
              <tbody>
                {room.players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {p.id === room.hostId
                        ? ui.roleHost
                        : p.spectator
                          ? ui.roleSpectator
                          : ui.rolePlayer}
                    </td>
                    <td>{p.connected ? ui.statusOnline : ui.statusOffline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {room.youAreHost && (
            <div className="host-controls">
              <p className="muted">{soloHost ? ui.hostSoloHint : ui.hostHint}</p>
              <div className="row wrap">
                <button
                  type="button"
                  className={`btn btn-ghost btn-small${room.language === 'sv' ? ' selected-mode' : ''}`}
                  onClick={() => void run(() => setRoomLanguage('sv'))}
                >
                  SV
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-small${room.language === 'en' ? ' selected-mode' : ''}`}
                  onClick={() => void run(() => setRoomLanguage('en'))}
                >
                  EN
                </button>
                {hasParty && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => void run(() => setPublicLobby(!room.isPublic))}
                  >
                    {room.isPublic ? ui.openLobbyOn : ui.openLobbyOff}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy || !canStart}
                onClick={() => void run(() => startGame())}
              >
                {ui.startGame}
              </button>
              {soloHost && <p className="muted">{ui.soloReady}</p>}

              {!hasParty && (
                <div className="party-box compact">
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
                  <form className="redeem" onSubmit={(e) => void onRedeem(e)}>
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
          )}

          {!room.youAreHost && <p className="muted">{ui.waitingHost}</p>}
          {room.youAreSpectator && <p className="muted">{ui.spectatorHint}</p>}
        </div>
      )}

      {room.status !== 'lobby' && room.status !== 'finished' && (
        <div className="panel game-panel outbreak-monitor">
          <div className="map-header">
            <h3>{ui.mapTitle}</h3>
            <p className="muted map-live-hint">{ui.mapLiveHint}</p>
          </div>
          {room.focusRegionId && (
            <p className="muted focus-line">
              {ui.focusLand}: {regionName(room.focusRegionId, uiLang)}
            </p>
          )}
          <WorldMap
            regions={room.regions}
            lang={uiLang}
            focusRegionId={
              room.status === 'council'
                ? room.voteOptions.find((o) => o.id === room.yourVote)?.targetRegionId ??
                  room.focusRegionId
                : room.focusRegionId
            }
            selectable={false}
            selectedId={
              room.status === 'council'
                ? room.voteOptions.find((o) => o.id === room.yourVote)?.targetRegionId ?? null
                : null
            }
            quarantineLabel={ui.quarantined}
          />

          <LiveEventTicker events={room.liveEvents ?? []} lang={uiLang} label={ui.liveFeed} />

          {room.status === 'council' && (
            <div className="council compact-council">
              <p>{ui.voteHint}</p>
              <p className="muted">
                {room.submittedCount}/{room.submitterCount} {ui.statusReady.toLowerCase()}
              </p>
              <div className="vote-options">
                {room.voteOptions.map((opt) => {
                  const selected = room.yourVote === opt.id
                  const disabled = busy || !canVote || !opt.affordable
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`vote-card${selected ? ' selected' : ''}${!opt.affordable ? ' locked' : ''}`}
                      disabled={disabled && !selected}
                      onClick={() => {
                        if (!canVote) return
                        void run(() => castVote(opt.id))
                      }}
                    >
                      <strong>{opt.title}</strong>
                      <span>{opt.description}</span>
                      <em>
                        {opt.cost} {ui.resourcePoints.toLowerCase()}
                        {!opt.affordable ? ` · ${ui.tooExpensive}` : ''}
                        {selected ? ` · ${ui.yourVote}` : ''}
                      </em>
                    </button>
                  )
                })}
              </div>
              {(room.youAreHost || room.youSubmitted) && (
                <p className="muted">{ui.waitingAll}</p>
              )}
            </div>
          )}

          {room.status === 'resolve' && (
            <div className="resolve-banner">
              <p className="muted">{ui.autoAdvance}</p>
              {room.youAreHost && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy}
                  onClick={() => void run(() => continueTurn())}
                >
                  {ui.continueTurn}
                </button>
              )}
            </div>
          )}

          {room.youAreHost && (room.status === 'council' || room.status === 'resolve') && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={() => void run(() => endParty())}
            >
              {ui.endParty}
            </button>
          )}
        </div>
      )}

      {tv && room.status !== 'lobby' && room.status !== 'finished' && (
        <div className="tv-hint muted">{ui.tvPhaseHint}</div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )
}
