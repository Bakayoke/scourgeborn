import type { GameOutcome, Lang, PlayerRole, RoomStatus } from './types'

const sv = {
  brand: 'Scourgeborn',
  tagline: 'Lita på ingen. Rensa världen — eller smitta den.',
  heroSupport:
    'Mobil-first social deduction. Några av er bär pesten i blodet. Tre lyckade expeditioner eller tre sabotage avgör allt.',
  outbreakStamp: 'HEMLIGA ROLLER · EXPEDITION · FÖRRÄDERI',
  create: 'Skapa spel',
  join: 'Gå med',
  findGame: 'Hitta spel',
  yourName: 'Ditt namn',
  roomCode: 'Sessionskod',
  start: 'Starta',
  startGame: 'Starta spelet',
  backToLobby: 'Tillbaka till lobby',
  back: 'Tillbaka',
  lobby: 'Lobby',
  waitingHost: 'Väntar på att värden startar…',
  waitingHostFinale: 'Väntar på att värden tar dig tillbaka…',
  players: 'Spelare',
  host: 'Värd',
  code: 'Kod',
  copy: 'Kopiera',
  copied: 'Kopierat!',
  leave: 'Lämna',
  language: 'Språk',
  freeTier: 'Gratis · max 5 spelare · minst 5 för start',
  partyTier: 'Party aktivt · fler spelare',
  unlockParty: 'Lås upp Party',
  partyDay: '24 timmar',
  partyWeek: '7 dagar',
  partyBlurb: 'Fler spelare med Party-pass.',
  redeemCode: 'Har du en kod?',
  redeem: 'Lös in',
  firstTime: 'Första gången −30%',
  partyActive: 'Party aktivt',
  partyUntil: 'till',
  stripeMissing: 'Stripe är inte konfigurerat ännu.',
  partyThanks: 'Party upplåst — tack!',
  partyCancel: 'Köp avbrutet.',
  error: 'Något gick fel',
  connecting: 'Ansluter…',
  shareHint: 'Dela koden — alla behöver sin egen mobil.',
  showQr: 'Visa QR',
  hideQr: 'Stäng QR',
  joinUrl: 'Gå med på scourgeborn.com',
  tvMode: 'TV-läge',
  tvExit: 'Lämna TV',
  joinOnPhone: 'Gå med på mobilen med koden',
  copyLink: 'Kopiera länk',
  waitlist: 'Väntelista',
  spectator: 'Åskådare',
  spectatorHint: 'Du tittar med — du spelar från nästa lobby',
  reconnecting: 'Återansluter…',
  disconnected: 'Ingen anslutning',
  connected: 'Ansluten',
  openLobby: 'Öppen lobby',
  openLobbyOn: 'Synlig under Hitta spel',
  openLobbyOff: 'Privat kod',
  openLobbyNeedParty: 'Öppen lobby kräver Party-pass.',
  howTo: 'Så funkar det',
  howToSteps: [
    '5+ spelare — några är hemliga Scourgeborn',
    'Expeditionsledaren väljer en partner till uppdraget',
    'Alla röstar Ja/Nej på teamet',
    'Uppdragsteamet röstar Rensa eller Smitta i hemlighet',
    '3 rensade uppdrag = oskuldiga vinner · 3 smittade = Scourgeborn vinner',
  ],
  tableName: 'Namn',
  tableStatus: 'Status',
  statusOnline: 'Online',
  statusOffline: 'Offline',
  statusReady: 'Klar',
  statusWaiting: 'Väntar…',
  roleHost: 'Värd',
  roleSpectator: 'Åskådare',
  needPlayers: 'Minst 5 spelare måste vara anslutna',
  hostHint: 'Du är värd — starta när alla är här.',
  timerLeft: 's kvar',
  phaseRoles: 'Avslöja roll',
  phaseElection: 'Välj expedition',
  phaseTeamVote: 'Godkänn team?',
  phaseMission: 'Uppdrag',
  phaseResolution: 'Resultat',
  phaseFinished: 'Spelet är slut',
  tapReveal: 'Tryck för att avslöja din roll',
  roleInnocent: 'Oskuldig',
  roleInnocentDesc: 'Du är ren. Rösta alltid Rensa på uppdrag.',
  roleScourgeborn: 'Scourgeborn',
  roleScourgebornDesc: 'Du bär pesten. Sabotera i hemlighet — eller låtsas vara ren.',
  rolesWaiting: 'väntar på att alla avslöjar',
  leaderPick: 'Välj din expeditionspartner',
  leaderIs: 'Expeditionsledare',
  proposeTeam: 'Föreslå team',
  voteYes: 'Ja',
  voteNo: 'Nej',
  teamVoteHint: 'Godkänner du detta uppdragsteam?',
  teamWaiting: 'Väntar på röster',
  missionCleanse: 'Rensa',
  missionInfect: 'Smitta',
  missionHint: 'Välj i hemlighet — bara du ser detta.',
  missionWaiting: 'Väntar på uppdragsröster',
  missionSuccess: 'Uppdraget lyckades — området är rent',
  missionFail: 'Uppdraget saboterades — smittan sprider sig',
  autoAdvance: 'Nästa runda startar automatiskt…',
  scoreCleanse: 'Rensade',
  scoreInfect: 'Smittade',
  failedElections: 'Misslyckade val',
  outcomeInnocents: 'Oskuldiga vinner!',
  outcomeScourgeborn: 'Scourgeborn vinner!',
  outcomeInnocentsDesc: 'Pestens förrädare avslöjades i tid.',
  outcomeScourgebornDesc: 'Smittan segrade — världen faller.',
  endParty: 'Avsluta',
  onMission: 'På uppdrag',
  voted: 'Röstat',
  innocentRole: 'Oskuldig',
  scourgebornRole: 'Scourgeborn',
}

