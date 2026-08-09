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

export type VoteOption = {
  id: string
  kind: 'outbreak' | 'mutate' | 'sabotage' | 'fortify' | 'distract'
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
