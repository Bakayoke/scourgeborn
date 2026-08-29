export type Lang = 'sv' | 'en'
export type RoomStatus =
  | 'lobby'
  | 'roles'
  | 'election'
  | 'team_vote'
  | 'mission'
  | 'resolution'
  | 'finished'
export type PremiumTier = 'free' | 'party'
export type PlayerRole = 'innocent' | 'scourgeborn'
export type GameOutcome = 'ongoing' | 'innocents_win' | 'scourgeborn_win'

export type Player = {
  id: string
  name: string
  connected: boolean
  spectator?: boolean
  role?: PlayerRole
}

export type MissionScores = {
  cleanses: number
  infections: number
}

export type MissionResult = {
  round: number
  teamIds: string[]
  success: boolean
  infectCount: number
}

export type PublicRoom = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  premiumTier: PremiumTier
  premiumExpiresAt: number | null
  limits: { maxPlayers: number; maxRounds: number; freePack: boolean }
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  phaseEndsAt: number
  expeditionLeaderId: string | null
  proposedTeamIds: string[]
  scores: MissionScores
  failedElectionStreak: number
  missionRound: number
  lastMissionResult: MissionResult | null
  outcome: GameOutcome
  notice: string | null
  youAreSpectator: boolean
  youAreHost: boolean
  youAreLeader: boolean
  youOnMission: boolean
  yourRole: PlayerRole | null
  youRoleRevealed: boolean
  rolesRevealedCount: number
  rolesTotal: number
  teamVoteSubmittedCount: number
  teamVoteTotal: number
  youTeamVoted: boolean
  yourTeamVote: boolean | null
  teamVoteSubmittedIds: string[]
  missionSubmittedCount: number
  missionSubmittedIds: string[]
  youMissionVoted: boolean
  minPlayers: number
}

export type PartyInfo = {
  enabled: boolean
  amountLabel: string
  weekAmountLabel: string
  durationHours: number
  weekDurationHours: number
  firstPartyPercentOff: number
  firstPartyDayLabel: string
  firstPartyWeekLabel: string
}

export type Session = {
  code: string
  playerId: string
  name: string
}

export type PartyPassLocal = {
  token: string
  expiresAt: number
}
