export type Lang = 'sv' | 'en'

export type PremiumTier = 'free' | 'party'

export type PremiumLimits = {
  /** 0 = unlimited */
  maxPlayers: number
  /** Legacy field — unused in social-deduction mode */
  maxRounds: number
  freePack: boolean
}

export type Player = {
  id: string
  name: string
  connected: boolean
  spectator?: boolean
}

export type RoomNotice = {
  kind: 'host_transfer'
  hostName: string
  at: number
}

export type RoomStatus =
  | 'lobby'
  | 'roles'
  | 'election'
  | 'team_vote'
  | 'mission'
  | 'resolution'
  | 'finished'

export type PlayerRole = 'innocent' | 'scourgeborn'

export type MissionVote = 'cleanse' | 'infect'

export type GameOutcome = 'ongoing' | 'innocents_win' | 'scourgeborn_win'

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

export type RoleReveal = Record<string, boolean>

export type Room = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  premiumExpiresAt: number | null
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  notice: RoomNotice | null
  updatedAt: number
  phaseEndsAt: number
  /** Shuffled player order for leader rotation */
  leaderOrder: string[]
  leaderIndex: number
  expeditionLeaderId: string | null
  roles: Record<string, PlayerRole>
  roleRevealed: RoleReveal
  proposedTeamIds: string[]
  teamVotes: Record<string, boolean>
  missionVotes: Record<string, MissionVote>
  scores: MissionScores
  failedElectionStreak: number
  missionRound: number
  lastMissionResult: MissionResult | null
  outcome: GameOutcome
}

export type PublicPlayer = Player & {
  /** Only populated when game is finished */
  role?: PlayerRole
}

export type PublicRoom = {
  code: string
  hostId: string
  players: PublicPlayer[]
  language: Lang
  status: RoomStatus
  premiumTier: PremiumTier
  premiumExpiresAt: number | null
  limits: PremiumLimits
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
  /** Role shown only after viewer taps reveal */
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
