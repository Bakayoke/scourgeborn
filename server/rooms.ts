import { customAlphabet } from 'nanoid'
import {
  MAX_MISSES,
  MIN_MULTI_PLAYERS,
  connectedActiveIds,
  deliverVaccine,
  dropItem,
  EXTRACT_ITEMS,
  extract,
  incubate,
  initLabGame,
  msg,
  pingStation,
  sendItem,
  switchStation,
  synthesize,
  tickLab,
  waveLabel,
  type ExtractItemId,
} from './game/lab.js'
import { GAME_LIMITS } from './limits.js'
import { deleteRoomRecord, loadRoomRecord, saveRoomRecord } from './persist.js'
import type { ItemId, Lang, PingKind, Player, PublicRoom, Room, RoomStatus, Station } from './types.js'

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)
const DISCONNECT_GRACE_MS = 60_000
const HOST_TRANSFER_AFTER_MS = 90_000
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000
const NOTICE_TTL_MS = 45_000

const rooms = new Map<string, Room>()
const socketToPlayer = new Map<string, { code: string; playerId: string }>()
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()

let onPersist: (() => void) | null = null
let onBroadcast: ((code: string) => void) | null = null

export function setPersistHook(fn: (() => void) | null) {
  onPersist = fn
}

export function setBroadcastHook(fn: ((code: string) => void) | null) {
  onBroadcast = fn
}

function touch(room?: Room) {
  if (room) {
    room.updatedAt = Date.now()
    void saveRoomRecord(room)
  }
  onPersist?.()
}

function playerKey(code: string, playerId: string) {
  return `${code}:${playerId}`
}

function cancelDisconnectTimer(code: string, playerId: string) {
  const key = playerKey(code, playerId)
  const t = disconnectTimers.get(key)
  if (t) {
    clearTimeout(t)
    disconnectTimers.delete(key)
  }
}

function roomLimits() {
  return GAME_LIMITS
}

function roomMsg(room: Room, sv: string, en: string) {
  return msg(room.language, sv, en)
}

function uniqueCode(): string {
  let code = makeCode()
  while (rooms.has(code)) code = makeCode()
  return code
}

function seatedPlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.spectator)
}

function midGame(status: RoomStatus): boolean {
  return status === 'playing'
}

function emptyGameFields(): Pick<
  Room,
  | 'score'
  | 'misses'
  | 'patients'
  | 'lab'
  | 'lastTickAt'
  | 'lastSpawnAt'
  | 'lastEventSv'
  | 'lastEventEn'
  | 'mode'
  | 'gameStartedAt'
  | 'wave'
  | 'alerts'
  | 'stats'
> {
  return {
    score: 0,
    misses: 0,
    patients: [],
    lab: {},
    lastTickAt: 0,
    lastSpawnAt: 0,
    lastEventSv: null,
    lastEventEn: null,
    mode: 'multi',
    gameStartedAt: 0,
    wave: 1,
    alerts: {},
    stats: {},
  }
}

export function allRooms() {
  return rooms
}

function normalizeStatus(raw: unknown): RoomStatus {
  if (raw === 'playing' || raw === 'gameover') return raw
  return 'lobby'
}

export function restoreRooms(list: Room[]) {
  for (const raw of list) {
    if (!raw?.code) continue
    if (!('lab' in raw) && !('patients' in raw)) continue
    const room: Room = {
      code: raw.code,
      hostId: raw.hostId,
      players: (raw.players ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        connected: Boolean(p.connected),
        spectator: Boolean(p.spectator),
      })),
      language: raw.language === 'en' ? 'en' : 'sv',
      status: normalizeStatus(raw.status),
      mode: raw.mode === 'solo' ? 'solo' : 'multi',
      isPublic: Boolean(raw.isPublic),
      waitlist: Array.isArray(raw.waitlist) ? raw.waitlist : [],
      notice: raw.notice ?? null,
      updatedAt: raw.updatedAt ?? Date.now(),
      score: Number(raw.score) || 0,
      misses: Number(raw.misses) || 0,
      patients: Array.isArray(raw.patients) ? raw.patients : [],
      lab: (raw.lab as Room['lab']) ?? {},
      lastTickAt: Number(raw.lastTickAt) || 0,
      lastSpawnAt: Number(raw.lastSpawnAt) || 0,
      lastEventSv: raw.lastEventSv ?? null,
      lastEventEn: raw.lastEventEn ?? null,
      gameStartedAt: Number(raw.gameStartedAt) || 0,
      wave: Number(raw.wave) || 1,
      alerts: (raw.alerts as Room['alerts']) ?? {},
      stats: (raw.stats as Room['stats']) ?? {},
    }
    rooms.set(room.code, room)
  }
}

