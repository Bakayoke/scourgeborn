import { customAlphabet } from 'nanoid'
import {
  STARTING_CURE,
  STARTING_HEART_HP,
  STARTING_RESOURCE_POINTS,
  TIMEOUT_VICTORY_INFECTION,
  applyDefenderAction,
  applyPlagueTurn,
  createInitialRegions,
  evaluateOutcome,
  generateContainOptions,
  generateCureOptions,
  incomeFor,
  labelRegion,
  MIN_PLAYERS,
  pickWinningId,
  REGION_ORDER,
  tally,
  worldInfection,
} from './game/scourge.js'
import {
  limitsFor,
  lookupPass,
  redeemPassCode,
  tierFromExpiry,
  type PartyPass,
} from './premium.js'
import { deleteRoomRecord, loadRoomRecord, saveRoomRecord } from './persist.js'
import type {
  ActionOption,
  GameOutcome,
  Lang,
  MapRegion,
  Player,
  PublicRoom,
  RegionId,
  Room,
  RoomStatus,
  TurnResolution,
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

function roomLimits(room: Room) {
  return limitsFor(tierFromExpiry(room.premiumExpiresAt))
}

function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}

function roomMsg(room: Room, sv: string, en: string) {
  return msg(room.language, sv, en)
}

function uniqueCode(): string {
  let code = makeCode()
  while (rooms.has(code)) code = makeCode()
  return code
}

function isActivePlayer(room: Room, p: Player): boolean {
  if (p.spectator) return false
  if (p.id === room.hostId) return false
  return true
}

function seatedPlayers(room: Room): Player[] {
  return room.players.filter((p) => isActivePlayer(room, p))
}

function connectedPlayers(room: Room): Player[] {
  return seatedPlayers(room).filter((p) => p.connected)
}

function midGame(status: RoomStatus): boolean {
  return status !== 'lobby' && status !== 'finished'
}

function emptyGameFields(): Pick<
  Room,
  | 'phaseEndsAt'
  | 'turnIndex'
  | 'resourcePoints'
  | 'regions'
  | 'cureProgress'
  | 'heartHp'
  | 'containRegionId'
  | 'focusRegionId'
  | 'containLandVotes'
  | 'containActionVotes'
  | 'cureVotes'
  | 'containOptions'
  | 'cureOptions'
  | 'pendingContainLog'
  | 'pendingContainActionId'
  | 'lastResolution'
  | 'outcome'
> {
  return {
    phaseEndsAt: 0,
    turnIndex: 0,
    resourcePoints: STARTING_RESOURCE_POINTS,
    regions: createInitialRegions(),
    cureProgress: STARTING_CURE,
    heartHp: STARTING_HEART_HP,
    containRegionId: null,
    focusRegionId: null,
    containLandVotes: {},
    containActionVotes: {},
    cureVotes: {},
    containOptions: [],
    cureOptions: [],
    pendingContainLog: null,
    pendingContainActionId: null,
    lastResolution: null,
    outcome: 'ongoing',
  }
}

export function allRooms() {
  return rooms
}

function normalizeRegions(raw: unknown): MapRegion[] {
  if (!Array.isArray(raw) || raw.length === 0) return createInitialRegions()
  return createInitialRegions().map((base) => {
    const found = raw.find(
      (r) => r && typeof r === 'object' && (r as MapRegion).id === base.id,
    ) as (MapRegion & { corruption?: number }) | undefined
    if (!found) return base
    const infection =
      typeof found.infection === 'number'
        ? found.infection
        : typeof found.corruption === 'number'
          ? found.corruption
          : base.infection
    return {
      id: base.id,
      infection: Math.max(0, Math.min(100, Number(infection) || 0)),
      quarantined: Boolean(found.quarantined),
    }
  })
}

