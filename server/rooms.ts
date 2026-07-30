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
const VOTE_MS = 20_000
const RESOLVE_MS = 5_500
const ROOM_IDLE_MS = 12 * 60 * 60 * 1000
const PARTY_HP_BASE = 40

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

export function setPersistHook(fn: (() => void) | null) {
  onPersist = fn
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
      voteRemainingMs: room.voteRemainingMs ?? 0,
      dmNote: room.dmNote ?? '',
    })
  }
}

export function createRoom(
  hostName: string,
  socketId: string,
  language: Lang = 'sv',
  partyToken?: string | null,
): { room: Room; playerId: string } {
  const pass = lookupPass(partyToken)
  const premiumExpiresAt = pass?.expiresAt ?? null
  const limits = limitsFor(tierFromExpiry(premiumExpiresAt))
  const code = uniqueCode()
  const playerId = crypto.randomUUID()
  const host: Player = {
    id: playerId,
    name: hostName.trim().slice(0, 20) || (language === 'en' ? 'Host' : 'Värd'),
    connected: true,
    classId: null,
  }

  const room: Room = {
    code,
    hostId: playerId,
    players: [host],
    language: language === 'en' ? 'en' : 'sv',
    status: 'lobby',
    statusBeforePause: null,
    premiumExpiresAt,
    waitlist: [],
    nodeId: START_NODE,
    partyHp: PARTY_HP_BASE,
    partyHpMax: PARTY_HP_BASE,
    flags: {},
    campaignMode: limits.campaignMode,
    adventureMode: 'story',
    votes: {},
    voteEndsAt: 0,
    voteRemainingMs: 0,
    lastResolve: null,
    activeChoiceIds: [],
    combatEnemyHp: null,
    dmNote: '',
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
  if (!room) return { error: 'Hittade inget spel med den koden', code: 'NOT_FOUND' }

  if (room.status !== 'lobby' && room.status !== 'class_pick' && room.status !== 'finished') {
    // Allow spectate mid-game
  }

  const displayName =
    name.trim().slice(0, 20) || (room.language === 'en' ? 'Player' : 'Spelare')

  const maxPlayers = roomLimits(room).maxPlayers
  if (maxPlayers > 0 && room.players.length >= maxPlayers) {
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
      error:
        maxPlayers <= 5
          ? `Rummet är fullt (max ${maxPlayers} gratis). Lås upp Party för fler spelare.`
          : `Rummet är fullt (max ${maxPlayers})`,
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

export function setLanguage(code: string, playerId: string, language: Lang): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan ändra språk' }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: 'Kan inte byta språk mid-spel' }
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
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: 'Klassval är stängt' }
  }
  if (!CLASSES.some((c) => c.id === classId)) return { error: 'Ogiltig klass' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelaren hittades inte' }
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
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan starta' }
  if (room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: 'Äventyret har redan startat' }
  }

  const connected = room.players.filter((p) => p.connected)
  if (connected.length < 1) return { error: 'Behöver minst en spelare' }
  const missing = connected.filter((p) => !p.classId)
  if (missing.length > 0) {
    return {
      error:
        room.language === 'en'
          ? 'All connected players must pick a class'
          : 'Alla anslutna spelare måste välja klass',
    }
  }

  const adventureMode = normalizeMode(mode)
  if (adventureMode === 'dragon' && roomLimits(room).campaignMode !== 'full') {
    return {
      error:
        room.language === 'en'
          ? 'Dragon mode needs Party pass'
          : 'Drakläget kräver Party-pass',
    }
  }

  const limits = roomLimits(room)
  room.campaignMode = adventureMode === 'dragon' ? 'full' : limits.campaignMode
  room.adventureMode = adventureMode
  room.partyHp = PARTY_HP_BASE + connected.length * 4
  room.partyHpMax = room.partyHp
  room.flags = adventureMode === 'chaos' ? { chaos: true } : {}
  room.lastResolve = null
  room.dmNote = ''
  enterNode(room, MODE_START[adventureMode])
  beginVoting(room)
  touch(room)
  return room
}

function normalizeMode(mode: unknown): AdventureMode {
  if (mode === 'orcs' || mode === 'dragon' || mode === 'chaos') return mode
  return 'story'
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
  room.voteEndsAt = Date.now() + VOTE_MS
}

