import { customAlphabet } from 'nanoid'
import {
  MAX_MISSES,
  MIN_MULTI_PLAYERS,
  RACE_TARGET,
  SERIES_TARGET,
  connectedActiveIds,
  deliverVaccine,
  dropItem,
  eventLabel,
  EXTRACT_ITEMS,
  extract,
  incubate,
  initLabGame,
  isCompactLab,
  maxMissesForRoom,
  msg,
  pingStation,
  sendItem,
  synthesize,
  tickLab,
  waveLabel,
  winScoreForRoom,
  type ExtractItemId,
} from './game/lab.js'
import { GAME_LIMITS } from './limits.js'
import { deleteRoomRecord, loadRoomRecord, saveRoomRecord } from './persist.js'
import type {
  Difficulty,
  ItemId,
  Lang,
  PingKind,
  Player,
  PublicRoom,
  RacePartnerSnapshot,
  Room,
  RoomStatus,
} from './types.js'

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

function lobbyDefaults(): Pick<
  Room,
  | 'difficulty'
  | 'seriesEnabled'
  | 'seriesRound'
  | 'seriesWins'
  | 'seriesComplete'
  | 'racePartnerCode'
  | 'raceFinished'
> {
  return {
    difficulty: 'normal',
    seriesEnabled: false,
    seriesRound: 1,
    seriesWins: 0,
    seriesComplete: false,
    racePartnerCode: null,
    raceFinished: null,
  }
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
  | 'eventLog'
  | 'missLog'
  | 'wave4StartedAt'
  | 'yellSv'
  | 'yellEn'
  | 'yellAt'
  | 'yellItemId'
  | 'cureStreak'
  | 'bestStreak'
  | 'activeEvent'
  | 'eventEndsAt'
  | 'disabledStation'
  | 'timersFrozenUntil'
  | 'nextEventAt'
  | 'pendingSpecialKind'
  | 'specialSpawnedThisWave'
  | 'pipeline'
  | 'raceFinished'
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
    eventLog: [],
    missLog: [],
    wave4StartedAt: null,
    yellSv: null,
    yellEn: null,
    yellAt: 0,
    yellItemId: null,
    cureStreak: 0,
    bestStreak: 0,
    activeEvent: null,
    eventEndsAt: 0,
    disabledStation: null,
    timersFrozenUntil: 0,
    nextEventAt: 0,
    pendingSpecialKind: null,
    specialSpawnedThisWave: false,
    pipeline: null,
    raceFinished: null,
  }
}

export function allRooms() {
  return rooms
}

function normalizeStatus(raw: unknown): RoomStatus {
  if (raw === 'playing' || raw === 'gameover' || raw === 'victory') return raw
  return 'lobby'
}