export function restoreRooms(list: Room[]) {
  for (const raw of list) {
    if (!raw?.code) continue
    if (Array.isArray((raw as { paths?: unknown }).paths)) continue
    const hasNew = 'resourcePoints' in raw || 'regions' in raw
    if (!hasNew) continue

    const legacy = raw as Room & {
      corruptionPoints?: number
      landVotes?: Record<string, string>
      actionVotes?: Record<string, string>
      actionOptions?: ActionOption[]
      focusRegionId?: RegionId | null
    }
    const containRegionId =
      (raw.containRegionId as RegionId) ||
      (legacy.focusRegionId as RegionId) ||
      null
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
      premiumExpiresAt: raw.premiumExpiresAt ?? null,
      isPublic: Boolean(raw.isPublic),
      waitlist: Array.isArray(raw.waitlist) ? raw.waitlist : [],
      phaseEndsAt: Number(raw.phaseEndsAt) || 0,
      turnIndex: Number(raw.turnIndex) || 0,
      resourcePoints:
        Number(raw.resourcePoints) ||
        Number(legacy.corruptionPoints) ||
        STARTING_RESOURCE_POINTS,
      regions: normalizeRegions(raw.regions),
      cureProgress: Number(raw.cureProgress) || STARTING_CURE,
      heartHp: Number(raw.heartHp) || STARTING_HEART_HP,
      containRegionId,
      focusRegionId: containRegionId,
      containLandVotes:
        (raw.containLandVotes && typeof raw.containLandVotes === 'object'
          ? raw.containLandVotes
          : legacy.landVotes && typeof legacy.landVotes === 'object'
            ? legacy.landVotes
            : {}) as Record<string, string>,
      containActionVotes:
        (raw.containActionVotes && typeof raw.containActionVotes === 'object'
          ? raw.containActionVotes
          : legacy.actionVotes && typeof legacy.actionVotes === 'object'
            ? legacy.actionVotes
            : {}) as Record<string, string>,
      cureVotes: raw.cureVotes && typeof raw.cureVotes === 'object' ? raw.cureVotes : {},
      containOptions: Array.isArray(raw.containOptions)
        ? (raw.containOptions as ActionOption[])
        : Array.isArray(legacy.actionOptions)
          ? legacy.actionOptions
          : [],
      cureOptions: Array.isArray(raw.cureOptions) ? (raw.cureOptions as ActionOption[]) : [],
      pendingContainLog: raw.pendingContainLog ?? null,
      pendingContainActionId: raw.pendingContainActionId ?? null,
      lastResolution: normalizeResolution(raw.lastResolution),
      outcome: (raw.outcome as GameOutcome) || 'ongoing',
      notice: raw.notice ?? null,
      updatedAt: raw.updatedAt ?? Date.now(),
    }
    rooms.set(room.code, room)
  }
}

function normalizeResolution(raw: unknown): TurnResolution | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<TurnResolution> & {
    focusRegionId?: RegionId | null
    actionId?: string
    landVoteCounts?: Record<string, number>
    actionVoteCounts?: Record<string, number>
  }
  return {
    turn: Number(r.turn) || 0,
    containRegionId: (r.containRegionId ?? r.focusRegionId ?? null) as RegionId | null,
    containActionId: String(r.containActionId ?? r.actionId ?? ''),
    cureActionId: String(r.cureActionId ?? ''),
    containLog: String(r.containLog ?? ''),
    cureLog: String(r.cureLog ?? ''),
    playerLog: String(r.playerLog ?? ''),
    aiLog: String(r.aiLog ?? ''),
    incomeGained: Number(r.incomeGained) || 0,
    containLandVoteCounts: r.containLandVoteCounts ?? r.landVoteCounts ?? {},
    containActionVoteCounts: r.containActionVoteCounts ?? r.actionVoteCounts ?? {},
    cureVoteCounts: r.cureVoteCounts ?? {},
  }
}

function normalizeStatus(raw: unknown): RoomStatus {
  if (raw === 'council' || raw === 'council_land') return 'council_contain'
  if (raw === 'council_action') return 'council_cure'
  if (
    raw === 'lobby' ||
    raw === 'council_contain' ||
    raw === 'council_cure' ||
    raw === 'resolve' ||
    raw === 'finished'
  ) {
    return raw
  }
  return 'lobby'
}

export function getRoom(code: string) {
  return rooms.get(code.toUpperCase().trim()) ?? null
}

export async function hydrateRoom(code: string): Promise<Room | null> {
  const c = code.toUpperCase().trim()
  if (!c) return null
  const existing = rooms.get(c)
  if (existing) return existing
  const loaded = await loadRoomRecord(c)
  if (!loaded) return null
  restoreRooms([loaded as Room])
  return rooms.get(c) ?? null
}

