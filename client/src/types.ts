export type Lang = 'sv' | 'en'
export type RoomStatus = 'lobby' | 'ritual' | 'affliction' | 'cleansing' | 'cycle_end' | 'finished'
export type GameMode = 'solo' | 'multi'
export type KeeperRole = 'keeper' | 'scourgeborn'
export type GameOutcome = 'ongoing' | 'keepers_win' | 'scourgeborn_win'
export type TaskKind = 'crystal' | 'glyphs' | 'essence'
export type ToolId =
  | 'crystal_slider'
  | 'glyph_board'
  | 'essence_valve'
  | 'miasma_cloud'
  | 'sabotage_pulse'

export type Player = {
  id: string
  name: string
  connected: boolean
  spectator?: boolean
  role?: KeeperRole
}

export type PublicTask = {
  id: string
  kind: TaskKind
  titleSv: string
  titleEn: string
  deadlineAt: number
  targetCrystal: number
  glyphSequence: string[]
  glyphProgress: number
  glyphHint: string
  essenceMin: number
  essenceMax: number
  essenceValue: number
  assignedPlayerIds: string[]
  completed: boolean
  failed: boolean
}

export type CleansingVoteState = {
  initiatedBy: string
  votes: Record<string, string>
  deadlineAt: number
  resolved: boolean
  result: 'sealed_scourge' | 'sealed_innocent' | 'skipped' | 'no_majority' | null
  sealedId: string | null
}

export type PublicRoom = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  premiumTier: 'free' | 'party'
  premiumExpiresAt: number | null
  limits: { maxPlayers: number; maxRounds: number; freePack: boolean }
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  phaseEndsAt: number
  matrixHealth: number
  cycle: number
  maxCycles: number
  afflictionAt: number
  afflictionTriggered: boolean
  tasks: PublicTask[]
  yourTools: ToolId[]
  yourRole: KeeperRole | null
  showAffliction: boolean
  scourgeMeter: number
  miasmaActive: boolean
  cleansing: CleansingVoteState | null
  youCleansingVoted: boolean
  soloSurvivalMs: number
  outcome: GameOutcome
  lastEvent: string | null
  notice: string | null
  youAreSpectator: boolean
  youAreHost: boolean
  minPlayersMulti: number
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
