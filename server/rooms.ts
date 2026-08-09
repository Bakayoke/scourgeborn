import { customAlphabet } from 'nanoid'
import {
  STARTING_CORRUPTION_POINTS,
  STARTING_CURE,
  STARTING_HEART_HP,
  applyAiTurn,
  applyPlayerChoice,
  createInitialRegions,
  evaluateOutcome,
  generateVoteOptions,
  incomeFor,
  MIN_PLAYERS,
  pickWinningOption,
  worldCorruption,
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
  GameOutcome,
  Lang,
  MapRegion,
  Player,
  PublicRoom,
  Room,
  RoomStatus,
  SkillId,
  TurnResolution,
  VoteOption,
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
  | 'corruptionPoints'
  | 'regions'
  | 'skills'
  | 'cureProgress'
  | 'heartHp'
  | 'voteOptions'
  | 'votes'
  | 'lastResolution'
  | 'outcome'
> {
  return {
    phaseEndsAt: 0,
    turnIndex: 0,
    corruptionPoints: STARTING_CORRUPTION_POINTS,
    regions: createInitialRegions(),
    skills: ['contagion'],
    cureProgress: STARTING_CURE,
    heartHp: STARTING_HEART_HP,
    voteOptions: [],
    votes: {},
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
    const found = raw.find((r) => r && typeof r === 'object' && (r as MapRegion).id === base.id) as
      | MapRegion
      | undefined
    if (!found) return base
    return {
      id: base.id,
      corruption: Math.max(0, Math.min(100, Number(found.corruption) || 0)),
      quarantined: Boolean(found.quarantined),
    }
  })
}

export function restoreRooms(list: Room[]) {
  for (const raw of list) {
    if (!raw?.code) continue
    // Skip legacy Party Paths emoji rooms
    if (Array.isArray((raw as { paths?: unknown }).paths)) continue
    if (!('regions' in raw) && !('corruptionPoints' in raw)) continue

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
      status: (raw.status as RoomStatus) || 'lobby',
      premiumExpiresAt: raw.premiumExpiresAt ?? null,
      isPublic: Boolean(raw.isPublic),
      waitlist: Array.isArray(raw.waitlist) ? raw.waitlist : [],
      phaseEndsAt: Number(raw.phaseEndsAt) || 0,
      turnIndex: Number(raw.turnIndex) || 0,
      corruptionPoints: Number(raw.corruptionPoints) || STARTING_CORRUPTION_POINTS,
      regions: normalizeRegions(raw.regions),
      skills: Array.isArray(raw.skills) ? (raw.skills as SkillId[]) : ['contagion'],
      cureProgress: Number(raw.cureProgress) || STARTING_CURE,
      heartHp: Number(raw.heartHp) || STARTING_HEART_HP,
      voteOptions: Array.isArray(raw.voteOptions) ? (raw.voteOptions as VoteOption[]) : [],
      votes: raw.votes && typeof raw.votes === 'object' ? raw.votes : {},
      lastResolution: raw.lastResolution ?? null,
      outcome: (raw.outcome as GameOutcome) || 'ongoing',
      notice: raw.notice ?? null,
      updatedAt: raw.updatedAt ?? Date.now(),
    }

    if (midGame(room.status) && room.status !== 'resolve') {
      room.status = 'lobby'
      Object.assign(room, emptyGameFields())
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
  const existing = rooms.get(c)
  if (existing) return existing
  const loaded = await loadRoomRecord(c)
  if (!loaded) return null
  restoreRooms([loaded as Room])
  return rooms.get(c) ?? null
}

export async function reloadRoomFromStore(code: string): Promise<Room | null> {
  const c = code.toUpperCase().trim()
  const loaded = await loadRoomRecord(c)
  if (!loaded) return null
  rooms.delete(c)
  restoreRooms([loaded as Room])
  return rooms.get(c) ?? null
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

function beginCouncil(room: Room, grantIncome: boolean) {
  let income = 0
  if (grantIncome) {
    income = incomeFor(room.skills, room.regions)
    room.corruptionPoints += income
  }

  room.turnIndex += 1
  room.status = 'council'
  room.votes = {}
  room.voteOptions = generateVoteOptions({
    lang: room.language,
    points: room.corruptionPoints,
    skills: room.skills,
    regions: room.regions,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
    turn: room.turnIndex,
  })
  room.phaseEndsAt = 0

  if (grantIncome && income > 0) {
    room.lastResolution = room.lastResolution
      ? { ...room.lastResolution, incomeGained: income }
      : null
  }
}

function hostConnected(room: Room): boolean {
  return Boolean(room.players.find((p) => p.id === room.hostId)?.connected)
}

function startCampaign(room: Room): Room | { error: string } {
  const order = connectedPlayers(room)
  // Solo: host alone is enough. With guests, respect MIN_PLAYERS.
  if (order.length < MIN_PLAYERS && !(order.length === 0 && hostConnected(room))) {
    return {
      error: roomMsg(
        room,
        'Ingen ansluten spelare — starta solo som värd eller bjud in svärmen',
        'No connected player — start solo as host or invite the swarm',
      ),
    }
  }

  Object.assign(room, emptyGameFields())
  room.outcome = 'ongoing'
  beginCouncil(room, false)
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
    room.outcome = worldCorruption(room.regions) >= 50 ? 'victory' : 'defeat_cure'
    touch(room)
    return room
  }

  beginCouncil(room, true)
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
    room.outcome = 'defeat_cure'
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
  // Solo host: when no virus seats are filled, the host casts the council vote.
  if (seated.length === 0 && hostConnected(room)) return [room.hostId]
  return seated
}

function maybeResolveVotes(room: Room) {
  const needed = voterIds(room)
  if (needed.length === 0) return
  const done = needed.every((id) => room.votes[id] !== undefined)
  if (!done) return
  lockVotes(room)
}

function lockVotes(room: Room) {
  const hostVote = room.votes[room.hostId] ?? null
  const winning = pickWinningOption(room.votes, room.voteOptions, hostVote)
  if (!winning) {
    room.status = 'resolve'
    room.lastResolution = {
      turn: room.turnIndex,
      winningOptionId: '',
      playerLog: roomMsg(room, 'Ingen giltig plan.', 'No valid plan.'),
      aiLog: '',
      incomeGained: 0,
      voteCounts: {},
    }
    touch(room)
    return
  }

  const applied = applyPlayerChoice(winning, {
    points: room.corruptionPoints,
    skills: room.skills,
    regions: room.regions,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
    lang: room.language,
  })

  if ('error' in applied) {
    // Fall back: skip effect but still let AI act
    room.lastResolution = {
      turn: room.turnIndex,
      winningOptionId: winning.id,
      playerLog: applied.error,
      aiLog: '',
      incomeGained: 0,
      voteCounts: tally(room.votes),
    }
  } else {
    room.corruptionPoints = applied.points
    room.skills = applied.skills
    room.regions = applied.regions
    room.cureProgress = applied.cureProgress
    room.heartHp = applied.heartHp

    const ai = applyAiTurn({
      regions: room.regions,
      cureProgress: room.cureProgress,
      heartHp: room.heartHp,
      skills: room.skills,
      distracted: applied.distracted,
      turn: room.turnIndex,
    })
    room.regions = ai.regions
    room.cureProgress = ai.cureProgress
    room.heartHp = ai.heartHp

    const resolution: TurnResolution = {
      turn: room.turnIndex,
      winningOptionId: winning.id,
      playerLog: room.language === 'en' ? applied.logEn : applied.logSv,
      aiLog: room.language === 'en' ? ai.logEn : ai.logSv,
      incomeGained: 0,
      voteCounts: tally(room.votes),
    }
    room.lastResolution = resolution
  }

  room.outcome = evaluateOutcome({
    regions: room.regions,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
  })
  room.status = room.outcome === 'ongoing' ? 'resolve' : 'finished'
  room.votes = {}
  room.phaseEndsAt = 0
  touch(room)
}

function tally(votes: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.values(votes)) {
    out[id] = (out[id] ?? 0) + 1
  }
  return out
}