const en: typeof sv = {
  brand: 'Scourgeborn',
  tagline: 'Trust no one. Cleanse the world — or infect it.',
  heroSupport:
    'Mobile-first social deduction. Some of you carry the plague in your blood. Three successful missions or three sabotages decide everything.',
  outbreakStamp: 'SECRET ROLES · EXPEDITION · BETRAYAL',
  create: 'Create game',
  join: 'Join',
  findGame: 'Find game',
  yourName: 'Your name',
  roomCode: 'Room code',
  start: 'Start',
  startGame: 'Start game',
  backToLobby: 'Back to lobby',
  back: 'Back',
  lobby: 'Lobby',
  waitingHost: 'Waiting for host to start…',
  waitingHostFinale: 'Waiting for host to return to lobby…',
  players: 'Players',
  host: 'Host',
  code: 'Code',
  copy: 'Copy',
  copied: 'Copied!',
  leave: 'Leave',
  language: 'Language',
  freeTier: 'Free · max 5 players · min 5 to start',
  partyTier: 'Party active · more players',
  unlockParty: 'Unlock Party',
  partyDay: '24 hours',
  partyWeek: '7 days',
  partyBlurb: 'More players with a Party pass.',
  redeemCode: 'Have a code?',
  redeem: 'Redeem',
  firstTime: 'First time −30%',
  partyActive: 'Party active',
  partyUntil: 'until',
  stripeMissing: 'Stripe is not configured yet.',
  partyThanks: 'Party unlocked — thanks!',
  partyCancel: 'Purchase cancelled.',
  error: 'Something went wrong',
  connecting: 'Connecting…',
  shareHint: 'Share the code — everyone needs their own phone.',
  showQr: 'Show QR',
  hideQr: 'Hide QR',
  joinUrl: 'Join at scourgeborn.com',
  tvMode: 'TV mode',
  tvExit: 'Exit TV',
  joinOnPhone: 'Join on your phone with the code',
  copyLink: 'Copy link',
  waitlist: 'Waitlist',
  spectator: 'Spectator',
  spectatorHint: 'You are watching — play from the next lobby',
  reconnecting: 'Reconnecting…',
  disconnected: 'No connection',
  connected: 'Connected',
  openLobby: 'Open lobby',
  openLobbyOn: 'Listed under Find game',
  openLobbyOff: 'Private code',
  openLobbyNeedParty: 'Open lobby requires a Party pass.',
  howTo: 'How it works',
  howToSteps: [
    '5+ players — some are secret Scourgeborn',
    'Expedition leader picks one partner for the mission',
    'Everyone votes Yes/No on the team',
    'Mission team secretly votes Cleanse or Infect',
    '3 cleansed missions = innocents win · 3 infected = Scourgeborn win',
  ],
  tableName: 'Name',
  tableStatus: 'Status',
  statusOnline: 'Online',
  statusOffline: 'Offline',
  statusReady: 'Ready',
  statusWaiting: 'Waiting…',
  roleHost: 'Host',
  roleSpectator: 'Spectator',
  needPlayers: 'At least 5 players must be connected',
  hostHint: 'You are the host — start when everyone is here.',
  timerLeft: 's left',
  phaseRoles: 'Reveal role',
  phaseElection: 'Pick expedition',
  phaseTeamVote: 'Approve team?',
  phaseMission: 'Mission',
  phaseResolution: 'Result',
  phaseFinished: 'Game over',
  tapReveal: 'Tap to reveal your role',
  roleInnocent: 'Innocent',
  roleInnocentDesc: 'You are pure. Always vote Cleanse on missions.',
  roleScourgeborn: 'Scourgeborn',
  roleScourgebornDesc: 'You carry the plague. Sabotage in secret — or pretend to be pure.',
  rolesWaiting: 'waiting for everyone to reveal',
  leaderPick: 'Choose your expedition partner',
  leaderIs: 'Expedition leader',
  proposeTeam: 'Propose team',
  voteYes: 'Yes',
  voteNo: 'No',
  teamVoteHint: 'Do you approve this mission team?',
  teamWaiting: 'Waiting for votes',
  missionCleanse: 'Cleanse',
  missionInfect: 'Infect',
  missionHint: 'Choose in secret — only you see this.',
  missionWaiting: 'Waiting for mission votes',
  missionSuccess: 'Mission succeeded — the area is cleansed',
  missionFail: 'Mission sabotaged — the plague spreads',
  autoAdvance: 'Next round starting automatically…',
  scoreCleanse: 'Cleansed',
  scoreInfect: 'Infected',
  failedElections: 'Failed elections',
  outcomeInnocents: 'Innocents win!',
  outcomeScourgeborn: 'Scourgeborn win!',
  outcomeInnocentsDesc: 'The traitors were stopped in time.',
  outcomeScourgebornDesc: 'The plague prevailed — the world falls.',
  endParty: 'End session',
  onMission: 'On mission',
  voted: 'Voted',
  innocentRole: 'Innocent',
  scourgebornRole: 'Scourgeborn',
}

