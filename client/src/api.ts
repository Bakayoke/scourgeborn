import { io, type Socket } from 'socket.io-client'
import type { Lang, PartyInfo, PartyPassLocal, PublicRoom, Session, ToolId } from './types'

const API_BASE = (import.meta.env.VITE_SOCKET_URL || '').replace(/\/$/, '')

let socket: Socket | null = null
let rejoinInFlight: Promise<{
  ok: boolean
  playerId?: string
  room?: PublicRoom
  error?: string
} | null> | null = null
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
    socket.on('connect', () => void ensureSessionBound())
    socket.on('room', (room: PublicRoom) => onRoomHandler?.(room))
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
  s.on('connect', () => handler('connected'))
  s.on('disconnect', () => handler('disconnected'))
  s.on('reconnect_attempt', () => handler('connecting'))
  emit()
  return () => {
    s.off('connect')
    s.off('disconnect')
    s.off('reconnect_attempt')
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
    throw new Error(res.ok ? 'Invalid API response' : `API error ${res.status}`)
  }
}

export async function ensureSessionBound(retries = 4) {
  const session = loadSession()
  if (!session) return null
  if (rejoinInFlight) return rejoinInFlight
  rejoinInFlight = (async () => {
    for (let i = 0; i < retries; i++) {
      const last = await rejoinGame(session.code, session.playerId)
      if (last.ok && last.room) return last
      await new Promise((r) => setTimeout(r, 700 * (i + 1)))
    }
    return { ok: false, error: 'rejoin failed' }
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
      const t = setTimeout(() => reject(new Error('Could not reach server')), 12_000)
      s.once('connect', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
  if (event !== 'create' && event !== 'join' && event !== 'rejoin') await ensureSessionBound(2)
  const session = loadSession()
  const raw =
    payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {}
  const isIdentity = event === 'create' || event === 'join' || event === 'rejoin'
  const body = isIdentity
    ? raw
    : { ...raw, playerId: raw.playerId ?? session?.playerId, roomCode: raw.roomCode ?? session?.code }
  return new Promise((resolve, reject) => {
    s.timeout(12000).emit(event, body, (err: Error | null, res: T) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

type OkRoom = { ok: true; playerId: string; room: PublicRoom }
type Err = { ok: false; error: string }

export async function createGame(
  name: string,
  language: Lang,
  partyToken?: string | null,
  isPublic = false,
) {
  return ack<OkRoom | Err>('create', { name, language, partyToken, isPublic })
}

export async function joinGame(code: string, name: string) {
  return ack<OkRoom | Err>('join', { code, name })
}

export async function rejoinGame(code: string, playerId: string) {
  return ack<OkRoom | Err>('rejoin', { code, playerId })
}

export async function startGame() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('startGame', {})
}

export async function ritualTool(tool: ToolId, data: Record<string, unknown>) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('ritualTool', { tool, data })
}

export async function acknowledgeAffliction() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('acknowledgeAffliction', {})
}

export async function callCleansingRite() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('callCleansingRite', {})
}

export async function cleansingVote(targetId: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('cleansingVote', { targetId })
}

export async function endParty() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('endParty', {})
}

export async function backToLobby() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('backToLobby', {})
}

export async function fetchPartyInfo(): Promise<PartyInfo> {
  return apiJson<PartyInfo>('/api/party/info')
}

export async function fetchPublicLobbies(lang?: Lang) {
  const q = lang ? `?lang=${lang}` : ''
  const data = await apiJson<{ lobbies: unknown[] }>(`/api/lobbies${q}`)
  return data.lobbies ?? []
}

const SESSION_KEY = 'scourgeborn-session'
const PASS_KEY = 'scourgeborn-party-pass'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
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
