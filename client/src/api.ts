import { io, type Socket } from 'socket.io-client'
import type { Lang, PartyInfo, PartyPassLocal, PlayerClass, PublicRoom, Session } from './types'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined

let socket: Socket | null = null

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] })
  }
  return socket
}

function ack<T>(event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket().timeout(12000).emit(event, payload ?? {}, (err: Error | null, res: T) => {
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

export async function startAdventure() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('start', {})
}

export async function castVote(choiceId: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('castVote', { choiceId })
}

export async function lockVotes() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('lockVotes', {})
}

export async function rematch() {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('rematch', {})
}

export async function setLanguage(language: Lang) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('setLanguage', { language })
}

export async function redeemParty(code: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('redeemParty', { code })
}

export async function applyPartyToken(token: string) {
  return ack<{ ok: boolean; error?: string; room?: PublicRoom }>('applyPartyToken', { token })
}

export async function fetchPartyInfo(): Promise<PartyInfo> {
  const res = await fetch('/api/party/info')
  return res.json()
}

export async function startCheckout(opts: {
  locale: Lang
  roomCode?: string
  plan: 'day' | 'week'
  firstTime?: boolean
}) {
  const res = await fetch('/api/party/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  return res.json() as Promise<{ url?: string; error?: string }>
}

export async function claimPartySession(sessionId: string) {
  const res = await fetch('/api/party/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })
  return res.json() as Promise<{
    token?: string
    expiresAt?: number
    roomCode?: string
    error?: string
  }>
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