export async function reloadRoomFromStore(code: string): Promise<Room | null> {
  const c = code.toUpperCase().trim()
  const existing = rooms.get(c)
  const loaded = await loadRoomRecord(c)
  if (!loaded) return null

  if (existing && (existing.updatedAt ?? 0) >= (loaded.updatedAt ?? 0)) {
    return existing
  }

  rooms.delete(c)
  restoreRooms([loaded as Room])
  const room = rooms.get(c)
  if (!room) return null

  const connectedIds = new Set<string>()
  for (const binding of socketToPlayer.values()) {
    if (binding.code === c) connectedIds.add(binding.playerId)
  }
  for (const p of room.players) {
    p.connected = connectedIds.has(p.id)
  }
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
      if (!mine.spectator && mine.id !== room.hostId) mine.name = displayName
      touch(room)
      return { room, playerId: mine.id }
    }
  }

  if (existing && existing.code !== room.code) {
    releaseSocket(socketId)
  }

  if (midGame(room.status)) {
    const playerId = crypto.randomUUID()
    room.players.push({
      id: playerId,
      name: displayName,
      connected: true,
      spectator: true,
    })
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
  const connectedSeated = seatedPlayers(room).filter((p) => p.connected)
  if (maxPlayers > 0 && connectedSeated.length >= maxPlayers) {
    const existingWait = room.waitlist.find(
      (w) => w.name.toLowerCase() === displayName.toLowerCase(),
    )
    if (!existingWait) {
      room.waitlist.push({
        id: crypto.randomUUID(),
        name: displayName,
        at: Date.now(),
      })
      room.waitlist = room.waitlist.slice(-24)
    }
    touch(room)
    return {
      error: roomMsg(
        room,
        'Rummet är fullt — du står på väntlistan',
        'Room is full — you are on the waitlist',
      ),
      code: 'ROOM_FULL',
      roomCode: room.code,
      waitlistCount: room.waitlist.length,
    }
  }

  const playerId = crypto.randomUUID()
  room.players.push({
    id: playerId,
    name: displayName,
    connected: true,
    spectator: false,
  })
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
  if (room.hostId !== playerId) return { error: 'Bara värden kan byta språk' }
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
  if (room.hostId !== playerId) return { error: 'Bara värden kan ändra' }
  if (isPublic && tierFromExpiry(room.premiumExpiresAt) !== 'party') {
    return {
      error: roomMsg(room, 'Öppen lobby kräver Party-pass', 'Open lobby requires a Party pass'),
    }
  }
  room.isPublic = Boolean(isPublic)
  touch(room)
  return room
}

function hostConnected(room: Room): boolean {
  return Boolean(room.players.find((p) => p.id === room.hostId)?.connected)
}

function beginContainCouncil(room: Room, grantIncome: boolean) {
  let income = 0
  if (grantIncome) {
    income = incomeFor(room.regions, room.cureProgress)
    room.resourcePoints += income
  }

  room.turnIndex += 1
  room.status = 'council_contain'
  room.containRegionId = null
  room.focusRegionId = null
  room.containLandVotes = {}
  room.containActionVotes = {}
  room.cureVotes = {}
  room.containOptions = []
  room.cureOptions = []
  room.pendingContainLog = null
  room.pendingContainActionId = null
  room.phaseEndsAt = 0

  if (grantIncome && income > 0 && room.lastResolution) {
    room.lastResolution = { ...room.lastResolution, incomeGained: income }
  }
}

function startCampaign(room: Room): Room | { error: string } {
  const order = connectedPlayers(room)
  if (order.length < MIN_PLAYERS && !(order.length === 0 && hostConnected(room))) {
    return {
      error: roomMsg(
        room,
        'Ingen ansluten spelare — starta solo som värd eller bjud in rådet',
        'No connected player — start solo as host or invite the council',
      ),
    }
  }

  Object.assign(room, emptyGameFields())
  room.outcome = 'ongoing'
  beginContainCouncil(room, false)
  touch(room)
  return room
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
  return startCampaign(room)
}

export function continueTurn(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan fortsätta' }
  if (room.status !== 'resolve') {
    return { error: roomMsg(room, 'Vänta till resolven', 'Wait for the resolve phase') }
  }
  if (room.outcome !== 'ongoing') {
    room.status = 'finished'
    touch(room)
    return room
  }

  const limits = roomLimits(room)
  if (limits.maxRounds > 0 && room.turnIndex >= limits.maxRounds) {
    room.status = 'finished'
    room.outcome =
      worldInfection(room.regions) <= TIMEOUT_VICTORY_INFECTION
        ? 'victory_contained'
        : 'defeat_plague'
    touch(room)
    return room
  }

  beginContainCouncil(room, true)
  touch(room)
  return room
}

