import type { Lang } from './types'

const sv = {
  brand: 'Party Paths',
  tagline: 'Rösta er igenom äventyret — tillsammans.',
  heroSupport:
    'Ett demokratiskt party-DnD där gruppen väljer klass, sen röstar fram varje väg genom skogar, orcher, trollkarlar och drakar.',
  create: 'Skapa äventyr',
  join: 'Gå med',
  yourName: 'Ditt namn',
  roomCode: 'Sessionskod',
  start: 'Starta',
  back: 'Tillbaka',
  lobby: 'Lobby',
  pickClass: 'Välj din klass',
  startAdventure: 'Börja äventyret',
  waitingHost: 'Väntar på att värden startar…',
  players: 'Spelare',
  host: 'Värd',
  code: 'Kod',
  copy: 'Kopiera',
  copied: 'Kopierat!',
  vote: 'Rösta',
  yourVote: 'Din röst',
  lockVotes: 'Lås röster nu',
  votesIn: 'röster inne',
  seconds: 's',
  partyHp: 'Gruppens HP',
  enemy: 'Fiende',
  winning: 'Vinnande val',
  rematch: 'Spela igen',
  leave: 'Lämna',
  language: 'Språk',
  freeTier: 'Gratis · max 5 · kort kampanj',
  partyTier: 'Party aktivt · obegränsat · hela Emberwood',
  unlockParty: 'Lås upp Party',
  partyDay: '24 timmar',
  partyWeek: '7 dagar',
  partyBlurb:
    'Fler spelare och hela kampanjen med trollkarlstornet och draken Ember.',
  redeemCode: 'Har du en kod?',
  redeem: 'Lös in',
  firstTime: 'Första gången −30%',
  partyActive: 'Party aktivt',
  partyUntil: 'till',
  stripeMissing: 'Stripe är inte konfigurerat ännu på servern.',
  partyThanks: 'Party upplåst — tack!',
  partyCancel: 'Köp avbrutet.',
  error: 'Något gick fel',
  connecting: 'Ansluter…',
  shareHint: 'Dela koden så att vännerna kan gå med.',
  ending: 'Slutet',
  classPicked: 'vald',
  needClasses: 'Alla måste välja klass innan start.',
  combat: 'Strid',
  scene: 'Scen',
  closeRace: 'Nästan oavgjort!',
  tense: 'Sista sekunderna…',
  votedFor: 'röstade',
  heroMoment: 'Klassförmåga',
  shareCard: 'Dela resultat',
  sharing: 'Delar…',
  shareSaved: 'Bild sparad / delad',
  pause: 'Pausa',
  resume: 'Fortsätt',
  paused: 'Pausat',
  showQr: 'Visa QR',
  hideQr: 'Stäng QR',
  dmNote: 'DM-anteckning',
  dmPlaceholder: 'Skriv en mening till gruppen…',
  sendDm: 'Visa för alla',
  clearDm: 'Rensa',
  modes: 'Spelläge',
  modeStory: 'Hela sagan',
  modeOrcs: 'Bara orcher',
  modeDragon: 'Bara draken',
  modeChaos: 'Kaos-läge',
  modeDragonLocked: 'Drake (Party)',
  joinUrl: 'Gå med på partypaths.com',
  tvMode: 'TV-läge',
  tvExit: 'Lämna TV',
  tapToVote: 'Tryck på ett val nedan',
  waitingOthers: 'Väntar på övriga spelare…',
  youVoted: 'Du röstade',
  changeVote: 'Du kan byta röst tills omröstningen låses',
  joinOnPhone: 'Gå med på mobilen med koden',
  readyCount: 'klara med klass',
  pickClassHint: 'Välj din klass nedan',
  classReadyWait: 'Klass vald — väntar på att värden startar…',
  votePace: 'Diskussionstid',
  voteDiscuss: 'Ingen timer — diskutera fritt',
  vote30: '30 sek',
  vote60: '60 sek',
  vote90: '90 sek',
  vote120: '2 min',
  vote180: '3 min',
  voteDiscussLive: 'Diskutera fritt — värden låser när ni är klara',
  allVotedAuto: 'När alla röstat går ni vidare automatiskt',
}

