import { customAlphabet } from 'nanoid'
import {
  AFFLICTION_MODAL_MS,
  CYCLE_BREAK_MS,
  MIN_MULTI_PLAYERS,
  activePlayerIds,
  advanceCycle,
  allAfflictionSeen,
  applyToolAction,
  applyWaveResult,
  assignAffliction,
  castCleansingVote,
  checkOutcome,
  connectedActiveIds,
  evaluateTasks,
  initGameState,
  msg,
  publicGlyphHint,
  resolveCleansingVote,
  startCleansingVote,
  startNextWave,
} from './game/ritual.js'
import {
  limitsFor,
  lookupPass,
  redeemPassCode,
  tierFromExpiry,
  type PartyPass,
} from './premium.js'
import { deleteRoomRecord, loadRoomRecord, saveRoomRecord } from './persist.js'
import type { GameOutcome, Lang, Player, PublicRoom, Room, RoomStatus, ToolId } from './types.js'

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

function roomLimits(room: Room) {
  return limitsFor(tierFromExpiry(room.premiumExpiresAt))
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
  return status !== 'lobby' && status !== 'finished'
}

function emptyGameFields(): Pick<
  Room,
  | 'phaseEndsAt'
  | 'mode'
  | 'matrixHealth'
  | 'cycle'
  | 'maxCycles'
  | 'gameStartedAt'
  | 'afflictionAt'
  | 'afflictionTriggered'
  | 'roles'
  | 'afflictionSeen'
  | 'tasks'
  | 'playerTools'
  | 'scourgeMeter'
  | 'miasmaUntil'
  | 'cleansing'
  | 'soloSurvivalMs'
  | 'outcome'
  | 'lastEventSv'
  | 'lastEventEn'
> {
  return {
    phaseEndsAt: 0,
    mode: 'multi',
    matrixHealth: 100,
    cycle: 0,
    maxCycles: 5,
    gameStartedAt: 0,
    afflictionAt: 0,
    afflictionTriggered: false,
    roles: {},
    afflictionSeen: {},
    tasks: [],
    playerTools: {},
    scourgeMeter: 0,
    miasmaUntil: 0,
    cleansing: null,
    soloSurvivalMs: 0,
    outcome: 'ongoing',
    lastEventSv: null,
    lastEventEn: null,
  }
}

export function allRooms() {
  return rooms
}

function normalizeStatus(raw: unknown): RoomStatus {
  const valid: RoomStatus[] = ['lobby', 'ritual', 'affliction', 'cleansing', 'cycle_end', 'finished']
  if (typeof raw === 'string' && valid.includes(raw as RoomStatus)) return raw as RoomStatus
  return 'lobby'
}