export function endParty(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan avsluta' }
  room.status = 'finished'
  room.phaseEndsAt = 0
  room.isPublic = false
  if (room.outcome === 'ongoing') {
    room.outcome = 'defeat_plague'
  }
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

function promoteWaitlist(room: Room) {
  const max = roomLimits(room).maxPlayers
  while (room.waitlist.length > 0) {
    const seated = seatedPlayers(room).filter((p) => p.connected).length
    if (max > 0 && seated >= max) break
    const w = room.waitlist.shift()
    if (!w) break
    room.players.push({
      id: w.id,
      name: w.name,
      connected: false,
      spectator: false,
    })
  }
}

function voterIds(room: Room): string[] {
  const seated = connectedPlayers(room).map((p) => p.id)
  if (seated.length > 0) return seated
  return room.hostId ? [room.hostId] : []
}

function canVote(room: Room, playerId: string): boolean {
  return voterIds(room).includes(playerId)
}

function voteDenied(room: Room): { error: string } {
  return {
    error: roomMsg(
      room,
      'Värden röstar inte när rådet spelar',
      'Host does not vote while the council plays',
    ),
  }
}

function maybeAdvanceContainLand(room: Room) {
  const needed = voterIds(room)
  if (needed.length === 0) return
  if (!needed.every((id) => room.containLandVotes[id] !== undefined)) return

  const hostVote = room.containLandVotes[room.hostId] ?? null
  const winner = pickWinningId(room.containLandVotes, [...REGION_ORDER], hostVote)
  if (!winner) return

  room.containRegionId = winner as RegionId
  room.focusRegionId = room.containRegionId
  room.containActionVotes = {}
  room.containOptions = generateContainOptions({
    lang: room.language,
    points: room.resourcePoints,
    focusRegionId: room.containRegionId,
    regions: room.regions,
    turn: room.turnIndex,
  })
  touch(room)
}

function lockContainAction(room: Room) {
  const focus = room.containRegionId
  if (!focus) return

  const hostVote = room.containActionVotes[room.hostId] ?? null
  const ids = room.containOptions.map((o) => o.id)
  const winningId = pickWinningId(room.containActionVotes, ids, hostVote)
  const option =
    room.containOptions.find((o) => o.id === winningId) ??
    room.containOptions.find((o) => o.affordable) ??
    room.containOptions[0]

  if (!option) {
    room.pendingContainLog = roomMsg(room, 'Ingen smittåtgärd.', 'No contain action.')
    room.pendingContainActionId = ''
  } else {
    const applied = applyDefenderAction(option, focus, {
      points: room.resourcePoints,
      regions: room.regions,
      cureProgress: room.cureProgress,
      heartHp: room.heartHp,
      lang: room.language,
    })
    if ('error' in applied) {
      room.pendingContainLog = applied.error
      room.pendingContainActionId = option.id
    } else {
      room.resourcePoints = applied.points
      room.regions = applied.regions
      room.cureProgress = applied.cureProgress
      room.heartHp = applied.heartHp
      room.pendingContainLog = room.language === 'en' ? applied.logEn : applied.logSv
      room.pendingContainActionId = option.id
    }
  }

  room.status = 'council_cure'
  room.cureVotes = {}
  room.cureOptions = generateCureOptions({
    lang: room.language,
    points: room.resourcePoints,
    turn: room.turnIndex,
  })
  touch(room)
}

function maybeAdvanceContainAction(room: Room) {
  const needed = voterIds(room)
  if (needed.length === 0) return
  if (!needed.every((id) => room.containActionVotes[id] !== undefined)) return
  lockContainAction(room)
}

function lockCureVotes(room: Room) {
  const hostVote = room.cureVotes[room.hostId] ?? null
  const ids = room.cureOptions.map((o) => o.id)
  const winningId = pickWinningId(room.cureVotes, ids, hostVote)
  const option =
    room.cureOptions.find((o) => o.id === winningId) ??
    room.cureOptions.find((o) => o.affordable) ??
    room.cureOptions[0]

  let cureLog = roomMsg(room, 'Ingen botemedelssatsning.', 'No cure spend.')
  let cureActionId = ''

  if (option) {
    const focus = option.targetRegionId ?? room.containRegionId ?? 'heartlands'
    const applied = applyDefenderAction(option, focus, {
      points: room.resourcePoints,
      regions: room.regions,
      cureProgress: room.cureProgress,
      heartHp: room.heartHp,
      lang: room.language,
    })
    if ('error' in applied) {
      cureLog = applied.error
      cureActionId = option.id
    } else {
      room.resourcePoints = applied.points
      room.regions = applied.regions
      room.cureProgress = applied.cureProgress
      room.heartHp = applied.heartHp
      cureLog = room.language === 'en' ? applied.logEn : applied.logSv
      cureActionId = option.id
    }
  }

  const ai = applyPlagueTurn({
    regions: room.regions,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
    turn: room.turnIndex,
  })
  room.regions = ai.regions
  room.cureProgress = ai.cureProgress
  room.heartHp = ai.heartHp

  const containLog = room.pendingContainLog ?? ''
  const containActionId = room.pendingContainActionId ?? ''
  const playerLog = [containLog, cureLog].filter(Boolean).join(' ')

  const resolution: TurnResolution = {
    turn: room.turnIndex,
    containRegionId: room.containRegionId,
    containActionId,
    cureActionId,
    containLog,
    cureLog,
    playerLog,
    aiLog: room.language === 'en' ? ai.logEn : ai.logSv,
    incomeGained: 0,
    containLandVoteCounts: tally(room.containLandVotes),
    containActionVoteCounts: tally(room.containActionVotes),
    cureVoteCounts: tally(room.cureVotes),
  }
  room.lastResolution = resolution
  room.pendingContainLog = null
  room.pendingContainActionId = null
  room.outcome = evaluateOutcome({
    regions: room.regions,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
  })
  room.status = room.outcome === 'ongoing' ? 'resolve' : 'finished'
  room.cureVotes = {}
  room.phaseEndsAt = 0
  touch(room)
}

function maybeAdvanceCure(room: Room) {
  const needed = voterIds(room)
  if (needed.length === 0) return
  if (!needed.every((id) => room.cureVotes[id] !== undefined)) return
  lockCureVotes(room)
}

export function castContainLandVote(
  code: string,
  playerId: string,
  regionId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'council_contain' || room.containRegionId) {
    return { error: roomMsg(room, 'Inte land-röstning för smitta', 'Not contain land voting') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) {
    return { error: roomMsg(room, 'Du kan inte rösta', 'You cannot vote') }
  }
  if (!canVote(room, playerId)) return voteDenied(room)
  if (!REGION_ORDER.includes(regionId as RegionId)) {
    return { error: roomMsg(room, 'Ogiltigt land', 'Invalid land') }
  }
  room.containLandVotes[playerId] = regionId
  touch(room)
  maybeAdvanceContainLand(room)
  return room
}

export function castContainActionVote(
  code: string,
  playerId: string,
  optionId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'council_contain' || !room.containRegionId) {
    return { error: roomMsg(room, 'Inte smittåtgärdsfas', 'Not contain action phase') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) {
    return { error: roomMsg(room, 'Du kan inte rösta', 'You cannot vote') }
  }
  if (!canVote(room, playerId)) return voteDenied(room)
  const option = room.containOptions.find((o) => o.id === optionId)
  if (!option) return { error: roomMsg(room, 'Ogiltigt val', 'Invalid option') }
  if (!option.affordable) {
    return { error: roomMsg(room, 'För dyrt just nu', 'Too expensive right now') }
  }
  room.containActionVotes[playerId] = optionId
  touch(room)
  maybeAdvanceContainAction(room)
  return room
}

export function castCureVote(
  code: string,
  playerId: string,
  optionId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'council_cure') {
    return { error: roomMsg(room, 'Inte botemedelsfas', 'Not cure voting phase') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) {
    return { error: roomMsg(room, 'Du kan inte rösta', 'You cannot vote') }
  }
  if (!canVote(room, playerId)) return voteDenied(room)
  const option = room.cureOptions.find((o) => o.id === optionId)
  if (!option) return { error: roomMsg(room, 'Ogiltigt val', 'Invalid option') }
  if (!option.affordable) {
    return { error: roomMsg(room, 'För dyrt just nu', 'Too expensive right now') }
  }
  room.cureVotes[playerId] = optionId
  touch(room)
  maybeAdvanceCure(room)
  return room
}

/** Back-compat aliases */
export function castLandVote(code: string, playerId: string, regionId: string) {
  return castContainLandVote(code, playerId, regionId)
}

export function castActionVote(code: string, playerId: string, optionId: string) {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status === 'council_cure') return castCureVote(code, playerId, optionId)
  return castContainActionVote(code, playerId, optionId)
}