function isTerminal(status: RoomStatus) {
  return status === 'gameover' || status === 'victory'
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
      eventLog: Array.isArray(raw.eventLog) ? raw.eventLog : [],
      missLog: Array.isArray(raw.missLog) ? raw.missLog : [],
      wave4StartedAt: raw.wave4StartedAt ?? null,
      yellSv: raw.yellSv ?? null,
      yellEn: raw.yellEn ?? null,
      yellAt: Number(raw.yellAt) || 0,
      yellItemId: raw.yellItemId ?? null,
      difficulty: raw.difficulty === 'training' || raw.difficulty === 'panic' ? raw.difficulty : 'normal',
      seriesEnabled: Boolean(raw.seriesEnabled),
      seriesRound: Number(raw.seriesRound) || 1,
      seriesWins: Number(raw.seriesWins) || 0,
      seriesComplete: Boolean(raw.seriesComplete),
      racePartnerCode: raw.racePartnerCode ?? null,
      raceFinished: raw.raceFinished === 'won' || raw.raceFinished === 'lost' ? raw.raceFinished : null,
      cureStreak: Number(raw.cureStreak) || 0,
      bestStreak: Number(raw.bestStreak) || 0,
      activeEvent:
        raw.activeEvent === 'blackout' || raw.activeEvent === 'contamination' || raw.activeEvent === 'overtime'
          ? raw.activeEvent
          : null,
      eventEndsAt: Number(raw.eventEndsAt) || 0,
      disabledStation:
        raw.disabledStation === 'extractor' ||
        raw.disabledStation === 'synthesizer' ||
        raw.disabledStation === 'incubator'
          ? raw.disabledStation
          : null,
      timersFrozenUntil: Number(raw.timersFrozenUntil) || 0,
      nextEventAt: Number(raw.nextEventAt) || 0,
      pendingSpecialKind:
        raw.pendingSpecialKind === 'twin' ||
        raw.pendingSpecialKind === 'vip' ||
        raw.pendingSpecialKind === 'mutant'
          ? raw.pendingSpecialKind
          : null,
      specialSpawnedThisWave: Boolean(raw.specialSpawnedThisWave),
      pipeline: raw.pipeline ?? null,
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
    ...lobbyDefaults(),
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
  if (room.status === 'lobby' || isTerminal(room.status)) {
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
      } else if (r.status === 'lobby' || isTerminal(r.status)) {
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

function beginRound(room: Room) {
  const ids = connectedActiveIds(room)
  const labIds = ids.length >= 2 ? ids.filter((id) => id !== room.hostId) : ids
  Object.assign(room, emptyGameFields())
  initLabGame(room, labIds, ids.length >= 2)
}

function checkRaceProgress(room: Room) {
  if (!room.racePartnerCode || room.raceFinished) return
  const partner = rooms.get(room.racePartnerCode)
  if (!partner) return
  if (room.score >= RACE_TARGET && !room.raceFinished) {
    room.raceFinished = 'won'
    if (partner.racePartnerCode === room.code) {
      partner.raceFinished = 'lost'
      partner.yellSv = `Race förlorat mot ${room.code}!`
      partner.yellEn = `Race lost to ${room.code}!`
      partner.yellAt = Date.now()
    }
    room.yellSv = `Race vunnen mot ${partner.code}!`
    room.yellEn = `Race won against ${partner.code}!`
    room.yellAt = Date.now()
    if (!room.eventLog) room.eventLog = []
    room.eventLog.push({
      at: Date.now(),
      kind: 'race',
      sv: `Race vunnen mot ${partner.code}!`,
      en: `Race won against ${partner.code}!`,
    })
    touch(partner)
    onBroadcast?.(partner.code)
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
  const labIds = ids.length >= 2 ? ids.filter((id) => id !== room.hostId) : ids
  if (labIds.length < 1) {
    return { error: roomMsg(room, 'Ingen spelare', 'No players') }
  }
  beginRound(room)
  touch(room)
  return room
}

export function rematch(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'gameover' && room.status !== 'victory') {
    return { error: roomMsg(room, 'Ingen avslutad runda', 'No finished round') }
  }
  if (room.seriesEnabled && room.seriesComplete) {
    room.seriesRound = 1
    room.seriesWins = 0
    room.seriesComplete = false
  }
  for (const p of room.players) p.spectator = false
  promoteWaitlist(room)
  const ids = connectedActiveIds(room)
  if (ids.length < 1) return { error: roomMsg(room, 'Ingen spelare', 'No players') }
  beginRound(room)
  touch(room)
  return room
}

export function setDifficulty(
  code: string,
  playerId: string,
  difficulty: Difficulty,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby') return { error: roomMsg(room, 'Bara i lobbyn', 'Lobby only') }
  room.difficulty = difficulty === 'training' || difficulty === 'panic' ? difficulty : 'normal'
  touch(room)
  return room
}

export function setSeries(
  code: string,
  playerId: string,
  enabled: boolean,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby') return { error: roomMsg(room, 'Bara i lobbyn', 'Lobby only') }
  room.seriesEnabled = Boolean(enabled)
  if (enabled) {
    room.seriesRound = 1
    room.seriesWins = 0
    room.seriesComplete = false
  }
  touch(room)
  return room
}

export function linkRace(
  code: string,
  playerId: string,
  partnerCode: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden' }
  if (room.status !== 'lobby') return { error: roomMsg(room, 'Bara i lobbyn', 'Lobby only') }
  const partner = rooms.get(partnerCode.toUpperCase().trim())
  if (!partner) {
    return { error: roomMsg(room, 'Motståndarrummet hittades inte', 'Opponent room not found') }
  }
  if (partner.code === room.code) {
    return { error: roomMsg(room, 'Ange ett annat rum', 'Enter a different room') }
  }
  if (room.racePartnerCode && room.racePartnerCode !== partner.code) {
    const old = rooms.get(room.racePartnerCode)
    if (old?.racePartnerCode === room.code) old.racePartnerCode = null
  }
  if (partner.racePartnerCode && partner.racePartnerCode !== room.code) {
    const old = rooms.get(partner.racePartnerCode)
    if (old?.racePartnerCode === partner.code) old.racePartnerCode = null
  }
  room.racePartnerCode = partner.code
  partner.racePartnerCode = room.code
  room.raceFinished = null
  partner.raceFinished = null
  touch(room)
  touch(partner)
  onBroadcast?.(partner.code)
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
    case 'ping':
      result = pingStation(
        room,
        playerId,
        String(payload.kind ?? 'need_red') as PingKind,
        typeof payload.message === 'string' ? payload.message : undefined,
      )
      break
    default:
      return { error: 'Okänd action' }
  }
  if (result.error) return { error: result.error }
  if (action === 'deliver') checkRaceProgress(room)
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
  const keepSeries = {
    seriesEnabled: room.seriesEnabled,
    seriesRound: room.seriesRound,
    seriesWins: room.seriesWins,
    seriesComplete: room.seriesComplete,
    difficulty: room.difficulty,
    racePartnerCode: room.racePartnerCode,
  }
  Object.assign(room, emptyGameFields(), keepSeries)
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
      pings: st?.pings ?? 0,
    }
  })

  const seated = seatedPlayers(room).filter((p) => p.connected).length
  const viewerInLab = Boolean(viewerId && room.lab[viewerId])

  const viewerAlert = viewerId && room.alerts ? room.alerts[viewerId] : null
  const alertFresh = viewerAlert && Date.now() - viewerAlert.at < 8000

  let racePartner: RacePartnerSnapshot | null = null
  if (room.racePartnerCode) {
    const partner = rooms.get(room.racePartnerCode)
    if (partner) {
      racePartner = {
        code: partner.code,
        score: partner.score,
        status: partner.status,
        raceFinished: partner.raceFinished,
      }
    }
  }

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
    difficulty: room.difficulty ?? 'normal',
    seriesEnabled: Boolean(room.seriesEnabled),
    seriesRound: room.seriesRound ?? 1,
    seriesWins: room.seriesWins ?? 0,
    seriesComplete: Boolean(room.seriesComplete),
    seriesTarget: SERIES_TARGET,
    racePartnerCode: room.racePartnerCode ?? null,
    racePartner,
    raceFinished: room.raceFinished ?? null,
    raceTarget: RACE_TARGET,
    score: room.score,
    misses: room.misses,
    maxMisses: maxMissesForRoom(room),
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
    youAreTvHost:
      room.mode === 'multi' &&
      room.status === 'playing' &&
      Boolean(viewer && viewer.id === room.hostId && !viewerInLab),
    canStartSolo: seated === 1,
    minPlayersMulti: MIN_MULTI_PLAYERS,
    compactLab: isCompactLab(room),
    wave: room.wave ?? 1,
    waveLabel: waveLabel(room.wave ?? 1, lang),
    alert: alertFresh ? (lang === 'en' ? viewerAlert!.messageEn : viewerAlert!.messageSv) : null,
    alertItemId: alertFresh ? (viewerAlert!.itemId ?? null) : null,
    stats: { ...room.stats },
    eventLog: (room.eventLog ?? []).map((e) => ({
      ...e,
      sv: e.sv,
      en: e.en,
    })),
    missLog: (room.missLog ?? []).map((m) => ({ ...m })),
    gameDurationSec: room.gameStartedAt
      ? Math.max(0, Math.floor((Date.now() - room.gameStartedAt) / 1000))
      : 0,
    winScoreTarget: winScoreForRoom(room),
    cureStreak: room.cureStreak ?? 0,
    bestStreak: room.bestStreak ?? 0,
    activeEvent: room.activeEvent ?? null,
    activeEventLabel: room.activeEvent ? eventLabel(room.activeEvent, lang) : null,
    disabledStation: room.disabledStation ?? null,
    yellMessage:
      room.yellAt && Date.now() - room.yellAt < 5000
        ? lang === 'en'
          ? room.yellEn
          : room.yellSv
        : null,
    yellItemId: room.yellAt && Date.now() - room.yellAt < 5000 ? room.yellItemId : null,
    yellAt: room.yellAt ?? 0,
  }
}

export { MAX_MISSES, TICK_MS } from './game/lab.js'