const en: typeof sv = {
  brand: 'Party Paths',
  tagline: 'Vote your way through the adventure — together.',
  heroSupport:
    'A democratic party D&D where you pick classes, then vote every path through forests, orcs, wizards, and dragons.',
  create: 'Create adventure',
  join: 'Join',
  yourName: 'Your name',
  roomCode: 'Session code',
  start: 'Start',
  back: 'Back',
  lobby: 'Lobby',
  pickClass: 'Pick your class',
  startAdventure: 'Begin adventure',
  waitingHost: 'Waiting for the host to start…',
  players: 'Players',
  host: 'Host',
  code: 'Code',
  copy: 'Copy',
  copied: 'Copied!',
  vote: 'Vote',
  yourVote: 'Your vote',
  lockVotes: 'Lock votes now',
  votesIn: 'votes in',
  seconds: 's',
  partyHp: 'Party HP',
  enemy: 'Enemy',
  winning: 'Winning choice',
  rematch: 'Play again',
  leave: 'Leave',
  language: 'Language',
  freeTier: 'Free · max 5 · short campaign',
  partyTier: 'Party active · unlimited · full Emberwood',
  unlockParty: 'Unlock Party',
  partyDay: '24 hours',
  partyWeek: '7 days',
  partyBlurb: 'More players and the full campaign with the wizard tower and Ember the dragon.',
  redeemCode: 'Have a code?',
  redeem: 'Redeem',
  firstTime: 'First time −30%',
  partyActive: 'Party active',
  partyUntil: 'until',
  stripeMissing: 'Stripe is not configured on the server yet.',
  partyThanks: 'Party unlocked — thank you!',
  partyCancel: 'Purchase cancelled.',
  error: 'Something went wrong',
  connecting: 'Connecting…',
  shareHint: 'Share the code so friends can join.',
  ending: 'The End',
  classPicked: 'chosen',
  needClasses: 'Everyone must pick a class before start.',
  combat: 'Combat',
  scene: 'Scene',
  closeRace: 'Almost a tie!',
  tense: 'Final seconds…',
  votedFor: 'voted',
  heroMoment: 'Class ability',
  shareCard: 'Share result',
  sharing: 'Sharing…',
  shareSaved: 'Image saved / shared',
  pause: 'Pause',
  resume: 'Resume',
  paused: 'Paused',
  showQr: 'Show QR',
  hideQr: 'Close QR',
  dmNote: 'DM note',
  dmPlaceholder: 'Write a line for the party…',
  sendDm: 'Show to all',
  clearDm: 'Clear',
  modes: 'Game mode',
  modeStory: 'Full story',
  modeOrcs: 'Orcs only',
  modeDragon: 'Dragon only',
  modeChaos: 'Chaos mode',
  modeDragonLocked: 'Dragon (Party)',
  joinUrl: 'Join at partypaths.com',
  tvMode: 'TV mode',
  tvExit: 'Exit TV',
  tapToVote: 'Tap a choice below',
  waitingOthers: 'Waiting for other players…',
  youVoted: 'You voted',
  changeVote: 'You can change your vote until voting is locked',
  joinOnPhone: 'Join on your phone with the code',
  readyCount: 'classes picked',
  pickClassHint: 'Pick your class below',
  classReadyWait: 'Class chosen — waiting for the host to start…',
  votePace: 'Discussion time',
  voteDiscuss: 'No timer — discuss freely',
  vote30: '30 sec',
  vote60: '60 sec',
  vote90: '90 sec',
  vote120: '2 min',
  vote180: '3 min',
  voteDiscussLive: 'Discuss freely — host locks when ready',
  allVotedAuto: 'When everyone has voted, you continue automatically',
}

export type UiStrings = typeof sv

export function t(lang: Lang): UiStrings {
  return lang === 'en' ? en : sv
}

export function detectPreferredLanguage(): Lang {
  try {
    const saved = localStorage.getItem('partypaths-lang')
    if (saved === 'sv' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  const langs = navigator.languages ?? [navigator.language]
  if (langs.some((l) => l.toLowerCase().startsWith('sv'))) return 'sv'
  return 'en'
}

export function rememberLanguage(lang: Lang) {
  try {
    localStorage.setItem('partypaths-lang', lang)
  } catch {
    /* ignore */
  }
}

export function formatExpiry(ts: number, lang: Lang) {
  return new Date(ts).toLocaleString(lang === 'en' ? 'en-GB' : 'sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function voteTimerLabel(ui: UiStrings, seconds: number): string {
  if (seconds <= 0) return ui.voteDiscuss
  if (seconds === 30) return ui.vote30
  if (seconds === 60) return ui.vote60
  if (seconds === 90) return ui.vote90
  if (seconds === 120) return ui.vote120
  if (seconds === 180) return ui.vote180
  return `${seconds}${ui.seconds}`
}
