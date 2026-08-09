export type Lang = 'sv' | 'en'

export type PremiumTier = 'free' | 'party'

export type PremiumLimits = {
  /** 0 = unlimited */
  maxPlayers: number
  /** Max council turns per session */
  maxRounds: number
  /** Unused for Scourgeborn; kept for party-pass shape */
  freePack: boolean
}

export type Player = {
  id: string
  name: string
  connected: boolean
  /** Mid-game joiners watch until next lobby */
  spectator?: boolean
}

export type RoomNotice = {
  kind: 'host_transfer'
  hostName: string
  at: number
}

export type RoomStatus = 'lobby' | 'council' | 'resolve' | 'finished'

export type RegionId =
  | 'north_kingdom'
  | 'elf_woods'
  | 'eastern_wastes'
  | 'southern_ports'
  | 'heartlands'
  | 'plague_heart'

export type SkillId =
  | 'contagion'
  | 'waterborne'
  | 'necromancy'
  | 'shadow_veil'
  | 'blight_bloom'
  | 'drake_summon'

export type MapRegion = {
  id: RegionId
  corruption: number
  quarantined: boolean
}

export type VoteOptionKind = 'outbreak' | 'mutate' | 'sabotage' | 'fortify' | 'distract'

export type VoteOption = {
  id: string
  kind: VoteOptionKind
  title: string
  description: string
  cost: number
  regionId?: RegionId
  skillId?: SkillId
  amount?: number
  affordable: boolean
}

export type GameOutcome = 'ongoing' | 'victory' | 'defeat_cure' | 'defeat_heart'

export type TurnResolution = {
  turn: number
  winningOptionId: string
  playerLog: string
  aiLog: string
  incomeGained: number
  voteCounts: Record<string, number>
}

export type Room = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  premiumExpiresAt: number | null
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  phaseEndsAt: number
  turnIndex: number
  corruptionPoints: number
  regions: MapRegion[]
  skills: SkillId[]
  cureProgress: number
  heartHp: number
  voteOptions: VoteOption[]
  /** playerId -> optionId */
  votes: Record<string, string>
  lastResolution: TurnResolution | null
  outcome: GameOutcome
  notice: RoomNotice | null
  updatedAt: number
}

export type PublicRoom = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  premiumTier: PremiumTier
  premiumExpiresAt: number | null
  limits: PremiumLimits
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  phaseEndsAt: number
  turnIndex: number
  corruptionPoints: number
  worldCorruption: number
  regions: MapRegion[]
  skills: SkillId[]
  cureProgress: number
  heartHp: number
  voteOptions: VoteOption[]
  submittedCount: number
  submitterCount: number
  submittedIds: string[]
  youSubmitted: boolean
  yourVote: string | null
  voteCounts: Record<string, number> | null
  lastResolution: TurnResolution | null
  outcome: GameOutcome
  notice: string | null
  youAreSpectator: boolean
  youAreHost: boolean
  maxRounds: number
}
