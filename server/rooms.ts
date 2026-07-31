import { customAlphabet } from 'nanoid'
import { CLASSES } from './campaign/classes.js'
import { START_NODE, getNode } from './campaign/emberwood.js'
import {
  availableChoices,
  enterNode,
  loc,
  resolveVote,
} from './campaign/resolve.js'
import {
  limitsFor,
  lookupPass,
  redeemPassCode,
  tierFromExpiry,
} from './premium.js'
import type {
  AdventureMode,
  Lang,
  Player,
  PlayerClass,
  PublicRoom,
  Room,
  VoteReveal,
} from './types.js'

const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ', 4)
const DISCONNECT_GRACE_MS = 60_000
const HOST_TRANSFER_AFTER_MS = 90_000
const DEFAULT_VOTE_SEC = 60
const RESOLVE_MS = 5_500
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000
const PARTY_HP_BASE = 40
const NOTICE_TTL_MS = 45_000

/** Allowed host choices: 0 = discuss (no timer) */
export const VOTE_TIMER_OPTIONS = [0, 30, 60, 90, 120, 180] as const

function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}

function roomMsg(room: Room, sv: string, en: string) {
  return msg(room.language, sv, en)
}

/** Adventurer = plays a character (votes + class). Excludes spectators and DM-only host. */
function isAdventurer(room: Room, p: Player): boolean {
  if (p.spectator) return false
  if (p.id === room.hostId && !room.hostPlays) return false
  return true
}

function eligibleVoters(room: Room) {
  return room.players.filter((p) => p.connected && isAdventurer(room, p) && p.classId)
}

function connectedAdventurers(room: Room) {
  return room.players.filter((p) => p.connected && isAdventurer(room, p))
}

function normalizeVoteSeconds(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_VOTE_SEC
  const sec = Math.round(n)
  return (VOTE_TIMER_OPTIONS as readonly number[]).includes(sec) ? sec : DEFAULT_VOTE_SEC
}

const MODE_START: Record<AdventureMode, string> = {
  story: START_NODE,
  orcs: 'forest_edge',
  dragon: 'dragon_approach',
  chaos: START_NODE,
}

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
  if (room) room.updatedAt = Date.now()
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

function uniqueCode(): string {
  let code = makeCode()
  while (rooms.has(code)) code = makeCode()
  return code
}

export function allRooms() {
  return rooms
}

