export type Lang = 'sv' | 'en'
export type RoomStatus =
  | 'lobby'
  | 'council_contain'
  | 'council_cure'
  | 'resolve'
  | 'finished'
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

export type ActionKind = 'quarantine' | 'cleanse' | 'research' | 'assault'
export type ActionGroup = 'contain' | 'cure'

export type MapRegion = {
  id: RegionId
  infection: number
  quarantined: boolean
}

export type ActionOption = {
  id: string
  kind: ActionKind
  group: ActionGroup
  title: string
  description: string
  cost: number
  amount?: number
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
  containRegionId: RegionId | null
  focusRegionId: RegionId | null
  containOptions: ActionOption[]
  cureOptions: ActionOption[]
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
