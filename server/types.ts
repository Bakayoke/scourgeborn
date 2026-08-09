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

export type RoomStatus =
  | 'lobby'
  | 'council_contain'
  | 'council_cure'
  | 'resolve'
  | 'finished'

export type RegionId =
  | 'north_kingdom'
  | 'elf_woods'
  | 'eastern_wastes'
  | 'southern_ports'
  | 'heartlands'
  | 'plague_heart'

export type ActionKind = 'quarantine' | 'cleanse' | 'research' | 'assault'

export type ActionGroup = 'contain' | 'cure'

export type ActionOption = {
  id: string
  kind: ActionKind
  group: ActionGroup
  title: string
  description: string
  cost: number
  amount?: number
  /** For cure options: which lab hub the spend targets */
  targetRegionId?: RegionId
  affordable: boolean
}

export type GameOutcome =
  | 'ongoing'
  | 'victory_cure'
  | 'victory_heart'
  | 'victory_contained'
  | 'defeat_plague'

export type TurnResolution = {
  turn: number
  containRegionId: RegionId | null
  containActionId: string
  cureActionId: string
  containLog: string
  cureLog: string
  playerLog: string
  aiLog: string
  incomeGained: number
  containLandVoteCounts: Record<string, number>
  containActionVoteCounts: Record<string, number>
  cureVoteCounts: Record<string, number>
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
  resourcePoints: number
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  /** Winning contain land (null while still picking land) */
  containRegionId: RegionId | null
  /** Alias used in public API / map highlight */
  focusRegionId: RegionId | null
  containLandVotes: Record<string, string>
  containActionVotes: Record<string, string>
  cureVotes: Record<string, string>
  containOptions: ActionOption[]
  cureOptions: ActionOption[]
  /** Pending contain log after spend, before cure resolves */
  pendingContainLog: string | null
  pendingContainActionId: string | null
  lastResolution: TurnResolution | null
  outcome: GameOutcome
  notice: RoomNotice | null
  updatedAt: number
}

export type MapRegion = {
  id: RegionId
  infection: number
  quarantined: boolean
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
  resourcePoints: number
  worldInfection: number
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  containRegionId: RegionId | null
  focusRegionId: RegionId | null
  containOptions: ActionOption[]
  cureOptions: ActionOption[]
  /** contain land pick vs contain action vs cure */
  voteStep: 'contain_land' | 'contain_action' | 'cure' | 'none'
  submittedCount: number
  submitterCount: number
  submittedIds: string[]
  youSubmitted: boolean
  yourContainLandVote: string | null
  yourContainActionVote: string | null
  yourCureVote: string | null
  containLandVoteCounts: Record<string, number> | null
  containActionVoteCounts: Record<string, number> | null
  cureVoteCounts: Record<string, number> | null
  lastResolution: TurnResolution | null
  outcome: GameOutcome
  notice: string | null
  youAreSpectator: boolean
  youAreHost: boolean
  youCanVote: boolean
  maxRounds: number
}