export function restoreRooms(list: Room[]) {
  for (const room of list) {
    if (!room?.code) continue
    rooms.set(room.code, {
      ...room,
      statusBeforePause: room.statusBeforePause ?? null,
      adventureMode: room.adventureMode ?? 'story',
      voteSeconds: normalizeVoteSeconds(room.voteSeconds ?? DEFAULT_VOTE_SEC),
      voteRemainingMs: room.voteRemainingMs ?? 0,
      dmNote: room.dmNote ?? '',
      secretBallot: Boolean(room.secretBallot),
      hostPlays: Boolean(room.hostPlays),
      isPublic: Boolean(room.isPublic),
      adventureLog: Array.isArray(room.adventureLog) ? room.adventureLog : [],
      notice: room.notice ?? null,
      players: room.players.map((p) => ({
        ...p,
        spectator: Boolean(p.spectator),
      })),
    })
  }
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
  const limits = limitsFor(tierFromExpiry(premiumExpiresAt))
  const code = uniqueCode()
  const playerId = crypto.randomUUID()
  const host: Player = {
    id: playerId,
    name: hostName.trim().slice(0, 20) || (language === 'en' ? 'Host' : 'Värd'),
    connected: true,
    classId: null,
    spectator: false,
  }

  const room: Room = {
    code,
    hostId: playerId,
    players: [host],
    language: language === 'en' ? 'en' : 'sv',
    status: 'lobby',
    statusBeforePause: null,
    premiumExpiresAt,
    isPublic: Boolean(wantPublic && isParty),
    waitlist: [],
    nodeId: START_NODE,
    partyHp: PARTY_HP_BASE,
    partyHpMax: PARTY_HP_BASE,
    flags: {},
    campaignMode: limits.campaignMode,
    adventureMode: 'story',
    voteSeconds: DEFAULT_VOTE_SEC,
    secretBallot: false,
    hostPlays: false,
    votes: {},
    voteEndsAt: 0,
    voteRemainingMs: 0,
    lastResolve: null,
    adventureLog: [],
    activeChoiceIds: [],
    combatEnemyHp: null,
    dmNote: '',
    notice: null,
    updatedAt: Date.now(),
  }

  rooms.set(code, room)
  socketToPlayer.set(socketId, { code, playerId })
  touch(room)
  return { room, playerId }
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

  const midGame =
    room.status !== 'lobby' && room.status !== 'class_pick' && room.status !== 'finished'

  const displayName =
    name.trim().slice(0, 20) || (room.language === 'en' ? 'Player' : 'Spelare')

  const maxPlayers = roomLimits(room).maxPlayers
  const seated = room.players.filter((p) => isAdventurer(room, p))
  if (maxPlayers > 0 && seated.length >= maxPlayers && !midGame) {
    const existing = room.waitlist.find(
      (w) => w.name.toLowerCase() === displayName.toLowerCase(),
    )
    if (!existing) {
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
        maxPlayers <= 5
          ? `Rummet är fullt (max ${maxPlayers} gratis). Du står i kö (${room.waitlist.length}). Lås upp Party för fler.`
          : `Rummet är fullt (max ${maxPlayers}). Du står i kö (${room.waitlist.length}).`,
        maxPlayers <= 5
          ? `Room is full (max ${maxPlayers} free). You're on the waitlist (${room.waitlist.length}). Unlock Party for more.`
          : `Room is full (max ${maxPlayers}). You're on the waitlist (${room.waitlist.length}).`,
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
    classId: null,
    spectator: midGame,
  })
  room.waitlist = room.waitlist.filter((w) => w.name.toLowerCase() !== displayName.toLowerCase())
  socketToPlayer.set(socketId, { code: room.code, playerId })
  touch(room)
  return { room, playerId }
}

export function getBinding(socketId: string) {
  return socketToPlayer.get(socketId)
}

export function getRoom(code: string) {
  return rooms.get(code)
}

export function previewRoom(code: string): {
  code: string
  language: Lang
  status: Room['status']
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
} | null {
  const room = rooms.get(code.toUpperCase().trim())
  if (!room) return null
  const lang = room.language
  const inLobby =
    room.status === 'lobby' || room.status === 'class_pick' || room.status === 'finished'
  return {
    code: room.code,
    language: lang,
    status: room.status,
    canPickClass: inLobby,
    spectateOnly: !inLobby,
    playerCount: room.players.filter((p) => p.connected).length,
    classes: CLASSES.map((c) => ({
      id: c.id,
      name: loc(c.name, lang),
      blurb: loc(c.blurb, lang),
      might: c.might,
      arcana: c.arcana,
      cunning: c.cunning,
      ability: loc(c.ability, lang),
    })),
  }
}

export function setLanguage(code: string, playerId: string, language: Lang): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan ändra språk', 'Only the host can change language') }
  }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Kan inte byta språk mid-spel', 'Cannot change language mid-game') }
  }
  room.language = language === 'en' ? 'en' : 'sv'
  touch(room)
  return room
}

export function pickClass(
  code: string,
  playerId: string,
  classId: PlayerClass,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Klassval är stängt', 'Class pick is closed') }
  }
  if (!CLASSES.some((c) => c.id === classId)) {
    return { error: roomMsg(room, 'Ogiltig klass', 'Invalid class') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: roomMsg(room, 'Spelaren hittades inte', 'Player not found') }
  if (player.spectator) {
    return { error: roomMsg(room, 'Åskådare kan inte välja klass', 'Spectators cannot pick a class') }
  }
  if (player.id === room.hostId && !room.hostPlays) {
    return {
      error: roomMsg(
        room,
        'Slå på ”Jag spelar med” för att välja klass',
        'Turn on “I play too” to pick a class',
      ),
    }
  }
  player.classId = classId
  if (room.status === 'lobby') room.status = 'class_pick'
  touch(room)
  return room
}

