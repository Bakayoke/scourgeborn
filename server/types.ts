export type Lang = 'sv' | 'en'

export type GameLimits = {
  maxPlayers: number
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

export type RoomStatus = 'lobby' | 'playing' | 'gameover' | 'victory'

export type Difficulty = 'training' | 'normal' | 'panic'

export type PatientKind = 'normal' | 'twin' | 'vip' | 'mutant'

export type LabEventKind = 'blackout' | 'contamination' | 'overtime'

export type LabLogKind =
  | 'cure'
  | 'miss'
  | 'send'
  | 'ping'
  | 'drop'
  | 'wave'
  | 'spawn'
  | 'system'
  | 'victory'
  | 'event'
  | 'streak'
  | 'pipeline'
  | 'race'

export type Station = 'extractor' | 'synthesizer' | 'incubator'

export type ItemId =
  | 'red_rna'
  | 'blue_rna'
  | 'green_rna'
  | 'yellow_rna'
  | 'purple_rna'
  | 'heated_purple_rna'
  | 'cooled_blue_rna'

export type LabLogEntry = {
  at: number
  kind: LabLogKind
  sv: string
  en: string
}

export type MissLogEntry = {
  at: number
  vaccine: ItemId
  sv: string
  en: string
}

export type PingKind = 'need_red' | 'need_blue' | 'need_mix' | 'need_heat' | 'need_cool' | 'need_deliver'

export type Patient = {
  id: string
  requiredVaccine: ItemId
  timeRemaining: number
  maxTime: number
  kind?: PatientKind
  twinGroupId?: string
  mutantStage?: number
  decoyVaccine?: ItemId
  pointValue?: number
}

export type PlayerAlert = {
  kind: 'incoming' | 'ping'
  fromName: string
  messageSv: string
  messageEn: string
  itemId?: ItemId
  at: number
}

export type PlayerStats = {
  cures: number
  sends: number
  pings: number
}

export type LabPlayerState = {
  assignedStation: Station
  activeStation: Station
  itemInHand: ItemId | null
  synthSlot: ItemId | null
}

export type PipelineState = {
  startedAt: number
  players: string[]
  extract: boolean
  mix: boolean
  process: boolean
}

export type RacePartnerSnapshot = {
  code: string
  score: number
  status: RoomStatus
  raceFinished: 'won' | 'lost' | null
}

export type Room = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  notice: RoomNotice | null
  updatedAt: number
  difficulty: Difficulty
  seriesEnabled: boolean
  seriesRound: number
  seriesWins: number
  seriesComplete: boolean
  racePartnerCode: string | null
  raceFinished: 'won' | 'lost' | null
  score: number
  misses: number
  patients: Patient[]
  lab: Record<string, LabPlayerState>
  lastTickAt: number
  lastSpawnAt: number
  lastEventSv: string | null
  lastEventEn: string | null
  gameStartedAt: number
  wave: number
  alerts: Record<string, PlayerAlert | null>
  stats: Record<string, PlayerStats>
  eventLog: LabLogEntry[]
  missLog: MissLogEntry[]
  wave4StartedAt: number | null
  yellSv: string | null
  yellEn: string | null
  yellAt: number
  yellItemId: ItemId | null
  cureStreak: number
  bestStreak: number
  activeEvent: LabEventKind | null
  eventEndsAt: number
  disabledStation: Station | null
  timersFrozenUntil: number
  nextEventAt: number
  pendingSpecialKind: PatientKind | null
  specialSpawnedThisWave: boolean
  pipeline: PipelineState | null
}

export type PublicLabPlayer = Player & {
  assignedStation: Station
  itemInHand: ItemId | null
  cures: number
  sends: number
  pings: number
}

export type PublicRoom = {
  code: string
  hostId: string
  players: PublicLabPlayer[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  limits: GameLimits
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  difficulty: Difficulty
  seriesEnabled: boolean
  seriesRound: number
  seriesWins: number
  seriesComplete: boolean
  seriesTarget: number
  racePartnerCode: string | null
  racePartner: RacePartnerSnapshot | null
  raceFinished: 'won' | 'lost' | null
  raceTarget: number
  score: number
  misses: number
  maxMisses: number
  patients: Patient[]
  yourStation: Station
  yourActiveStation: Station
  itemInHand: ItemId | null
  synthSlot: ItemId | null
  lastEvent: string | null
  notice: string | null
  youAreSpectator: boolean
  youAreHost: boolean
  youAreTvHost: boolean
  canStartSolo: boolean
  minPlayersMulti: number
  compactLab: boolean
  wave: number
  waveLabel: string
  alert: string | null
  alertItemId: ItemId | null
  stats: Record<string, PlayerStats>
  eventLog: LabLogEntry[]
  missLog: MissLogEntry[]
  gameDurationSec: number
  winScoreTarget: number
  yellMessage: string | null
  yellItemId: ItemId | null
  yellAt: number
  cureStreak: number
  bestStreak: number
  activeEvent: LabEventKind | null
  activeEventLabel: string | null
  disabledStation: Station | null
}
