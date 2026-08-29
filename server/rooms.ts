import { customAlphabet } from 'nanoid'
import {
  ELECTION_MS,
  MISSION_MS,
  MIN_PLAYERS,
  RESOLUTION_MS,
  ROLES_MS,
  TEAM_VOTE_MS,
  activePlayerIds,
  advanceLeader,
  allRolesRevealed,
  assignRoles,
  beginElectionPhase,
  beginMissionPhase,
  beginResolutionPhase,
  beginTeamVotePhase,
  checkOutcome,
  connectedActiveIds,
  resolveMissionVotes,
  shuffleIds,
  teamVotePassed,
} from './game/scourgeborn.js'
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
  MissionResult,
  MissionVote,
  Player,
  PublicRoom,
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

function seatedPlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.spectator)
}

function midGame(status: RoomStatus): boolean {
  return status !== 'lobby' && status !== 'finished'
}

function emptyGameFields(): Pick<
  Room,
  | 'phaseEndsAt'
  | 'leaderOrder'
  | 'leaderIndex'
  | 'expeditionLeaderId'
  | 'roles'
  | 'roleRevealed'
  | 'proposedTeamIds'
  | 'teamVotes'
  | 'missionVotes'
  | 'scores'
  | 'failedElectionStreak'
  | 'missionRound'
  | 'lastMissionResult'
  | 'outcome'
> {
  return {
    phaseEndsAt: 0,
    leaderOrder: [],
    leaderIndex: 0,
    expeditionLeaderId: null,
    roles: {},
    roleRevealed: {},
    proposedTeamIds: [],
    teamVotes: {},
    missionVotes: {},
    scores: { cleanses: 0, infections: 0 },
    failedElectionStreak: 0,
    missionRound: 0,
    lastMissionResult: null,
    outcome: 'ongoing',
  }
}

function voterIds(room: Room): string[] {
  const connected = connectedActiveIds(room)
  if (connected.length > 0) return connected
  return activePlayerIds(room)
}

export function allRooms() {
  return rooms
}

function normalizeStatus(raw: unknown): RoomStatus {
  const valid: RoomStatus[] = [
    'lobby',
    'roles',
    'election',
    'team_vote',
    'mission',
    'resolution',
    'finished',
  ]
  if (typeof raw === 'string' && valid.includes(raw as RoomStatus)) {
    return raw as RoomStatus
  }
  return 'lobby'
}

function normalizeScores(raw: unknown): Room['scores'] {
  if (!raw || typeof raw !== 'object') return { cleanses: 0, infections: 0 }
  const s = raw as Partial<Room['scores']>
  return {
    cleanses: Number(s.cleanses) || 0,
    infections: Number(s.infections) || 0,
  }
}

function normalizeMissionResult(raw: unknown): MissionResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<MissionResult>
  if (!Array.isArray(r.teamIds)) return null
  return {
    round: Number(r.round) || 0,
    teamIds: r.teamIds.map(String),
    success: Boolean(r.success),
    infectCount: Number(r.infectCount) || 0,
  }
}