export function startAdventure(
  code: string,
  playerId: string,
  mode: AdventureMode = 'story',
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan starta', 'Only the host can start') }
  }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Äventyret har redan startat', 'Adventure already started') }
  }

  const connected = connectedAdventurers(room)
  if (connected.length < 1) {
    return {
      error: roomMsg(
        room,
        'Behöver minst en äventyrare (värden kan vara DM)',
        'Need at least one adventurer (host can stay as DM)',
      ),
    }
  }
  const missing = connected.filter((p) => !p.classId)
  if (missing.length > 0) {
    return {
      error: roomMsg(
        room,
        'Alla äventyrare måste välja klass',
        'All adventurers must pick a class',
      ),
    }
  }

  const adventureMode = normalizeMode(mode)
  if (adventureMode === 'dragon' && roomLimits(room).campaignMode !== 'full') {
    return {
      error: roomMsg(room, 'Drakläget kräver Party-pass', 'Dragon mode needs Party pass'),
    }
  }

  const limits = roomLimits(room)
  room.campaignMode = adventureMode === 'dragon' ? 'full' : limits.campaignMode
  room.adventureMode = adventureMode
  room.partyHp = PARTY_HP_BASE + connected.length * 4
  room.partyHpMax = room.partyHp
  room.flags = adventureMode === 'chaos' ? { chaos: true } : {}
  room.lastResolve = null
  room.adventureLog = []
  room.dmNote = ''
  room.notice = null
  room.isPublic = false
  enterNode(room, MODE_START[adventureMode])
  beginVoting(room)
  touch(room)
  return room
}

function normalizeMode(mode: unknown): AdventureMode {
  if (mode === 'orcs' || mode === 'dragon' || mode === 'chaos') return mode
  return 'story'
}

export function setVoteSeconds(
  code: string,
  playerId: string,
  seconds: number,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan ändra tid', 'Only the host can change the timer') }
  }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Kan bara ändras i lobby', 'Can only be changed in lobby') }
  }
  room.voteSeconds = normalizeVoteSeconds(seconds)
  touch(room)
  return room
}

export function setSecretBallot(
  code: string,
  playerId: string,
  enabled: boolean,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return {
      error: roomMsg(room, 'Bara värden kan ändra hemlig omröstning', 'Only the host can change secret ballot'),
    }
  }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Kan bara ändras i lobby', 'Can only be changed in lobby') }
  }
  room.secretBallot = Boolean(enabled)
  touch(room)
  return room
}

export function setHostPlays(
  code: string,
  playerId: string,
  plays: boolean,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return {
      error: roomMsg(room, 'Bara värden kan ändra DM-läge', 'Only the host can change DM mode'),
    }
  }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Kan bara ändras i lobby', 'Can only be changed in lobby') }
  }
  room.hostPlays = Boolean(plays)
  const host = room.players.find((p) => p.id === room.hostId)
  if (host && !room.hostPlays) {
    host.classId = null
  }
  touch(room)
  return room
}

export function setPublicLobby(
  code: string,
  playerId: string,
  isPublic: boolean,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return {
      error: roomMsg(room, 'Bara värden kan öppna lobbyn', 'Only the host can open the lobby'),
    }
  }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return {
      error: roomMsg(room, 'Kan bara öppnas i lobby', 'Can only be opened in lobby'),
    }
  }
  if (isPublic && tierFromExpiry(room.premiumExpiresAt) !== 'party') {
    return {
      error: roomMsg(
        room,
        'Party-pass krävs för öppna lobbyer',
        'Party pass required for open lobbies',
      ),
    }
  }
  room.isPublic = Boolean(isPublic)
  touch(room)
  return room
}

export type PublicLobbyCard = {
  code: string
  language: Lang
  playerCount: number
  adventurerCount: number
  hostName: string
  hostPlays: boolean
  voteSeconds: number
  updatedAt: number
}

