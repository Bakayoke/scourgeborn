import type { GameOutcome, Lang, MissionResult, MissionScores, PlayerRole, Room } from '../types.js'

export const MIN_PLAYERS = 5
export const MISSIONS_TO_WIN = 3
export const MAX_FAILED_ELECTIONS = 3

export const ROLES_MS = 90_000
export const ELECTION_MS = 45_000
export const TEAM_VOTE_MS = 30_000
export const MISSION_MS = 45_000
export const RESOLUTION_MS = 8_000

export function scourgebornCount(playerCount: number): number {
  if (playerCount <= 6) return 1
  if (playerCount <= 9) return 2
  return 3
}

export function shuffleIds(ids: string[]): string[] {
  const out = [...ids]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function assignRoles(playerIds: string[]): Record<string, PlayerRole> {
  const roles: Record<string, PlayerRole> = {}
  for (const id of playerIds) roles[id] = 'innocent'

  const traitors = scourgebornCount(playerIds.length)
  const order = shuffleIds(playerIds)
  for (let i = 0; i < traitors; i++) {
    roles[order[i]!] = 'scourgeborn'
  }
  return roles
}

export function activePlayerIds(room: Room): string[] {
  return room.players.filter((p) => !p.spectator).map((p) => p.id)
}

export function connectedActiveIds(room: Room): string[] {
  return room.players.filter((p) => !p.spectator && p.connected).map((p) => p.id)
}

export function allRolesRevealed(room: Room): boolean {
  const ids = activePlayerIds(room)
  return ids.length > 0 && ids.every((id) => room.roleRevealed[id])
}

export function teamVotePassed(votes: Record<string, boolean>, voterIds: string[]): boolean {
  if (voterIds.length === 0) return false
  let yes = 0
  for (const id of voterIds) {
    if (votes[id]) yes++
  }
  return yes > voterIds.length / 2
}

export function tallyTeamVotes(votes: Record<string, boolean>, voterIds: string[]): {
  yes: number
  no: number
} {
  let yes = 0
  let no = 0
  for (const id of voterIds) {
    if (votes[id] === true) yes++
    else if (votes[id] === false) no++
  }
  return { yes, no }
}

export function resolveMissionVotes(
  room: Room,
  teamIds: string[],
): { success: boolean; infectCount: number } {
  let infectCount = 0
  for (const id of teamIds) {
    const vote = room.missionVotes[id]
    if (vote === 'infect') infectCount++
  }
  return { success: infectCount === 0, infectCount }
}

export function checkOutcome(scores: MissionScores, failedElectionStreak: number): GameOutcome {
  if (scores.cleanses >= MISSIONS_TO_WIN) return 'innocents_win'
  if (scores.infections >= MISSIONS_TO_WIN) return 'scourgeborn_win'
  if (failedElectionStreak >= MAX_FAILED_ELECTIONS) return 'scourgeborn_win'
  return 'ongoing'
}

export function advanceLeader(room: Room) {
  if (room.leaderOrder.length === 0) {
    room.expeditionLeaderId = null
    return
  }
  room.leaderIndex = (room.leaderIndex + 1) % room.leaderOrder.length
  room.expeditionLeaderId = room.leaderOrder[room.leaderIndex] ?? null
}

export function beginElectionPhase(room: Room) {
  room.status = 'election'
  room.proposedTeamIds = []
  room.teamVotes = {}
  room.missionVotes = {}
  room.phaseEndsAt = Date.now() + ELECTION_MS
}

export function beginTeamVotePhase(room: Room) {
  room.status = 'team_vote'
  room.teamVotes = {}
  room.phaseEndsAt = Date.now() + TEAM_VOTE_MS
}

export function beginMissionPhase(room: Room) {
  room.status = 'mission'
  room.missionVotes = {}
  room.phaseEndsAt = Date.now() + MISSION_MS
}

export function beginResolutionPhase(room: Room, result: MissionResult) {
  room.status = 'resolution'
  room.lastMissionResult = result
  room.phaseEndsAt = Date.now() + RESOLUTION_MS
}

export function applyMissionResult(room: Room, result: MissionResult) {
  if (result.success) room.scores.cleanses += 1
  else room.scores.infections += 1
  room.missionRound += 1
  room.lastMissionResult = result
  room.outcome = checkOutcome(room.scores, room.failedElectionStreak)
}

export function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}

export function roleLabel(role: PlayerRole, lang: Lang): string {
  if (role === 'scourgeborn') {
    return msg(lang, 'Scourgeborn', 'Scourgeborn')
  }
  return msg(lang, 'Oskuldig', 'Innocent')
}

export function outcomeTitle(outcome: GameOutcome, lang: Lang): string {
  if (outcome === 'innocents_win') return msg(lang, 'Oskuldiga vinner', 'Innocents win')
  if (outcome === 'scourgeborn_win') return msg(lang, 'Scourgeborn vinner', 'Scourgeborn win')
  return msg(lang, 'Pågår', 'Ongoing')
}
