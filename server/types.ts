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

export type RoomStatus = 'lobby' | 'playing' | 'gameover'

export type Station = 'extractor' | 'synthesizer' | 'incubator'

/** Craftable / deliverable items */
export type ItemId =
  | 'red_rna'
  | 'blue_rna'
  | 'purple_rna'
  | 'heated_purple_rna'
  | 'cooled_blue_rna'

export type Patient = {
  id: string
  requiredVaccine: ItemId
  timeRemaining: number
  maxTime: number
}

export type LabPlayerState = {
  assignedStation: Station
  /** Solo: which station tab is active */
  activeStation: Station
  itemInHand: ItemId | null
  /** Synthesizer holds one input while waiting for the second */
  synthSlot: ItemId | null
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
  score: number
  misses: number
  patients: Patient[]
  lab: Record<string, LabPlayerState>
  lastTickAt: number
  lastSpawnAt: number
  lastEventSv: string | null
  lastEventEn: string | null
}

export type PublicLabPlayer = Player & {
  assignedStation: Station
  itemInHand: ItemId | null
}

export type PublicRoom = {
  code: string
  hostId: string
  players: PublicLabPlayer[]
  language: Lang
  status: RoomStatus
  mode: GameMode
  premiumTier: PremiumTier
  premiumExpiresAt: number | null
  limits: PremiumLimits
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
}