export function listPublicLobbies(opts?: { language?: Lang | null; limit?: number }): PublicLobbyCard[] {
  const limit = Math.min(40, Math.max(1, opts?.limit ?? 24))
  const langFilter = opts?.language
  const now = Date.now()
  const cards: PublicLobbyCard[] = []
  for (const room of rooms.values()) {
    if (!room.isPublic) continue
    if (room.status !== 'lobby' && room.status !== 'class_pick') continue
    if (tierFromExpiry(room.premiumExpiresAt) !== 'party') continue
    // Drop stale listings (host idle > 45 min)
    if (now - (room.updatedAt || 0) > 45 * 60 * 1000) continue
    if (langFilter && room.language !== langFilter) continue
    const host = room.players.find((p) => p.id === room.hostId)
    cards.push({
      code: room.code,
      language: room.language,
      playerCount: room.players.filter((p) => p.connected).length,
      adventurerCount: connectedAdventurers(room).length,
      hostName: host?.name ?? (room.language === 'en' ? 'Host' : 'Värd'),
      hostPlays: Boolean(room.hostPlays),
      voteSeconds: room.voteSeconds,
      updatedAt: room.updatedAt,
    })
  }
  cards.sort((a, b) => b.updatedAt - a.updatedAt)
  return cards.slice(0, limit)
}

function beginVoting(room: Room) {
  const node = getNode(room.nodeId)
  if (!node) return
  if (node.ending) {
    room.status = 'finished'
    room.voteEndsAt = 0
    room.activeChoiceIds = []
    return
  }
  const choices = availableChoices(room, node)
  room.activeChoiceIds = choices.map((c) => c.id)
  room.votes = {}
  room.status = 'voting'
  // 0 = discuss freely — no auto timeout
  room.voteEndsAt = room.voteSeconds > 0 ? Date.now() + room.voteSeconds * 1000 : 0
}

export function castVote(
  code: string,
  playerId: string,
  choiceId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.status !== 'voting') {
    return { error: roomMsg(room, 'Ingen omröstning pågår', 'No vote in progress') }
  }
  if (!room.activeChoiceIds.includes(choiceId)) {
    return { error: roomMsg(room, 'Ogiltigt val', 'Invalid choice') }
  }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || !player.connected) {
    return { error: roomMsg(room, 'Du är inte med i spelet', 'You are not in the game') }
  }
  if (player.spectator || !player.classId || !isAdventurer(room, player)) {
    return {
      error: roomMsg(
        room,
        'Bara äventyrare kan rösta (DM leder spelet)',
        'Only adventurers can vote (the DM runs the game)',
      ),
    }
  }
  room.votes[playerId] = choiceId
  touch(room)

  // Auto-lock when everyone eligible has voted
  const voters = eligibleVoters(room)
  if (voters.length > 0 && voters.every((p) => room.votes[p.id])) {
    return lockVotes(code, room.hostId)
  }
  return room
}

export function lockVotes(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.status !== 'voting') {
    return { error: roomMsg(room, 'Ingen omröstning pågår', 'No vote in progress') }
  }
  if (room.hostId !== playerId) {
    const voters = eligibleVoters(room)
    const allVoted = voters.length > 0 && voters.every((p) => room.votes[p.id])
    if (!allVoted) {
      return { error: roomMsg(room, 'Bara värden kan låsa tidigt', 'Only the host can lock early') }
    }
  }

  const node = getNode(room.nodeId)
  const choices = node ? availableChoices(room, node) : []
  const choiceMap = new Map(choices.map((c) => [c.id, c]))
  const voteReveal: VoteReveal[] = []
  for (const [pid, choiceId] of Object.entries(room.votes)) {
    const player = room.players.find((p) => p.id === pid)
    const choice = choiceMap.get(choiceId)
    if (!player || !choice) continue
    voteReveal.push({
      playerId: pid,
      playerName: player.name,
      choiceId,
      choiceText: choice.text,
    })
  }

  const result = resolveVote(room)
  if ('error' in result) return result

  room.lastResolve = {
    ...result.lastResolve,
    voteReveal,
  }
  room.adventureLog = [
    ...(room.adventureLog ?? []),
    {
      nodeId: room.nodeId,
      title: node?.title ?? { sv: '', en: '' },
      winningText: result.lastResolve.winningText,
      closeRace: result.lastResolve.closeRace,
      heroBanner: result.lastResolve.heroBanner,
    },
  ].slice(-40)
  room.status = 'resolve'
  room.voteEndsAt = Date.now() + RESOLVE_MS
  room.votes = {}
  room.dmNote = ''

  room.flags.__pendingNext = result.nextNodeId
  room.flags.__pendingFinished = result.finished ? 1 : 0
  touch(room)
  return room
}

