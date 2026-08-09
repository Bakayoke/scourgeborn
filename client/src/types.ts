export type Lang = 'sv' | 'en'
export type RoomStatus = 'lobby' | 'council' | 'resolve' | 'finished'
export type PremiumTier = 'free' | 'party'

export type Player = {
  id: string
  name: string
  connected: boolean
  spectator?: boolean
}

export type RegionId =
  | 'north_kingdom'
  | 'elf_woods'
  | 'eastern_wastes'
  | 'southern_ports'
  | 'heartlands'
  | 'plague_heart'

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

export type MapRegion = {
  id: RegionId
  infection: number
  quarantined: boolean
}

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