export function getRoom(code: string) {
  return rooms.get(code.toUpperCase().trim()) ?? null
}

export async function hydrateRoom(code: string): Promise<Room | null> {
  const c = code.toUpperCase().trim()
  if (!c) return null
  if (rooms.get(c)) return rooms.get(c)!
  const loaded = await loadRoomRecord(c)
  if (!loaded) return null
  restoreRooms([loaded])
  return rooms.get(c) ?? null
}

export async function reloadRoomFromStore(code: string): Promise<Room | null> {
  const c = code.toUpperCase().trim()
  const existing = rooms.get(c)
  const loaded = await loadRoomRecord(c)
  if (!loaded) return null
  if (existing && (existing.updatedAt ?? 0) >= (loaded.updatedAt ?? 0)) return existing
  rooms.delete(c)
  restoreRooms([loaded])
  const room = rooms.get(c)
  if (!room) return null
  const connectedIds = new Set<string>()
  for (const binding of socketToPlayer.values()) {
    if (binding.code === c) connectedIds.add(binding.playerId)
  }
  for (const p of room.players) p.connected = connectedIds.has(p.id)
  return room
}

export function getBinding(socketId: string) {
  return socketToPlayer.get(socketId) ?? null
}

export function createRoom(
  hostName: string,
  socketId: string,
  language: Lang = 'sv',
  wantPublic = false,
): { room: Room; playerId: string } {
  const code = uniqueCode()
  const playerId = crypto.randomUUID()
  const host: Player = {
    id: playerId,
    name: hostName.trim().slice(0, 20) || (language === 'en' ? 'Host' : 'Värd'),
    connected: true,
    spectator: false,
  }
  const room: Room = {
    code,
    hostId: playerId,
    players: [host],
    language: language === 'en' ? 'en' : 'sv',
    status: 'lobby',
    isPublic: Boolean(wantPublic),
    waitlist: [],
    notice: null,
    updatedAt: Date.now(),
    ...emptyGameFields(),
  }
  releaseSocket(socketId)
  rooms.set(code, room)
  socketToPlayer.set(socketId, { code, playerId })
  touch(room)
  return { room, playerId }
}

function releaseSocket(socketId: string) {
  const prev = socketToPlayer.get(socketId)
  if (!prev) return
  socketToPlayer.delete(socketId)
  const room = rooms.get(prev.code)
  if (!room) return
  const player = room.players.find((p) => p.id === prev.playerId)
  if (!player || !player.connected) return
  player.connected = false
  touch(room)
  if (room.status === 'lobby' || room.status === 'gameover') {
    if (player.id !== room.hostId) {
      room.players = room.players.filter((p) => p.id !== player.id)
      touch(room)
    }
  }
}

export function joinRoom(
  code: string,
  name: string,
  socketId: string,
):
  | { room: Room; playerId: string }
  | {
      error: string
      code?: 'ROOM_FULL' | 'NOT_FOUND' | 'STARTED'
      roomCode?: string
      waitlistCount?: number
    } {
  const room = rooms.get(code.toUpperCase().trim())
  if (!room) {
    return {
      error: 'Hittade inget spel med den koden / No game found with that code',
      code: 'NOT_FOUND',
    }
  }
  const displayName =
    name.trim().slice(0, 20) || (room.language === 'en' ? 'Player' : 'Spelare')
  const existing = socketToPlayer.get(socketId)
  if (existing?.code === room.code) {
    const mine = room.players.find((p) => p.id === existing.playerId)
    if (mine) {
      cancelDisconnectTimer(room.code, mine.id)
      mine.connected = true
      if (!mine.spectator) mine.name = displayName
      touch(room)
      return { room, playerId: mine.id }
    }
  }
  if (existing && existing.code !== room.code) releaseSocket(socketId)
  if (midGame(room.status)) {
    const playerId = crypto.randomUUID()
    room.players.push({ id: playerId, name: displayName, connected: true, spectator: true })
    socketToPlayer.set(socketId, { code: room.code, playerId })
    touch(room)
    return { room, playerId }
  }
  const reclaim = seatedPlayers(room).find(
    (p) => !p.connected && p.name.toLowerCase() === displayName.toLowerCase(),
  )
  if (reclaim) {
    cancelDisconnectTimer(room.code, reclaim.id)
    reclaim.connected = true
    socketToPlayer.set(socketId, { code: room.code, playerId: reclaim.id })
    touch(room)
    return { room, playerId: reclaim.id }
  }
  const maxPlayers = roomLimits().maxPlayers
  const connectedSeated = seatedPlayers(room).filter((p) => p.connected).length
  if (maxPlayers > 0 && connectedSeated >= maxPlayers) {
    return {
      error: roomMsg(room, 'Rummet är fullt', 'Room is full'),
      code: 'ROOM_FULL',
      roomCode: room.code,
    }
  }
  const playerId = crypto.randomUUID()
  room.players.push({ id: playerId, name: displayName, connected: true, spectator: false })
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return { room, playerId }
}