export function advanceFromResolve(room: Room) {
  if (room.status !== 'resolve') return
  const nextId = String(room.flags.__pendingNext ?? room.nodeId)
  const finished = Boolean(room.flags.__pendingFinished)
  delete room.flags.__pendingNext
  delete room.flags.__pendingFinished

  if (finished) {
    enterNode(room, nextId)
    room.status = 'finished'
    room.voteEndsAt = 0
    touch(room)
    return
  }

  enterNode(room, nextId)
  beginVoting(room)
  touch(room)
}

export function onVoteTimeout(room: Room) {
  if (room.status !== 'voting') return
  lockVotes(room.code, room.hostId)
}

export function onResolveTimeout(room: Room) {
  if (room.status !== 'resolve') return
  advanceFromResolve(room)
}

export function rematch(
  code: string,
  playerId: string,
  mode: AdventureMode = 'story',
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan starta om', 'Only the host can rematch') }
  }
  if (room.status !== 'finished' && room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: roomMsg(room, 'Kan inte starta om nu', 'Cannot rematch now') }
  }

  const adventureMode = normalizeMode(mode)
  if (adventureMode === 'dragon' && roomLimits(room).campaignMode !== 'full') {
    return {
      error: roomMsg(room, 'Drakläget kräver Party-pass', 'Dragon mode needs Party pass'),
    }
  }

  // Promote mid-game spectators so they can play the next run.
  // Keep host as DM unless hostPlays is on.
  for (const p of room.players) {
    p.spectator = false
  }

  const limits = roomLimits(room)
  room.campaignMode = adventureMode === 'dragon' ? 'full' : limits.campaignMode
  room.adventureMode = adventureMode
  room.flags = adventureMode === 'chaos' ? { chaos: true } : {}
  room.lastResolve = null
  room.adventureLog = []
  room.votes = {}
  room.combatEnemyHp = null
  room.dmNote = ''
  room.notice = null
  room.statusBeforePause = null

  const connected = connectedAdventurers(room)
  if (connected.length < 1 || connected.some((p) => !p.classId)) {
    room.status = connected.length < 1 ? 'lobby' : 'class_pick'
    room.voteEndsAt = 0
    room.activeChoiceIds = []
    touch(room)
    return room
  }

  room.partyHp = PARTY_HP_BASE + Math.max(1, connected.length) * 4
  room.partyHpMax = room.partyHp
  room.isPublic = false
  enterNode(room, MODE_START[adventureMode])
  beginVoting(room)
  touch(room)
  return room
}

export function pauseAdventure(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan pausa', 'Only the host can pause') }
  }
  if (room.status !== 'voting' && room.status !== 'resolve') {
    return { error: roomMsg(room, 'Inget att pausa', 'Nothing to pause') }
  }
  room.statusBeforePause = room.status
  if (room.status === 'voting' || room.status === 'resolve') {
    room.voteRemainingMs = Math.max(0, room.voteEndsAt - Date.now())
  }
  room.status = 'paused'
  room.voteEndsAt = 0
  touch(room)
  return room
}

