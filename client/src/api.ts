import { io, type Socket } from 'socket.io-client'
import type {
  AdventureMode,
  Lang,
  PartyInfo,
  PartyPassLocal,
  PlayerClass,
  PublicRoom,
  Session,
} from './types'

/** Railway API/socket base in production; empty in local Vite (proxy). */
const API_BASE = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '')

let socket: Socket | null = null
let rejoinInFlight: Promise<{ ok: boolean; playerId?: string; room?: PublicRoom; error?: string } | null> | null =
  null
let connectionListenersAttached = false

type RoomHandler = (room: PublicRoom) => void
let onRoomHandler: RoomHandler | null = null

export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 20_000,
    })
  }

  if (!connectionListenersAttached) {
    connectionListenersAttached = true
    socket.on('connect', () => {
      void ensureSessionBound()
    })
    socket.on('room', (room: PublicRoom) => {
      onRoomHandler?.(room)
    })
  }

  return socket
}

export type ConnState = 'connected' | 'connecting' | 'disconnected'

export function subscribeConnection(handler: (state: ConnState) => void): () => void {
  const s = getSocket()
  const emit = () => {
    if (s.connected) handler('connected')
    else if (s.active) handler('connecting')
    else handler('disconnected')
  }
  const onConnect = () => handler('connected')
  const onDisconnect = () => handler('disconnected')
  const onAttempt = () => handler('connecting')
  s.on('connect', onConnect)
  s.on('disconnect', onDisconnect)
  s.on('reconnect_attempt', onAttempt)
  s.on('reconnect', onConnect)
  emit()
  return () => {
    s.off('connect', onConnect)
    s.off('disconnect', onDisconnect)
    s.off('reconnect_attempt', onAttempt)
    s.off('reconnect', onConnect)
  }
}

export function setRoomHandler(handler: RoomHandler | null) {
  onRoomHandler = handler
  getSocket()
}

function apiUrl(path: string) {
  return `${API_BASE}${path}`
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      res.ok
        ? 'Invalid API response / Ogiltigt API-svar'
        : `API error ${res.status}. Check VITE_SOCKET_URL / Railway.`,
    )
  }
}

export async function ensureSessionBound(
  retries = 4,
): Promise<{ ok: boolean; playerId?: string; room?: PublicRoom; error?: string } | null> {
  const session = loadSession()
  if (!session) return null
  if (rejoinInFlight) return rejoinInFlight

  rejoinInFlight = (async () => {
    let last: { ok: boolean; playerId?: string; room?: PublicRoom; error?: string } = {
      ok: false,
      error: 'rejoin failed',
    }
    for (let i = 0; i < retries; i++) {
      last = await rejoinGame(session.code, session.playerId)
      if (last.ok && last.room) return last
      const err = last.error ?? ''
      if (err.includes('finns inte') || err.includes('hittades inte') || err.includes('not found')) {
        break
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
    return last
  })()

  try {
    return await rejoinInFlight
  } finally {
    rejoinInFlight = null
  }
}

async function ack<T>(event: string, payload?: unknown): Promise<T> {
  const s = getSocket()
  if (!s.connected) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('Could not reach server / Kunde inte ansluta till servern')),
        12_000,
      )
      s.once('connect', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  if (event !== 'create' && event !== 'join' && event !== 'rejoin') {
    await ensureSessionBound(2)
  }

  const session = loadSession()
  const raw =
    payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {}
  // Always attach session identity for rebound after socket reconnect.
  // Use roomCode (not code) so promo redeem can keep payload.code.
  const body = {
    ...raw,
    playerId: raw.playerId ?? session?.playerId,
    roomCode: raw.roomCode ?? session?.code,
  }

  return new Promise((resolve, reject) => {
    s.timeout(12000).emit(event, body, (err: Error | null, res: T) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

type OkRoom = { ok: true; playerId: string; room: PublicRoom }
type Err = { ok: false; error: string; code?: string }

export async function createGame(name: string, language: Lang, partyToken?: string | null) {
  return ack<OkRoom | Err>('create', { name, language, partyToken })
}

export async function joinGame(code: string, name: string) {
  return ack<OkRoom | Err>('join', { code, name })
}

export async function rejoinGame(code: string, playerId: string) {
  return ack<OkRoom | Err>('rejoin', { code, playerId })
}

export async function pickClass(classId: PlayerClass) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('pickClass', { classId })
}

export async function startAdventure(mode: AdventureMode = 'story') {
  const session = loadSession()
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('start', {
    mode,
    code: session?.code,
    playerId: session?.playerId,
  })
}

export async function castVote(choiceId: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('castVote', { choiceId })
}

export async function lockVotes() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('lockVotes', {})
}

export async function rematch(mode: AdventureMode = 'story') {
  const session = loadSession()
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('rematch', {
    mode,
    code: session?.code,
    playerId: session?.playerId,
  })
}

export async function pauseAdventure() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('pause', {})
}

export async function resumeAdventure() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('resume', {})
}

export async function setDmNote(note: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('setDmNote', { note })
}

export async function setLanguage(language: Lang) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('setLanguage', { language })
}

export async function setVoteSeconds(seconds: number) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('setVoteSeconds', { seconds })
}

export async function setSecretBallot(enabled: boolean) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('setSecretBallot', { enabled })
}

export async function setHostPlays(plays: boolean) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('setHostPlays', { plays })
}

export async function redeemParty(code: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('redeemParty', { code })
}

export async function applyPartyToken(token: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('applyPartyToken', { token })
}

export async function fetchPartyInfo(): Promise<PartyInfo> {
  return apiJson<PartyInfo>('/api/party/info')
}

export type RoomPreview = {
  code: string
  language: Lang
  status: string
  canPickClass: boolean
  spectateOnly: boolean
  playerCount: number
  classes: {
    id: PlayerClass
    name: string
    blurb: string
    might: number
    arcana: number
    cunning: number
    ability: string
  }[]
}

export async function fetchRoomPreview(code: string): Promise<RoomPreview> {
  const path = `/api/room/${encodeURIComponent(code.trim().toUpperCase())}/preview`
  const res = await fetch(apiUrl(path))
  const data = (await res.json().catch(() => ({}))) as RoomPreview & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`)
  }
  return data
}

export async function startCheckout(opts: {
  locale: Lang
  roomCode?: string
  plan: 'day' | 'week'
  firstTime?: boolean
}) {
  return apiJson<{ url?: string; error?: string }>('/api/party/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
}

export async function claimPartySession(sessionId: string) {
  return apiJson<{
    token?: string
    expiresAt?: number
    roomCode?: string
    error?: string
  }>('/api/party/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
}

const SESSION_KEY = 'partypaths-session'
const PASS_KEY = 'partypaths-party-pass'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function loadPartyPass(): PartyPassLocal | null {
  try {
    const raw = localStorage.getItem(PASS_KEY)
    if (!raw) return null
    const pass = JSON.parse(raw) as PartyPassLocal
    if (!pass.expiresAt || pass.expiresAt <= Date.now()) {
      localStorage.removeItem(PASS_KEY)
      return null
    }
    return pass
  } catch {
    return null
  }
}

export function savePartyPass(pass: PartyPassLocal) {
  localStorage.setItem(PASS_KEY, JSON.stringify(pass))
}
