export type Lang = 'sv' | 'en'
export type RoomStatus = 'lobby' | 'playing' | 'gameover' | 'victory'
export type Difficulty = 'training' | 'normal' | 'panic'
export type PatientKind = 'normal' | 'twin' | 'vip' | 'mutant'
export type LabEventKind = 'blackout' | 'contamination' | 'overtime'

export type LabLogEntry = {
  at: number
  kind: string
  sv: string
  en: string
}

export type MissLogEntry = {
  at: number
  vaccine: ItemId
  sv: string
  en: string
}
export type GameMode = 'solo' | 'multi'
export type Station = 'extractor' | 'synthesizer' | 'incubator'
export type PingKind = 'need_red' | 'need_blue' | 'need_mix' | 'need_heat' | 'need_cool' | 'need_deliver'

export type ItemId =
  | 'red_rna'
  | 'blue_rna'
  | 'green_rna'
  | 'yellow_rna'
  | 'purple_rna'
  | 'heated_purple_rna'
  | 'cooled_blue_rna'

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

export type PlayerStats = {
  cures: number
  sends: number
  pings: number
}

export type RacePartnerSnapshot = {
  code: string
  score: number
  status: RoomStatus
  raceFinished: 'won' | 'lost' | null
}

export type Player = {
  id: string
  name: string
  connected: boolean
  spectator?: boolean
  assignedStation?: Station
  itemInHand?: ItemId | null
  cures?: number
  sends?: number
  pings?: number
}

export type PublicRoom = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  limits: { maxPlayers: number }
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

export type Session = {
  code: string
  playerId: string
  name: string
}

export type RoomRecord = {
  bestScore: number
  bestWave: number
  bestStreak: number
}

export type TutorialStep = 'extract_red' | 'send_or_switch' | 'deliver' | 'done'