export function resumeAdventure(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan återuppta', 'Only the host can resume') }
  }
  if (room.status !== 'paused') {
    return { error: roomMsg(room, 'Spelet är inte pausat', 'Game is not paused') }
  }
  const prev = room.statusBeforePause ?? 'voting'
  room.status = prev
  room.statusBeforePause = null
  if (prev === 'voting' && room.voteSeconds <= 0) {
    room.voteEndsAt = 0
  } else if (prev === 'voting' || prev === 'resolve') {
    const fallback =
      prev === 'resolve' ? RESOLVE_MS : Math.max(5_000, room.voteSeconds * 1000)
    room.voteEndsAt = Date.now() + (room.voteRemainingMs || fallback)
  }
  room.voteRemainingMs = 0
  touch(room)
  return room
}

export function setDmNote(code: string, playerId: string, note: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan skriva DM-text', 'Only the host can set DM notes') }
  }
  room.dmNote = String(note ?? '').trim().slice(0, 280)
  touch(room)
  return room
}

export function applyPartyToken(code: string, token: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  const pass = lookupPass(token)
  if (!pass) {
    return { error: roomMsg(room, 'Ogiltigt eller utgånget Party-pass', 'Invalid or expired Party pass') }
  }
  room.premiumExpiresAt = pass.expiresAt
  room.campaignMode = 'full'
  touch(room)
  return room
}

export function redeemParty(
  code: string,
  playerId: string,
  passCode: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  if (room.hostId !== playerId) {
    return { error: roomMsg(room, 'Bara värden kan lösa in kod', 'Only the host can redeem codes') }
  }
  const pass = redeemPassCode(passCode)
  if ('error' in pass) {
    const e = pass.error
    if (e === 'Ange en party-kod') {
      return { error: roomMsg(room, e, 'Enter a party code') }
    }
    if (e === 'Inga party-koder är konfigurerade') {
      return { error: roomMsg(room, e, 'No party codes are configured') }
    }
    return { error: roomMsg(room, e, 'Invalid party code') }
  }
  room.premiumExpiresAt = pass.expiresAt
  room.campaignMode = 'full'
  touch(room)
  return room
}

export function unlockRoomWithPass(code: string, pass: { expiresAt: number }) {
  const room = rooms.get(code.toUpperCase())
  if (!room) return null
  room.premiumExpiresAt = pass.expiresAt
  room.campaignMode = 'full'
  touch(room)
  return room
}

export function bindSocket(socketId: string, code: string, playerId: string) {
  socketToPlayer.set(socketId, { code, playerId })
}

export function reconnectSocket(
  code: string,
  playerId: string,
  socketId: string,
): Room | { error: string } {
  const room = rooms.get(code.toUpperCase())
  if (!room) return { error: msg('sv', 'Rummet finns inte', 'Room not found') }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: roomMsg(room, 'Spelaren hittades inte', 'Player not found') }
  cancelDisconnectTimer(code, playerId)
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

      if (r.hostId === binding.playerId) {
        setTimeout(() => {
          const rr = rooms.get(binding.code)
          if (!rr) return
          const host = rr.players.find((x) => x.id === binding.playerId)
          if (host?.connected) return
          const next = rr.players.find((x) => x.connected && x.id !== binding.playerId)
          if (next) {
            rr.hostId = next.id
            // Keep them as adventurer if they already have a class
            if (next.classId) rr.hostPlays = true
            rr.notice = {
              kind: 'host_transfer',
              hostName: next.name,
              at: Date.now(),
            }
            touch(rr)
            onBroadcast?.(rr.code)
          }
        }, HOST_TRANSFER_AFTER_MS - DISCONNECT_GRACE_MS)
      }
    }, DISCONNECT_GRACE_MS),
  )
}

export function pruneIdleRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    const partyLive = Boolean(room.premiumExpiresAt && room.premiumExpiresAt > now)
    if (partyLive) continue
    if (now - room.updatedAt > ROOM_IDLE_MS) {
      rooms.delete(code)
    }
  }
  touch()
}

export function roomsNeedingTick(): Room[] {
  return [...rooms.values()].filter(
    (r) =>
      r.status !== 'paused' &&
      (r.status === 'voting' || r.status === 'resolve') &&
      r.voteEndsAt > 0 &&
      r.voteEndsAt <= Date.now(),
  )
}