export function onPhaseTimeout(_room: Room) {}

export function roomsNeedingTick(): Room[] {
  return []
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
  const needed = voterIds(room)

  let notice: string | null = null
  if (room.notice && Date.now() - room.notice.at < NOTICE_TTL_MS) {
    notice = msg(
      lang,
      `${room.notice.hostName} är nu värd`,
      `${room.notice.hostName} is now the host`,
    )
  }

  let voteStep: PublicRoom['voteStep'] = 'none'
  if (room.status === 'council_contain') {
    voteStep = room.containRegionId ? 'contain_action' : 'contain_land'
  } else if (room.status === 'council_cure') {
    voteStep = 'cure'
  }

  const showContainLandCounts =
    Boolean(room.containRegionId) ||
    room.status === 'council_cure' ||
    room.status === 'resolve' ||
    room.status === 'finished'
  const showContainActionCounts =
    room.status === 'council_cure' || room.status === 'resolve' || room.status === 'finished'
  const showCureCounts = room.status === 'resolve' || room.status === 'finished'

  let submittedCount = 0
  let submittedIds: string[] = []
  let youSubmitted = false
  if (voteStep === 'contain_land') {
    submittedIds = Object.keys(room.containLandVotes)
    submittedCount = submittedIds.length
    youSubmitted = Boolean(viewerId && room.containLandVotes[viewerId] !== undefined)
  } else if (voteStep === 'contain_action') {
    submittedIds = Object.keys(room.containActionVotes)
    submittedCount = submittedIds.length
    youSubmitted = Boolean(viewerId && room.containActionVotes[viewerId] !== undefined)
  } else if (voteStep === 'cure') {
    submittedIds = Object.keys(room.cureVotes)
    submittedCount = submittedIds.length
    youSubmitted = Boolean(viewerId && room.cureVotes[viewerId] !== undefined)
  }

  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players,
    language: room.language,
    status: room.status,
    premiumTier: tierFromExpiry(room.premiumExpiresAt),
    premiumExpiresAt: room.premiumExpiresAt,
    limits,
    isPublic: Boolean(room.isPublic),
    waitlist: room.waitlist,
    phaseEndsAt: room.phaseEndsAt,
    turnIndex: room.turnIndex,
    resourcePoints: room.resourcePoints,
    worldInfection: worldInfection(room.regions),
    regions: room.regions,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
    containRegionId: room.containRegionId,
    focusRegionId: room.focusRegionId ?? room.containRegionId,
    containOptions: room.containOptions,
    cureOptions: room.cureOptions,
    voteStep,
    submittedCount,
    submitterCount: needed.length,
    submittedIds,
    youSubmitted,
    yourContainLandVote: viewerId ? room.containLandVotes[viewerId] ?? null : null,
    yourContainActionVote: viewerId ? room.containActionVotes[viewerId] ?? null : null,
    yourCureVote: viewerId ? room.cureVotes[viewerId] ?? null : null,
    containLandVoteCounts: showContainLandCounts ? tally(room.containLandVotes) : null,
    containActionVoteCounts: showContainActionCounts
      ? room.lastResolution?.containActionVoteCounts ?? tally(room.containActionVotes)
      : null,
    cureVoteCounts: showCureCounts
      ? room.lastResolution?.cureVoteCounts ?? tally(room.cureVotes)
      : null,
    lastResolution: room.lastResolution,
    outcome: room.outcome,
    notice,
    youAreSpectator: Boolean(viewer?.spectator),
    youAreHost: Boolean(viewer && viewer.id === room.hostId),
    youCanVote: Boolean(viewerId && needed.includes(viewerId)),
    maxRounds: limits.maxRounds,
  }
}

/** Exported for tests / UI helpers */
export { labelRegion }