export function reconnectSocket(
  code: string,
  playerId: string,
  socketId: string,
): Room | { error: string } {
  const room = rooms.get(code.toUpperCase().trim())
  if (!room) return { error: 'Rummet finns inte / Room not found' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelaren hittades inte / Player not found' }
  cancelDisconnectTimer(room.code, playerId)
  player.connected = true
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return room
}

export function handleDisconnect(socketId: string) {
  const binding = socketToPlayer.get(socketId)
  if (!binding) return
  socketToPlayer.delete(socketId)
  const room = rooms.get(binding.code)
  if (!room) return
  const player = room.players.find((p) => p.id === binding.playerId)
  if (!player) return
  player.connected = false
  touch(room)
  const key = playerKey(binding.code, binding.playerId)
  cancelDisconnectTimer(binding.code, binding.playerId)
  disconnectTimers.set(
    key,
    setTimeout(() => {
      disconnectTimers.delete(key)
      const r = rooms.get(binding.code)
      if (!r) return
      const p = r.players.find((x) => x.id === binding.playerId)
      if (!p || p.connected) return
      if (p.id === r.hostId) {
        setTimeout(() => {
          const rr = rooms.get(binding.code)
          if (!rr) return
          const host = rr.players.find((x) => x.id === rr.hostId)
          if (host?.connected) return
          const next = rr.players.find((x) => x.connected && !x.spectator)
          if (!next) return
          rr.hostId = next.id
          rr.notice = { kind: 'host_transfer', hostName: next.name, at: Date.now() }
          touch(rr)
          onBroadcast?.(rr.code)
        }, HOST_TRANSFER_AFTER_MS - DISCONNECT_GRACE_MS)
      } else if (r.status === 'lobby' || r.status === 'gameover') {
        r.players = r.players.filter((x) => x.id !== binding.playerId)
      }
      touch(r)
      onBroadcast?.(r.code)
    }, DISCONNECT_GRACE_MS),
  )
}

export function previewRoom(code: string) {
  const room = rooms.get(code.toUpperCase().trim())
  if (!room) return null
  return {
    code: room.code,
    language: room.language,
    status: room.status,
    playerCount: seatedPlayers(room).filter((p) => p.connected).length,
    hostName: room.players.find((p) => p.id === room.hostId)?.name ?? '',
    isPublic: room.isPublic,
  }
}

export function listPublicLobbies(opts: { language?: Lang | null; limit?: number } = {}) {
  const limit = opts.limit ?? 24
  const now = Date.now()
  return [...rooms.values()]
    .filter((r) => {
      if (!r.isPublic || r.status !== 'lobby') return false
      if (opts.language && r.language !== opts.language) return false
      const max = roomLimits().maxPlayers
      const seated = seatedPlayers(r).filter((p) => p.connected).length
      if (max > 0 && seated >= max) return false
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((r) => ({
      code: r.code,
      language: r.language,
      playerCount: seatedPlayers(r).filter((p) => p.connected).length,
      hostName: r.players.find((p) => p.id === r.hostId)?.name ?? '',
      updatedAt: r.updatedAt,
      ageMs: now - r.updatedAt,
    }))
}

export function setLanguage(code: string, playerId: string, language: Lang): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.language = language === 'en' ? 'en' : 'sv'
  touch(room)
  return room
}

export function setPublicLobby(
  code: string,
  playerId: string,
  isPublic: boolean,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.isPublic = Boolean(isPublic)
  touch(room)
  return room
}

function promoteWaitlist(room: Room) {
  const max = roomLimits().maxPlayers
  while (room.waitlist.length > 0) {
    const seated = seatedPlayers(room).filter((p) => p.connected).length
    if (max > 0 && seated >= max) break
    const w = room.waitlist.shift()
    if (!w) break
    room.players.push({ id: w.id, name: w.name, connected: false, spectator: false })
  }
}

export function startGame(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan starta' }
  if (room.status === 'playing') return { error: roomMsg(room, 'Spelet pågår', 'Game in progress') }
  for (const p of room.players) p.spectator = false
  promoteWaitlist(room)
  const ids = connectedActiveIds(room)
  if (ids.length < 1) return { error: roomMsg(room, 'Ingen spelare', 'No players') }
  if (ids.length >= 2 && ids.length < MIN_MULTI_PLAYERS) {
    return { error: roomMsg(room, `Minst ${MIN_MULTI_PLAYERS} spelare`, `At least ${MIN_MULTI_PLAYERS} players`) }
  }
  Object.assign(room, emptyGameFields())
  initLabGame(room, ids)
  touch(room)
  return room
}

export function labAction(
  code: string,
  playerId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }

  let result: { error?: string } = { error: 'Okänd action' }
  switch (action) {
    case 'extract': {
      const raw = String(payload.element ?? 'red_rna')
      const element = EXTRACT_ITEMS.includes(raw as ExtractItemId) ? (raw as ExtractItemId) : 'red_rna'
      result = extract(room, playerId, element)
      break
    }
    case 'synthesize':
      result = synthesize(room, playerId)
      break
    case 'incubate':
      result = incubate(room, playerId, payload.mode === 'cool' ? 'cool' : 'heat')
      break
    case 'send':
      result = sendItem(room, playerId, String(payload.toPlayerId ?? ''))
      break
    case 'deliver':
      result = deliverVaccine(room, playerId)
      break
    case 'drop':
      result = dropItem(room, playerId)
      break
    case 'switch_station':
      result = switchStation(room, playerId, String(payload.station ?? 'extractor') as Station)
      break
    case 'ping':
      result = pingStation(room, playerId, String(payload.kind ?? 'need_red') as PingKind)
      break
    default:
      return { error: 'Okänd action' }
  }
  if (result.error) return { error: result.error }
  touch(room)
  return room
}

export function endParty(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.status = 'gameover'
  touch(room)
  return room
}

export function backToLobby(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.status = 'lobby'
  Object.assign(room, emptyGameFields())
  for (const p of room.players) p.spectator = false
  promoteWaitlist(room)
  touch(room)
  return room
}

export function onPhaseTimeout(room: Room) {
  if (room.status !== 'playing') return
  tickLab(room)
  touch(room)
}

export function roomsNeedingTick(): Room[] {
  return [...rooms.values()].filter((r) => r.status === 'playing')
}

export function pruneIdleRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_IDLE_MS) {
      rooms.delete(code)
      void deleteRoomRecord(code)
    }
  }
}