export function toPublicRoom(room: Room, viewerId: string | null): PublicRoom {
  const lang = room.language
  const node = getNode(room.nodeId)
  const tier = tierFromExpiry(room.premiumExpiresAt)
  const limits = limitsFor(tier)
  const choices = node ? availableChoices(room, node) : []
  const tally: Record<string, number> = {}
  for (const id of room.activeChoiceIds) tally[id] = 0
  for (const v of Object.values(room.votes)) {
    tally[v] = (tally[v] ?? 0) + 1
  }

  const hideTallies = room.secretBallot && room.status === 'voting'
  const voters = eligibleVoters(room)
  const last = room.lastResolve
  const viewer = viewerId ? room.players.find((p) => p.id === viewerId) : null

  let notice: string | null = null
  if (room.notice && Date.now() - room.notice.at < NOTICE_TTL_MS) {
    if (room.notice.kind === 'host_transfer') {
      notice = msg(
        lang,
        `${room.notice.hostName} är nu värd`,
        `${room.notice.hostName} is now the host`,
      )
    }
  }

  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players,
    language: room.language,
    status: room.status,
    premiumTier: tier,
    premiumExpiresAt: room.premiumExpiresAt,
    limits,
    isPublic: Boolean(room.isPublic),
    waitlist: room.waitlist,
    nodeId: room.nodeId,
    title: node ? loc(node.title, lang) : '',
    narrative: node ? loc(node.narrative, lang) : '',
    partyHp: room.partyHp,
    partyHpMax: room.partyHpMax,
    flags: room.flags,
    campaignMode: room.campaignMode,
    adventureMode: room.adventureMode,
    voteSeconds: room.voteSeconds ?? DEFAULT_VOTE_SEC,
    secretBallot: Boolean(room.secretBallot),
    hostPlays: Boolean(room.hostPlays),
    choices: choices.map((c) => ({
      id: c.id,
      text: loc(c.text, lang),
      votes: hideTallies ? 0 : (tally[c.id] ?? 0),
    })),
    yourVote: viewerId ? room.votes[viewerId] ?? null : null,
    voteEndsAt: room.voteEndsAt,
    votedCount: Object.keys(room.votes).length,
    voterCount: voters.length,
    lastResolve: last
      ? {
          winningChoiceId: last.winningChoiceId,
          winningText: loc(last.winningText, lang),
          tally: last.tally,
          narrativeExtra: last.narrativeExtra ? loc(last.narrativeExtra, lang) : undefined,
          combatLog: last.combatLog ? loc(last.combatLog, lang) : undefined,
          heroBanner: last.heroBanner ? loc(last.heroBanner, lang) : undefined,
          closeRace: last.closeRace,
          voteReveal: last.voteReveal?.map((v) => ({
            playerId: v.playerId,
            playerName: v.playerName,
            choiceId: v.choiceId,
            choiceText: loc(v.choiceText, lang),
          })),
        }
      : null,
    adventureLog: (room.adventureLog ?? []).map((e) => ({
      title: loc(e.title, lang),
      winningText: loc(e.winningText, lang),
      closeRace: e.closeRace,
      heroBanner: e.heroBanner ? loc(e.heroBanner, lang) : undefined,
    })),
    combat:
      node?.combat && room.combatEnemyHp !== null
        ? {
            enemyName: loc(node.combat.enemy.name, lang),
            enemyHp: room.combatEnemyHp,
            enemyHpMax: node.combat.enemy.hp,
          }
        : null,
    isEnding: Boolean(node?.ending),
    dmNote: room.dmNote,
    paused: room.status === 'paused',
    notice,
    youAreSpectator: Boolean(viewer?.spectator),
    youAreDm: Boolean(
      viewer && viewer.id === room.hostId && !room.hostPlays && !viewer.spectator,
    ),
    classes: CLASSES.map((c) => ({
      id: c.id,
      name: loc(c.name, lang),
      blurb: loc(c.blurb, lang),
      might: c.might,
      arcana: c.arcana,
      cunning: c.cunning,
      ability: loc(c.ability, lang),
    })),
  }
}
