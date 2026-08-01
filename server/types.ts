export type Lang = 'sv' | 'en'

export type PlayerClass = 'warrior' | 'mage' | 'ranger' | 'rogue' | 'cleric'

export type PremiumTier = 'free' | 'party'

export type PremiumLimits = {
  /** 0 = unlimited */
  maxPlayers: number
  /** free = short arc, party = full campaign */
  campaignMode: 'short' | 'full'
}

/** Rematch / start adventure variants */
export type AdventureMode = 'story' | 'orcs' | 'dragon' | 'chaos'

export type Localized = { sv: string; en: string }

export type ClassDef = {
  id: PlayerClass
  name: Localized
  blurb: Localized
  might: number
  arcana: number
  cunning: number
  ability: Localized
}

export type ChoiceEffects = {
  hp?: number
  flags?: Record<string, boolean | string | number>
  partyMightBonus?: number
  partyArcanaBonus?: number
  partyCunningBonus?: number
}

export type StoryChoice = {
  id: string
  text: Localized
  next: string
  effects?: ChoiceEffects
  requireFlag?: string
  requireFlagAbsent?: string
  favorStat?: 'might' | 'arcana' | 'cunning'
}

export type CombatEnemy = {
  name: Localized
  hp: number
  attack: number
}

export type CampaignNode = {
  id: string
  title: Localized
  narrative: Localized
  choices?: StoryChoice[]
  combat?: {
    enemy: CombatEnemy
    fleeNext?: string
    winNext: string
    loseNext: string
  }
  ending?: boolean
  partyOnly?: boolean
}

export type Player = {
  id: string
  name: string
  connected: boolean
  classId: PlayerClass | null
  /** Mid-game joiners watch only until rematch/new lobby */
  spectator?: boolean
}

export type AdventureLogEntry = {
  nodeId: string
  title: Localized
  winningText: Localized
  closeRace?: boolean
  heroBanner?: Localized
}

export type RoomNotice = {
  kind: 'host_transfer' | 'revote'
  hostName: string
  at: number
}

export type RoomStatus = 'lobby' | 'class_pick' | 'scene' | 'voting' | 'resolve' | 'finished' | 'paused'

export type VoteTally = Record<string, number>

export type VoteReveal = {
  playerId: string
  playerName: string
  choiceId: string
  choiceText: Localized
}

export type LastResolve = {
  winningChoiceId: string
  winningText: Localized
  tally: VoteTally
  narrativeExtra?: Localized
  combatLog?: Localized
  /** Big class-ability shoutout */
  heroBanner?: Localized
  voteReveal?: VoteReveal[]
  closeRace?: boolean
}

export type Room = {
  code: string
  hostId: string
  players: Player[]
  language: Lang
  status: RoomStatus
  /** Status before pause */
  statusBeforePause: RoomStatus | null
  premiumExpiresAt: number | null
  /** Party host opened this lobby on the public find list */
  isPublic: boolean
  waitlist: { id: string; name: string; at: number }[]
  nodeId: string
  partyHp: number
  partyHpMax: number
  flags: Record<string, boolean | string | number>
  campaignMode: 'short' | 'full'
  adventureMode: AdventureMode
  /** Vote window in seconds. 0 = discuss freely (no timer). */
  voteSeconds: number
  /** Hide live tallies until votes lock */
  secretBallot: boolean
  /**
   * When false (default), the host is dungeon master only —
   * no class, no vote. When true, host plays as an adventurer too.
   */
  hostPlays: boolean
  /**
   * When true, lock as soon as every adventurer has voted.
   * When false, only the host/DM can advance (recommended with voteSeconds 0).
   */
  autoLockWhenAllVoted: boolean
  votes: Record<string, string>
  voteEndsAt: number
  /** Remaining ms when paused mid-vote */
  voteRemainingMs: number
  lastResolve: LastResolve | null
  /** Path of winning choices this adventure */
  adventureLog: AdventureLogEntry[]
  activeChoiceIds: string[]
  combatEnemyHp: number | null
  /** Host DM interjection shown to all */
  dmNote: string
  /** Ephemeral UI notice (host transfer, etc.) */
  notice: RoomNotice | null
  updatedAt: number
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
  limits: PremiumLimits
  isPublic: boolean
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
  autoLockWhenAllVoted: boolean
  choices: PublicChoice[]
  yourVote: string | null
  voteEndsAt: number
  votedCount: number
  voterCount: number
  lastResolve: {
    winningChoiceId: string
    winningText: string
    tally: VoteTally
    narrativeExtra?: string
    combatLog?: string
    heroBanner?: string
    voteReveal?: { playerId: string; playerName: string; choiceId: string; choiceText: string }[]
    closeRace?: boolean
  } | null
  adventureLog: { title: string; winningText: string; closeRace?: boolean; heroBanner?: string }[]
  combat: { enemyName: string; enemyHp: number; enemyHpMax: number } | null
  isEnding: boolean
  dmNote: string
  paused: boolean
  notice: string | null
  youAreSpectator: boolean
  /** Host is DM-only (not playing a character) */
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