export function restoreRooms(list: Room[]) {
  for (const raw of list) {
    if (!raw?.code) continue
    if (!('matrixHealth' in raw) && !('tasks' in raw)) continue
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
      premiumExpiresAt: raw.premiumExpiresAt ?? null,
      isPublic: Boolean(raw.isPublic),
      waitlist: Array.isArray(raw.waitlist) ? raw.waitlist : [],
      notice: raw.notice ?? null,
      updatedAt: raw.updatedAt ?? Date.now(),
      phaseEndsAt: Number(raw.phaseEndsAt) || 0,
      matrixHealth: Number(raw.matrixHealth) || 100,
      cycle: Number(raw.cycle) || 0,
      maxCycles: Number(raw.maxCycles) || 5,
      gameStartedAt: Number(raw.gameStartedAt) || 0,
      afflictionAt: Number(raw.afflictionAt) || 0,
      afflictionTriggered: Boolean(raw.afflictionTriggered),
      roles: (raw.roles as Room['roles']) ?? {},
      afflictionSeen: (raw.afflictionSeen as Room['afflictionSeen']) ?? {},
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      playerTools: (raw.playerTools as Room['playerTools']) ?? {},
      scourgeMeter: Number(raw.scourgeMeter) || 0,
      miasmaUntil: Number(raw.miasmaUntil) || 0,
      cleansing: raw.cleansing ?? null,
      soloSurvivalMs: Number(raw.soloSurvivalMs) || 0,
      outcome: (raw.outcome as GameOutcome) || 'ongoing',
      lastEventSv: raw.lastEventSv ?? null,
      lastEventEn: raw.lastEventEn ?? null,
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
  partyToken?: string | null,
  wantPublic = false,
): { room: Room; playerId: string } {
  const pass = lookupPass(partyToken)
  const premiumExpiresAt = pass?.expiresAt ?? null
  const isParty = tierFromExpiry(premiumExpiresAt) === 'party'
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
    premiumExpiresAt,
    isPublic: Boolean(wantPublic && isParty),
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
  if (room.status === 'lobby' || room.status === 'finished') {
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
  const maxPlayers = roomLimits(room).maxPlayers
  const connectedSeated = seatedPlayers(room).filter((p) => p.connected).length
  if (maxPlayers > 0 && connectedSeated >= maxPlayers) {
    const existingWait = room.waitlist.find(
      (w) => w.name.toLowerCase() === displayName.toLowerCase(),
    )
    if (!existingWait) {
      room.waitlist.push({ id: crypto.randomUUID(), name: displayName, at: Date.now() })
      room.waitlist = room.waitlist.slice(-24)
    }
    touch(room)
    return {
      error: roomMsg(room, 'Rummet är fullt', 'Room is full'),
      code: 'ROOM_FULL',
      roomCode: room.code,
      waitlistCount: room.waitlist.length,
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
      } else if (r.status === 'lobby' || r.status === 'finished') {
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
      if (tierFromExpiry(r.premiumExpiresAt) !== 'party') return false
      if (opts.language && r.language !== opts.language) return false
      const max = roomLimits(r).maxPlayers
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
  if (isPublic && tierFromExpiry(room.premiumExpiresAt) !== 'party') {
    return { error: roomMsg(room, 'Öppen lobby kräver Party-pass', 'Open lobby requires Party pass') }
  }
  room.isPublic = Boolean(isPublic)
  touch(room)
  return room
}

function promoteWaitlist(room: Room) {
  const max = roomLimits(room).maxPlayers
  while (room.waitlist.length > 0) {
    const seated = seatedPlayers(room).filter((p) => p.connected).length
    if (max > 0 && seated >= max) break
    const w = room.waitlist.shift()
    if (!w) break
    room.players.push({ id: w.id, name: w.name, connected: false, spectator: false })
  }
}

function finishIfNeeded(room: Room) {
  room.outcome = checkOutcome(room)
  if (room.outcome !== 'ongoing') {
    room.status = 'finished'
    room.phaseEndsAt = 0
    if (room.mode === 'solo') {
      room.soloSurvivalMs = Date.now() - room.gameStartedAt
    }
    return
  }
  if (room.matrixHealth <= 0) {
    room.outcome = 'scourgeborn_win'
    room.status = 'finished'
    room.phaseEndsAt = 0
    if (room.mode === 'solo') room.soloSurvivalMs = Date.now() - room.gameStartedAt
  }
}

function maybeResolveWave(room: Room) {
  const allDone = room.tasks.every((t) => t.completed || t.failed)
  if (!allDone) return
  const { completed, failed } = evaluateTasks(room)
  applyWaveResult(room, failed, completed)
  finishIfNeeded(room)
  if (room.outcome !== 'ongoing') return
  if (room.cycle >= room.maxCycles && failed === 0) {
    room.outcome = 'keepers_win'
    room.status = 'finished'
    room.phaseEndsAt = 0
    return
  }
  advanceCycle(room)
}

export function startGame(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan starta' }
  if (room.status !== 'lobby' && room.status !== 'finished') {
    return { error: roomMsg(room, 'Spelet pågår redan', 'Game already in progress') }
  }
  if (room.status === 'lobby') {
    for (const p of room.players) p.spectator = false
    promoteWaitlist(room)
  }
  const ids = connectedActiveIds(room)
  if (ids.length < 1) {
    return { error: roomMsg(room, 'Ingen spelare ansluten', 'No players connected') }
  }
  if (ids.length >= 2 && ids.length < MIN_MULTI_PLAYERS) {
    return {
      error: roomMsg(
        room,
        `Minst ${MIN_MULTI_PLAYERS} spelare för multi`,
        `At least ${MIN_MULTI_PLAYERS} players for multi`,
      ),
    }
  }
  Object.assign(room, emptyGameFields())
  initGameState(room, ids)
  touch(room)
  return room
}

export function acknowledgeAffliction(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'affliction') return { error: 'Inte affliction-fas' }
  room.afflictionSeen[playerId] = true
  touch(room)
  if (allAfflictionSeen(room)) {
    room.status = 'ritual'
    room.phaseEndsAt = room.tasks[0]?.deadlineAt ?? Date.now() + 28_000
  }
  return room
}

export function ritualToolAction(
  code: string,
  playerId: string,
  tool: ToolId,
  payload: Record<string, unknown>,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'ritual') return { error: roomMsg(room, 'Inte ritualfas', 'Not ritual phase') }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) return { error: 'Du kan inte styra' }
  const result = applyToolAction(room, playerId, tool, payload)
  if (result.error) return { error: result.error }
  evaluateTasks(room)
  maybeResolveWave(room)
  touch(room)
  return room
}

export function callCleansingRite(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  const err = startCleansingVote(room, playerId)
  if (err.error) return err
  touch(room)
  return room
}

export function cleansingVote(
  code: string,
  voterId: string,
  targetId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  const err = castCleansingVote(room, voterId, targetId)
  if (err.error) return err
  const vote = room.cleansing
  if (vote && activePlayerIds(room).every((id) => vote.votes[id] !== undefined)) {
    resolveCleansingVote(room)
    finishIfNeeded(room)
  }
  touch(room)
  return room
}

export function endParty(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  room.status = 'finished'
  room.phaseEndsAt = 0
  if (room.outcome === 'ongoing') room.outcome = 'scourgeborn_win'
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

function autoAfflictionAck(room: Room) {
  for (const id of activePlayerIds(room)) room.afflictionSeen[id] = true
  room.status = 'ritual'
  room.phaseEndsAt = room.tasks[0]?.deadlineAt ?? Date.now() + 28_000
}

function autoCleansingVotes(room: Room) {
  const vote = room.cleansing
  if (!vote) return
  for (const id of activePlayerIds(room)) {
    if (vote.votes[id] === undefined) vote.votes[id] = 'skip'
  }
  resolveCleansingVote(room)
  finishIfNeeded(room)
}

export function onPhaseTimeout(room: Room) {
  if (!midGame(room.status) || room.outcome !== 'ongoing') return
  const now = Date.now()
  if (room.phaseEndsAt <= 0 || now < room.phaseEndsAt) {
    if (room.status === 'ritual') {
      evaluateTasks(room)
      const pending = room.tasks.some((t) => !t.completed && !t.failed && now >= t.deadlineAt)
      if (pending) {
        for (const t of room.tasks) {
          if (!t.completed && !t.failed && now >= t.deadlineAt) t.failed = true
        }
        maybeResolveWave(room)
        touch(room)
      }
      if (
        room.mode === 'multi' &&
        !room.afflictionTriggered &&
        room.afflictionAt > 0 &&
        now >= room.afflictionAt
      ) {
        assignAffliction(room)
        touch(room)
      }
    }
    return
  }

  if (room.status === 'affliction') {
    autoAfflictionAck(room)
    touch(room)
    return
  }

  if (room.status === 'cleansing') {
    autoCleansingVotes(room)
    touch(room)
    return
  }

  if (room.status === 'cycle_end') {
    startNextWave(room)
    touch(room)
    return
  }

  if (room.status === 'ritual') {
    for (const t of room.tasks) {
      if (!t.completed && !t.failed) t.failed = true
    }
    maybeResolveWave(room)
    touch(room)
  }
}

export function roomsNeedingTick(): Room[] {
  const now = Date.now()
  const out: Room[] = []
  for (const room of rooms.values()) {
    if (!midGame(room.status) || room.outcome !== 'ongoing') continue
    const phaseDue = room.phaseEndsAt > 0 && now >= room.phaseEndsAt
    const taskDue =
      room.status === 'ritual' && room.tasks.some((t) => !t.completed && !t.failed && now >= t.deadlineAt)
    const afflictionDue =
      room.mode === 'multi' &&
      !room.afflictionTriggered &&
      room.afflictionAt > 0 &&
      now >= room.afflictionAt
    if (phaseDue || taskDue || afflictionDue) out.push(room)
  }
  return out
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

export function redeemParty(
  code: string,
  playerId: string,
  passCode: string,
): { room: Room; pass: PartyPass } | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  const pass = redeemPassCode(passCode)
  if ('error' in pass) return pass
  room.premiumExpiresAt = pass.expiresAt
  touch(room)
  return { room, pass }
}

export function applyPartyToken(code: string, token: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  const pass = lookupPass(token)
  if (!pass) return { error: 'Ogiltigt party-pass' }
  room.premiumExpiresAt = pass.expiresAt
  touch(room)
  return room
}

export function unlockRoomWithPass(code: string, pass: PartyPass) {
  const room = rooms.get(code.toUpperCase())
  if (!room) return
  room.premiumExpiresAt = pass.expiresAt
  touch(room)
}

export function toPublicRoom(room: Room, viewerId?: string | null): PublicRoom {
  const lang = room.language
  const limits = roomLimits(room)
  const viewer = viewerId ? room.players.find((p) => p.id === viewerId) : null
  let notice: string | null = null
  if (room.notice && Date.now() - room.notice.at < NOTICE_TTL_MS) {
    notice = msg(lang, `${room.notice.hostName} är nu värd`, `${room.notice.hostName} is now the host`)
  }

  const showRoles =
    room.status === 'finished' ||
    (room.status === 'affliction' && Boolean(viewerId && room.roles[viewerId] === 'scourgeborn'))

  const yourRole =
    viewerId && room.roles[viewerId]
      ? room.roles[viewerId]!
      : viewerId
        ? 'keeper'
        : null

  const showAffliction =
    room.status === 'affliction' &&
    Boolean(viewerId && room.roles[viewerId] === 'scourgeborn' && !room.afflictionSeen[viewerId])

  const tasks = room.tasks.map((t) => ({
    ...t,
    glyphSequence: viewerId && t.assignedPlayerIds.includes(viewerId) ? t.glyphSequence : [],
    glyphHint: publicGlyphHint(t, lang),
  }))

  const players = room.players.map((p) => {
    if (showRoles && room.roles[p.id]) return { ...p, role: room.roles[p.id] }
    return { ...p }
  })

  return {
    code: room.code,
    hostId: room.hostId,
    players,
    language: room.language,
    status: room.status,
    mode: room.mode,
    premiumTier: tierFromExpiry(room.premiumExpiresAt),
    premiumExpiresAt: room.premiumExpiresAt,
    limits,
    isPublic: Boolean(room.isPublic),
    waitlist: room.waitlist,
    phaseEndsAt: room.phaseEndsAt,
    matrixHealth: room.matrixHealth,
    cycle: room.cycle,
    maxCycles: room.maxCycles,
    afflictionAt: room.afflictionAt,
    afflictionTriggered: room.afflictionTriggered,
    tasks,
    yourTools: viewerId ? (room.playerTools[viewerId] ?? []) : [],
    yourRole: showAffliction ? 'scourgeborn' : yourRole,
    showAffliction,
    scourgeMeter: room.scourgeMeter,
    miasmaActive: room.miasmaUntil > Date.now(),
    cleansing: room.cleansing,
    youCleansingVoted: Boolean(viewerId && room.cleansing?.votes[viewerId] !== undefined),
    soloSurvivalMs: room.soloSurvivalMs,
    outcome: room.outcome,
    lastEvent: lang === 'en' ? room.lastEventEn : room.lastEventSv,
    notice,
    youAreSpectator: Boolean(viewer?.spectator),
    youAreHost: Boolean(viewer && viewer.id === room.hostId),
    minPlayersMulti: MIN_MULTI_PLAYERS,
  }
}

export { AFFLICTION_MODAL_MS, CYCLE_BREAK_MS }