export function restoreRooms(list: Room[]) {
  for (const raw of list) {
    if (!raw?.code) continue
    if (!('roles' in raw) && !('leaderOrder' in raw)) continue

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
      notice: raw.notice ?? null,
      updatedAt: raw.updatedAt ?? Date.now(),
      phaseEndsAt: Number(raw.phaseEndsAt) || 0,
      leaderOrder: Array.isArray(raw.leaderOrder) ? raw.leaderOrder.map(String) : [],
      leaderIndex: Number(raw.leaderIndex) || 0,
      expeditionLeaderId: raw.expeditionLeaderId ?? null,
      roles: (raw.roles as Room['roles']) ?? {},
      roleRevealed: (raw.roleRevealed as Room['roleRevealed']) ?? {},
      proposedTeamIds: Array.isArray(raw.proposedTeamIds)
        ? raw.proposedTeamIds.map(String)
        : [],
      teamVotes: (raw.teamVotes as Room['teamVotes']) ?? {},
      missionVotes: (raw.missionVotes as Room['missionVotes']) ?? {},
      scores: normalizeScores(raw.scores),
      failedElectionStreak: Number(raw.failedElectionStreak) || 0,
      missionRound: Number(raw.missionRound) || 0,
      lastMissionResult: normalizeMissionResult(raw.lastMissionResult),
      outcome: (raw.outcome as GameOutcome) || 'ongoing',
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
      if (!mine.spectator) mine.name = displayName
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
  const connectedSeated = seatedPlayers(room).filter((p) => p.connected).length
  if (maxPlayers > 0 && connectedSeated >= maxPlayers) {
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

function startDeductionGame(room: Room): Room | { error: string } {
  const ids = connectedActiveIds(room)
  if (ids.length < MIN_PLAYERS) {
    return {
      error: roomMsg(
        room,
        `Minst ${MIN_PLAYERS} spelare krävs`,
        `At least ${MIN_PLAYERS} players required`,
      ),
    }
  }

  Object.assign(room, emptyGameFields())
  room.roles = assignRoles(ids)
  room.leaderOrder = shuffleIds(ids)
  room.leaderIndex = 0
  room.expeditionLeaderId = room.leaderOrder[0] ?? null
  room.status = 'roles'
  room.roleRevealed = {}
  room.phaseEndsAt = Date.now() + ROLES_MS
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
  return startDeductionGame(room)
}

export function revealRole(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'roles') {
    return { error: roomMsg(room, 'Inte röljningsfas', 'Not role reveal phase') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) {
    return { error: roomMsg(room, 'Du kan inte avslöja', 'You cannot reveal') }
  }
  if (!room.roles[playerId]) {
    return { error: roomMsg(room, 'Du är inte med i spelet', 'You are not in the game') }
  }
  room.roleRevealed[playerId] = true
  touch(room)
  if (allRolesRevealed(room)) {
    beginElectionPhase(room)
    touch(room)
  }
  return room
}

export function proposeTeam(
  code: string,
  playerId: string,
  partnerId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'election') {
    return { error: roomMsg(room, 'Inte expeditionsfas', 'Not election phase') }
  }
  if (room.expeditionLeaderId !== playerId) {
    return { error: roomMsg(room, 'Bara ledaren kan välja team', 'Only the leader can pick the team') }
  }
  if (partnerId === playerId) {
    return { error: roomMsg(room, 'Välj en annan spelare', 'Pick another player') }
  }
  const partner = room.players.find((p) => p.id === partnerId && !p.spectator)
  if (!partner) {
    return { error: roomMsg(room, 'Ogiltig spelare', 'Invalid player') }
  }
  room.proposedTeamIds = [playerId, partnerId]
  beginTeamVotePhase(room)
  touch(room)
  return room
}

function resolveTeamVote(room: Room) {
  const voters = voterIds(room)
  const passed = teamVotePassed(room.teamVotes, voters)
  if (passed) {
    room.failedElectionStreak = 0
    beginMissionPhase(room)
    touch(room)
    return
  }

  room.failedElectionStreak += 1
  room.outcome = checkOutcome(room.scores, room.failedElectionStreak)
  if (room.outcome !== 'ongoing') {
    room.status = 'finished'
    room.phaseEndsAt = 0
    touch(room)
    return
  }

  advanceLeader(room)
  beginElectionPhase(room)
  touch(room)
}

export function voteTeam(
  code: string,
  playerId: string,
  approve: boolean,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'team_vote') {
    return { error: roomMsg(room, 'Inte teamomröstning', 'Not team vote phase') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.spectator) {
    return { error: roomMsg(room, 'Du kan inte rösta', 'You cannot vote') }
  }
  if (!voterIds(room).includes(playerId)) {
    return { error: roomMsg(room, 'Du kan inte rösta', 'You cannot vote') }
  }
  room.teamVotes[playerId] = approve
  touch(room)

  const voters = voterIds(room)
  if (voters.every((id) => room.teamVotes[id] !== undefined)) {
    resolveTeamVote(room)
  }
  return room
}

function resolveMission(room: Room) {
  const teamIds = [...room.proposedTeamIds]
  const { success, infectCount } = resolveMissionVotes(room, teamIds)
  const result: MissionResult = {
    round: room.missionRound + 1,
    teamIds,
    success,
    infectCount,
  }

  if (result.success) room.scores.cleanses += 1
  else room.scores.infections += 1
  room.missionRound = result.round
  room.outcome = checkOutcome(room.scores, room.failedElectionStreak)

  if (room.outcome !== 'ongoing') {
    room.status = 'finished'
    room.lastMissionResult = result
    room.phaseEndsAt = 0
    touch(room)
    return
  }

  beginResolutionPhase(room, result)
  touch(room)
}

export function voteMission(
  code: string,
  playerId: string,
  vote: MissionVote,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'mission') {
    return { error: roomMsg(room, 'Inte uppdragsfas', 'Not mission phase') }
  }
  if (!room.proposedTeamIds.includes(playerId)) {
    return { error: roomMsg(room, 'Du är inte på uppdraget', 'You are not on the mission') }
  }
  const role = room.roles[playerId]
  if (role === 'innocent' && vote === 'infect') {
    return {
      error: roomMsg(
        room,
        'Oskuldiga måste välja Rensa',
        'Innocents must choose Cleanse',
      ),
    }
  }
  room.missionVotes[playerId] = vote
  touch(room)

  const team = room.proposedTeamIds
  if (team.every((id) => room.missionVotes[id] !== undefined)) {
    resolveMission(room)
  }
  return room
}

function advanceFromResolution(room: Room) {
  if (room.outcome !== 'ongoing') {
    room.status = 'finished'
    room.phaseEndsAt = 0
    return
  }
  advanceLeader(room)
  beginElectionPhase(room)
}

export function ackResolution(code: string, _playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rum saknas' }
  if (room.status !== 'resolution') {
    return { error: roomMsg(room, 'Inte resultatfas', 'Not resolution phase') }
  }
  advanceFromResolution(room)
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
    room.outcome = 'scourgeborn_win'
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

function autoProposeTeam(room: Room) {
  const leaderId = room.expeditionLeaderId
  if (!leaderId) return
  const candidates = activePlayerIds(room).filter((id) => id !== leaderId)
  if (candidates.length === 0) return
  const partnerId = candidates[Math.floor(Math.random() * candidates.length)]!
  room.proposedTeamIds = [leaderId, partnerId]
  beginTeamVotePhase(room)
}

function autoFillTeamVotes(room: Room) {
  for (const id of voterIds(room)) {
    if (room.teamVotes[id] === undefined) {
      room.teamVotes[id] = Math.random() < 0.65
    }
  }
  resolveTeamVote(room)
}

function autoFillMissionVotes(room: Room) {
  for (const id of room.proposedTeamIds) {
    if (room.missionVotes[id] !== undefined) continue
    const role = room.roles[id]
    room.missionVotes[id] = role === 'scourgeborn' && Math.random() < 0.4 ? 'infect' : 'cleanse'
  }
  resolveMission(room)
}

function autoRevealRoles(room: Room) {
  for (const id of activePlayerIds(room)) {
    room.roleRevealed[id] = true
  }
  beginElectionPhase(room)
}

export function onPhaseTimeout(room: Room) {
  if (!midGame(room.status) || room.outcome !== 'ongoing') return

  const now = Date.now()
  if (room.phaseEndsAt <= 0 || now < room.phaseEndsAt) return

  if (room.status === 'roles') {
    autoRevealRoles(room)
    touch(room)
    return
  }

  if (room.status === 'election') {
    autoProposeTeam(room)
    touch(room)
    return
  }

  if (room.status === 'team_vote') {
    autoFillTeamVotes(room)
    touch(room)
    return
  }

  if (room.status === 'mission') {
    autoFillMissionVotes(room)
    touch(room)
    return
  }

  if (room.status === 'resolution') {
    advanceFromResolution(room)
    touch(room)
  }
}

export function roomsNeedingTick(): Room[] {
  const now = Date.now()
  const out: Room[] = []
  for (const room of rooms.values()) {
    if (!midGame(room.status) || room.outcome !== 'ongoing') continue
    if (room.phaseEndsAt > 0 && now >= room.phaseEndsAt) out.push(room)
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
  const activeIds = activePlayerIds(room)
  const voters = voterIds(room)
  const teamVoteSubmittedIds = room.status === 'team_vote' ? Object.keys(room.teamVotes) : []
  const missionSubmittedIds = room.status === 'mission' ? Object.keys(room.missionVotes) : []

  let notice: string | null = null
  if (room.notice && Date.now() - room.notice.at < NOTICE_TTL_MS) {
    notice = msg(
      lang,
      `${room.notice.hostName} är nu värd`,
      `${room.notice.hostName} is now the host`,
    )
  }

  const rolesRevealedCount = activeIds.filter((id) => room.roleRevealed[id]).length
  const youRoleRevealed = Boolean(viewerId && room.roleRevealed[viewerId])
  const yourRole =
    viewerId && youRoleRevealed && room.roles[viewerId] ? room.roles[viewerId]! : null

  const showAllRoles = room.status === 'finished' && room.outcome !== 'ongoing'
  const players = room.players.map((p) => {
    if (showAllRoles && room.roles[p.id]) {
      return { ...p, role: room.roles[p.id] }
    }
    return { ...p }
  })

  return {
    code: room.code,
    hostId: room.hostId,
    players,
    language: room.language,
    status: room.status,
    premiumTier: tierFromExpiry(room.premiumExpiresAt),
    premiumExpiresAt: room.premiumExpiresAt,
    limits,
    isPublic: Boolean(room.isPublic),
    waitlist: room.waitlist,
    phaseEndsAt: room.phaseEndsAt,
    expeditionLeaderId: room.expeditionLeaderId,
    proposedTeamIds: room.proposedTeamIds,
    scores: { ...room.scores },
    failedElectionStreak: room.failedElectionStreak,
    missionRound: room.missionRound,
    lastMissionResult: room.lastMissionResult,
    outcome: room.outcome,
    notice,
    youAreSpectator: Boolean(viewer?.spectator),
    youAreHost: Boolean(viewer && viewer.id === room.hostId),
    youAreLeader: Boolean(viewerId && viewerId === room.expeditionLeaderId),
    youOnMission: Boolean(viewerId && room.proposedTeamIds.includes(viewerId)),
    yourRole,
    youRoleRevealed,
    rolesRevealedCount,
    rolesTotal: activeIds.length,
    teamVoteSubmittedCount: teamVoteSubmittedIds.length,
    teamVoteTotal: voters.length,
    youTeamVoted: Boolean(viewerId && room.teamVotes[viewerId] !== undefined),
    yourTeamVote: viewerId ? (room.teamVotes[viewerId] ?? null) : null,
    teamVoteSubmittedIds,
    missionSubmittedCount: missionSubmittedIds.length,
    missionSubmittedIds,
    youMissionVoted: Boolean(viewerId && room.missionVotes[viewerId] !== undefined),
    minPlayers: MIN_PLAYERS,
  }
}

/** Phase duration constants for tests */
export { ELECTION_MS, MISSION_MS, RESOLUTION_MS, ROLES_MS, TEAM_VOTE_MS }
