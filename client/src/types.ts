export type Lang = 'sv' | 'en'
export type RoomStatus = 'lobby' | 'playing' | 'gameover'
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
}

export type PlayerStats = {
  cures: number
  sends: number
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
  canStartSolo: boolean
  minPlayersMulti: number
  wave: number
  waveLabel: string
  alert: string | null
  alertItemId: ItemId | null
  stats: Record<string, PlayerStats>
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

export type TutorialStep = 'extract_red' | 'send_or_switch' | 'deliver' | 'done'