export function castVote(
  code: string,
  playerId: string,
  optionId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'council') {
    return { error: roomMsg(room, 'Inte rådets fas', 'Not council phase') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) {
    return { error: roomMsg(room, 'Du kan inte rösta', 'You cannot vote') }
  }
  const allowed = voterIds(room)
  if (!allowed.includes(playerId)) {
    return {
      error: roomMsg(
        room,
        'Värden röstar inte när svärmen spelar',
        'Host does not vote while the swarm plays',
      ),
    }
  }
  const option = room.voteOptions.find((o) => o.id === optionId)
  if (!option) return { error: roomMsg(room, 'Ogiltigt val', 'Invalid option') }
  if (!option.affordable) {
    return {
      error: roomMsg(room, 'För dyrt just nu', 'Too expensive right now'),
    }
  }
  room.votes[playerId] = optionId
  touch(room)
  maybeResolveVotes(room)
  return room
}

export function onPhaseTimeout(_room: Room) {
  // Turns advance when all voters have cast (no timers).
}

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

  const showCounts = room.status === 'resolve' || room.status === 'finished'

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
    corruptionPoints: room.corruptionPoints,
    worldCorruption: worldCorruption(room.regions),
    regions: room.regions,
    skills: room.skills,
    cureProgress: room.cureProgress,
    heartHp: room.heartHp,
    voteOptions: room.voteOptions,
    submittedCount: Object.keys(room.votes).length,
    submitterCount: needed.length,
    submittedIds: Object.keys(room.votes),
    youSubmitted: Boolean(viewerId && room.votes[viewerId] !== undefined),
    yourVote: viewerId ? room.votes[viewerId] ?? null : null,
    voteCounts: showCounts ? room.lastResolution?.voteCounts ?? null : null,
    lastResolution: room.lastResolution,
    outcome: room.outcome,
    notice,
    youAreSpectator: Boolean(viewer?.spectator),
    youAreHost: Boolean(viewer && viewer.id === room.hostId),
    maxRounds: limits.maxRounds,
  }
}