const STRINGS = { sv, en } as const

export function loadLanguage(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get('lang')
    if (q === 'en' || q === 'sv') return q
    const stored = localStorage.getItem('scourgeborn-lang')
    if (stored === 'en' || stored === 'sv') return stored
  } catch {
    /* ignore */
  }
  return 'sv'
}

export function rememberLanguage(lang: Lang) {
  localStorage.setItem('scourgeborn-lang', lang)
}

export function t(lang: Lang) {
  return STRINGS[lang]
}

export function phaseLabel(status: RoomStatus, lang: Lang): string {
  const ui = t(lang)
  switch (status) {
    case 'roles':
      return ui.phaseRoles
    case 'election':
      return ui.phaseElection
    case 'team_vote':
      return ui.phaseTeamVote
    case 'mission':
      return ui.phaseMission
    case 'resolution':
      return ui.phaseResolution
    case 'finished':
      return ui.phaseFinished
    default:
      return ui.lobby
  }
}

export function roleLabel(role: PlayerRole, lang: Lang): string {
  const ui = t(lang)
  return role === 'scourgeborn' ? ui.roleScourgeborn : ui.roleInnocent
}

export function outcomeLabel(outcome: GameOutcome, lang: Lang): string {
  const ui = t(lang)
  if (outcome === 'innocents_win') return ui.outcomeInnocents
  if (outcome === 'scourgeborn_win') return ui.outcomeScourgeborn
  return ''
}

export function playerName(room: { players: { id: string; name: string }[] }, id: string | null) {
  if (!id) return '—'
  return room.players.find((p) => p.id === id)?.name ?? '—'
}
