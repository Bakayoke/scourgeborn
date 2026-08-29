export type Lang = 'sv' | 'en'

export type PremiumTier = 'free' | 'party'

export type PremiumLimits = {
  maxPlayers: number
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

export type GameMode = 'solo' | 'multi'

export type RoomStatus =
  | 'lobby'
  | 'ritual'
  | 'affliction'
  | 'cleansing'
  | 'cycle_end'
  | 'finished'

export type KeeperRole = 'keeper' | 'scourgeborn'

export type TaskKind = 'crystal' | 'glyphs' | 'essence'

export type ToolId =
  | 'crystal_slider'
  | 'glyph_board'
  | 'essence_valve'
  | 'miasma_cloud'
  | 'sabotage_pulse'

export type GameOutcome = 'ongoing' | 'keepers_win' | 'scourgeborn_win'

export type RitualTask = {
  id: string
  kind: TaskKind
  titleSv: string
  titleEn: string
  deadlineAt: number
  targetCrystal: number
  glyphSequence: string[]
  glyphProgress: number
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

export type Room = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  premiumExpiresAt: number | null
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  notice: RoomNotice | null
  updatedAt: number
  phaseEndsAt: number
  matrixHealth: number
  cycle: number
  maxCycles: number
  gameStartedAt: number
  afflictionAt: number
  afflictionTriggered: boolean
  roles: Record<string, KeeperRole>
  afflictionSeen: Record<string, boolean>
  tasks: RitualTask[]
  playerTools: Record<string, ToolId[]>
  scourgeMeter: number
  miasmaUntil: number
  cleansing: CleansingVoteState | null
  soloSurvivalMs: number
  outcome: GameOutcome
  lastEventSv: string | null
  lastEventEn: string | null
}

export type PublicTask = Omit<RitualTask, 'glyphSequence'> & {
  glyphHint: string
}

export type PublicRoom = {
  code: string
  hostId: string
  players: (Player & { role?: KeeperRole })[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  premiumTier: PremiumTier
  premiumExpiresAt: number | null
  limits: PremiumLimits
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
