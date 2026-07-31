export type Lang = 'sv' | 'en'
export type PlayerClass = 'warrior' | 'mage' | 'ranger' | 'rogue' | 'cleric'
export type RoomStatus =
  | 'lobby'
  | 'class_pick'
  | 'scene'
  | 'voting'
  | 'resolve'
  | 'finished'
  | 'paused'
export type PremiumTier = 'free' | 'party'
export type AdventureMode = 'story' | 'orcs' | 'dragon' | 'chaos'

export type Player = {
  id: string
  name: string
  connected: boolean
  classId: PlayerClass | null
  spectator?: boolean
}

export type PublicChoice = {
  id: string
  text: string
  votes: number
}

export type PublicRoom = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  premiumTier: PremiumTier
  premiumExpiresAt: number | null
  limits: { maxPlayers: number; campaignMode: 'short' | 'full' }
  waitlist: { id: string; name: string; at: number }[]
  nodeId: string
  title: string
  narrative: string
  partyHp: number
  partyHpMax: number
  flags: Record<string, boolean | string | number>
  campaignMode: 'short' | 'full'
  adventureMode: AdventureMode
  /** 0 = discuss freely */
  voteSeconds: number
  secretBallot: boolean
  hostPlays: boolean
  choices: PublicChoice[]
  yourVote: string | null
  voteEndsAt: number
  votedCount: number
  voterCount: number
  lastResolve: {
    winningChoiceId: string
    winningText: string
    tally: Record<string, number>
    narrativeExtra?: string
    combatLog?: string
    heroBanner?: string
    closeRace?: boolean
    voteReveal?: { playerId: string; playerName: string; choiceId: string; choiceText: string }[]
  } | null
  adventureLog: { title: string; winningText: string; closeRace?: boolean; heroBanner?: string }[]
  combat: { enemyName: string; enemyHp: number; enemyHpMax: number } | null
  isEnding: boolean
  dmNote: string
  paused: boolean
  notice: string | null
  youAreSpectator: boolean
  youAreDm: boolean
  classes: {
    id: PlayerClass
    name: string
    blurb: string
    might: number
    arcana: number
    cunning: number
    ability: string
  }[]
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
