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

export type LabLogKind = 'cure' | 'miss' | 'send' | 'ping' | 'drop' | 'wave' | 'spawn' | 'system' | 'victory'

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
}
