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
  | 'council_land'
  | 'council_action'
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

export type ActionOption = {
  id: string
  kind: ActionKind
  title: string
  description: string
  cost: number
  amount?: number
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
  focusRegionId: RegionId | null
  actionId: string
  playerLog: string
  aiLog: string
  incomeGained: number
  landVoteCounts: Record<string, number>
  actionVoteCounts: Record<string, number>
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
  /** Winning land from council_land */
  focusRegionId: RegionId | null
  /** playerId -> regionId */
  landVotes: Record<string, string>
  /** playerId -> action option id */
  actionVotes: Record<string, string>
  actionOptions: ActionOption[]
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
  focusRegionId: RegionId | null
  actionOptions: ActionOption[]
  submittedCount: number
  submitterCount: number
  submittedIds: string[]
  youSubmitted: boolean
  yourLandVote: string | null
  yourActionVote: string | null
  landVoteCounts: Record<string, number> | null
  actionVoteCounts: Record<string, number> | null
  lastResolution: TurnResolution | null
  outcome: GameOutcome
  notice: string | null
  youAreSpectator: boolean
  youAreHost: boolean
  maxRounds: number
}