export function toPublicRoom(room: Room, viewerId?: string | null): PublicRoom {
  const lang = room.language
  const limits = roomLimits()
  const viewer = viewerId ? room.players.find((p) => p.id === viewerId) : null
  const labState = viewerId ? room.lab[viewerId] : null

  let notice: string | null = null
  if (room.notice && Date.now() - room.notice.at < NOTICE_TTL_MS) {
    notice = msg(
      lang,
      `${room.notice.hostName} är nu värd`,
      `${room.notice.hostName} is now the host`,
    )
  }

  const players = room.players.map((p) => {
    const ls = room.lab[p.id]
    const st = room.stats[p.id]
    return {
      ...p,
      assignedStation: ls?.assignedStation ?? 'extractor',
      itemInHand: ls?.itemInHand ?? null,
      cures: st?.cures ?? 0,
      sends: st?.sends ?? 0,
    }
  })

  const seated = seatedPlayers(room).filter((p) => p.connected).length

  const viewerAlert = viewerId && room.alerts ? room.alerts[viewerId] : null
  const alertFresh = viewerAlert && Date.now() - viewerAlert.at < 8000

  return {
    code: room.code,
    hostId: room.hostId,
    players,
    language: room.language,
    status: room.status,
    mode: room.mode,
    limits,
    isPublic: Boolean(room.isPublic),
    waitlist: room.waitlist,
    score: room.score,
    misses: room.misses,
    maxMisses: MAX_MISSES,
    patients: room.patients.map((p) => ({ ...p })),
    yourStation: labState?.assignedStation ?? 'extractor',
    yourActiveStation:
      room.mode === 'solo' ? (labState?.activeStation ?? 'extractor') : (labState?.assignedStation ?? 'extractor'),
    itemInHand: labState?.itemInHand ?? null,
    synthSlot: labState?.synthSlot ?? null,
    lastEvent: lang === 'en' ? room.lastEventEn : room.lastEventSv,
    notice,
    youAreSpectator: Boolean(viewer?.spectator),
    youAreHost: Boolean(viewer && viewer.id === room.hostId),
    canStartSolo: seated === 1,
    minPlayersMulti: MIN_MULTI_PLAYERS,
    wave: room.wave ?? 1,
    waveLabel: waveLabel(room.wave ?? 1, lang),
    alert: alertFresh ? (lang === 'en' ? viewerAlert!.messageEn : viewerAlert!.messageSv) : null,
    alertItemId: alertFresh ? (viewerAlert!.itemId ?? null) : null,
    stats: { ...room.stats },
  }
}

export { MAX_MISSES, TICK_MS } from './game/lab.js'