export function castVote(
  code: string,
  playerId: string,
  choiceId: string,
): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'voting') return { error: 'Ingen omröstning pågår' }
  if (!room.activeChoiceIds.includes(choiceId)) return { error: 'Ogiltigt val' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player || !player.connected) return { error: 'Du är inte med i spelet' }
  room.votes[playerId] = choiceId
  touch(room)

  // Auto-lock when everyone connected has voted
  const voters = room.players.filter((p) => p.connected)
  if (voters.length > 0 && voters.every((p) => room.votes[p.id])) {
    return lockVotes(code, room.hostId)
  }
  return room
}

export function lockVotes(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.status !== 'voting') return { error: 'Ingen omröstning pågår' }
  if (room.hostId !== playerId) {
    const voters = room.players.filter((p) => p.connected)
    const allVoted = voters.length > 0 && voters.every((p) => room.votes[p.id])
    if (!allVoted) return { error: 'Bara värden kan låsa tidigt' }
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
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan starta om' }
  if (room.status !== 'finished' && room.status !== 'lobby' && room.status !== 'class_pick') {
    return { error: 'Kan inte starta om nu' }
  }

  const adventureMode = normalizeMode(mode)
  if (adventureMode === 'dragon' && roomLimits(room).campaignMode !== 'full') {
    return {
      error:
        room.language === 'en'
          ? 'Dragon mode needs Party pass'
          : 'Drakläget kräver Party-pass',
    }
  }

  const limits = roomLimits(room)
  room.campaignMode = adventureMode === 'dragon' ? 'full' : limits.campaignMode
  room.adventureMode = adventureMode
  room.flags = adventureMode === 'chaos' ? { chaos: true } : {}
  room.lastResolve = null
  room.votes = {}
  room.combatEnemyHp = null
  room.dmNote = ''
  room.statusBeforePause = null
  room.partyHp = PARTY_HP_BASE + room.players.filter((p) => p.connected).length * 4
  room.partyHpMax = room.partyHp
  enterNode(room, MODE_START[adventureMode])
  beginVoting(room)
  touch(room)
  return room
}

export function pauseAdventure(code: string, playerId: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan pausa' }
  if (room.status !== 'voting' && room.status !== 'resolve') {
    return { error: 'Inget att pausa' }
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
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan återuppta' }
  if (room.status !== 'paused') return { error: 'Spelet är inte pausat' }
  const prev = room.statusBeforePause ?? 'voting'
  room.status = prev
  room.statusBeforePause = null
  room.voteEndsAt = Date.now() + (room.voteRemainingMs || VOTE_MS)
  room.voteRemainingMs = 0
  touch(room)
  return room
}

export function setDmNote(code: string, playerId: string, note: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan skriva DM-text' }
  room.dmNote = String(note ?? '').trim().slice(0, 280)
  touch(room)
  return room
}

export function applyPartyToken(code: string, token: string): Room | { error: string } {
  const room = rooms.get(code)
  if (!room) return { error: 'Rummet finns inte' }
  const pass = lookupPass(token)
  if (!pass) return { error: 'Ogiltigt eller utgånget Party-pass' }
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
  if (!room) return { error: 'Rummet finns inte' }
  if (room.hostId !== playerId) return { error: 'Bara värden kan lösa in kod' }
  const pass = redeemPassCode(passCode)
  if ('error' in pass) return pass
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
  if (!room) return { error: 'Rummet finns inte' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { error: 'Spelaren hittades inte' }
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
            touch(rr)
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

  const voters = room.players.filter((p) => p.connected)
  const last = room.lastResolve

  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players,
    language: room.language,
    status: room.status,
    premiumTier: tier,
    premiumExpiresAt: room.premiumExpiresAt,
    limits,
    waitlist: room.waitlist,
    nodeId: room.nodeId,
    title: node ? loc(node.title, lang) : '',
    narrative: node ? loc(node.narrative, lang) : '',
    partyHp: room.partyHp,
    partyHpMax: room.partyHpMax,
    flags: room.flags,
    campaignMode: room.campaignMode,
    adventureMode: room.adventureMode,
    choices: choices.map((c) => ({
      id: c.id,
      text: loc(c.text, lang),
      votes: tally[c.id] ?? 0,
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
