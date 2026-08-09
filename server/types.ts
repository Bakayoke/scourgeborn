export type Lang = 'sv' | 'en'

export type PremiumTier = 'free' | 'party'

export type PremiumLimits = {
  /** 0 = unlimited */
  maxPlayers: number
  /** Max council turns per session */
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

export type RoomStatus = 'lobby' | 'council' | 'resolve' | 'finished'

export type RegionId =
  | 'north_kingdom'
  | 'elf_woods'
  | 'eastern_wastes'
  | 'southern_ports'
  | 'heartlands'
  | 'plague_heart'

/** Player contain moves + plague AI moves share this union */
export type ActionKind =
  | 'quarantine'
  | 'cleanse'
  | 'assault'
  | 'research'
  | 'spread'
  | 'breach'
  | 'sabotage'
  | 'pulse'

export type ActionSide = 'good' | 'plague'

export type ActionOption = {
  id: string
  kind: ActionKind
  side: ActionSide
  title: string
  description: string
  cost: number
  amount?: number
  targetRegionId: RegionId
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
  actionId: string
  aiActionId: string
  focusRegionId: RegionId | null
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
  resourcePoints: number
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  focusRegionId: RegionId | null
  votes: Record<string, string>
  voteOptions: ActionOption[]
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
  voteOptions: ActionOption[]
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
  youCanVote: boolean
  maxRounds: number
}
