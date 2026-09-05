import type { ItemId, Lang, Station } from './types'

const ITEM_SV: Record<ItemId, string> = {
  red_rna: 'Röd RNA',
  blue_rna: 'Blå RNA',
  green_rna: 'Grön RNA',
  yellow_rna: 'Gul RNA',
  purple_rna: 'Lila RNA',
  heated_purple_rna: 'Uppvärmd lila RNA',
  cooled_blue_rna: 'Kyld blå RNA',
}

const ITEM_EN: Record<ItemId, string> = {
  red_rna: 'Red RNA',
  blue_rna: 'Blue RNA',
  green_rna: 'Green RNA',
  yellow_rna: 'Yellow RNA',
  purple_rna: 'Purple RNA',
  heated_purple_rna: 'Heated Purple RNA',
  cooled_blue_rna: 'Cooled Blue RNA',
}

export function itemLabel(id: ItemId, lang: Lang) {
  return lang === 'en' ? ITEM_EN[id] : ITEM_SV[id]
}

export function stationLabel(station: Station, lang: Lang) {
  const sv = { extractor: 'Extraktor', synthesizer: 'Synthesizer', incubator: 'Inkubator' }
  const en = { extractor: 'Extractor', synthesizer: 'Synthesizer', incubator: 'Incubator' }
  return lang === 'en' ? en[station] : sv[station]
}

const sv = {
  brand: 'Scourgeborn',
  tagline: 'Lab-läge — bota patienter innan tiden tar slut.',
  heroSupport:
    'Party-läge: TV/dator visar lobbyn, alla joinar på mobilen. Sen skriker ni tills labbet exploderar.',
  create: 'Skapa labb',
  join: 'Gå med',
  yourName: 'Ditt namn',
  roomCode: 'Kod',
  startSolo: 'Starta solo (träning)',
  startMulti: 'Starta party!',
  waitingHost: 'Väntar på värd…',
  shareHint: 'Party: en skärm i lobbyn, resten joinar på mobil.',
  partySetupTitle: 'Så startar ni party-läge',
  partySetupSteps: [
    '1. Värd öppnar detta på TV eller laptop (denna skärm).',
    '2. Vänner skannar QR eller går till scourgeborn.com och anger koden.',
    '3. Varje person får EN station på sin mobil — prata högt!',
    '4. Värden trycker Starta party när alla är med.',
  ],
  tvModeHint: 'TV-LÄGE: Låt denna skärm stå kvar synlig för alla',
  partyScanHint: 'Skanna QR eller gå till länken på mobilen',
  partyGuestMsg: 'Du är med! Väntar på att värden startar…',
  partyRoster: 'Spelare i lobbyn',
  hostLabel: 'värd',
  partyNeedMore: 'Minst 2 spelare för party — eller starta solo (träning) nedan.',
  leave: 'Lämna',
  backToLobby: 'Nytt spel',
  endParty: 'Avsluta',
  score: 'Poäng',
  misses: 'Misslyckanden',
  patients: 'Patienter',
  noPatients: 'Inga patienter just nu',
  inHand: 'I handen',
  emptyHand: 'Tomt',
  extractRed: 'RÖD',
  extractBlue: 'BLÅ',
  synthesize: 'Mixa',
  synthSlot: 'I synthesizern',
  heat: 'Värme',
  cool: 'Kyla',
  deliver: 'Ge vaccin!',
  drop: 'Släng',
  sendTo: 'Skicka till',
  switchStation: 'Byt station',
  wrongVaccine: 'Ingen patient behöver detta — mixa eller värme vidare.',
  gameOver: 'Labbt stängt',
  youAre: 'DU ÄR',
  yellRole: 'Ropa till laget!',
  teamBoard: 'Laget',
  pingNeedRed: 'Behöver RÖD!',
  pingNeedBlue: 'Behöver BLÅ!',
  pingNeedMix: 'Behöver MIX!',
  pingNeedHeat: 'Behöver VÄRME!',
  pingNeedCool: 'Behöver KYLA!',
  pingDeliver: 'LEVERERA!',
  highlights: 'Matchens hjältar',
  cures: 'botade',
  sends: 'skickade',
  tutorialTitle: '30-sek intro',
  tutorialExtract: '1. Tryck RÖD — ta ett prov',
  tutorialSend: '2. Skicka till laget (multi) eller mixa/värme i samma vy (solo)',
  tutorialDeliver: '3. Ge vaccin när provet matchar patienten!',
  tutorialDone: 'Klar! Starta när alla är redo.',
  tutorialTry: 'Prova nu',
  tutorialSkip: 'Hoppa över',
  soloFlow: 'RÖD·BLÅ·GRÖN·GUL → LILA → VÄRM/KYL → leverera',
  coachSolo: 'Alla stationer på en skärm — tryck direkt, scrolla vid behov.',
  howTo: 'Snabbguide',
  howToSteps: [
    'Se färger — RÖD, BLÅ, GRÖN, GUL, LILA, VARM, KYLD.',
    'Party: TV för lobby, mobiler för stationer.',
    'Multi: skicka prov — ropa högt!',
    'Ge vaccin när provet matchar patienten.',
  ],
  coachMulti: 'Du har EN station. Skicka prover. ROPA!',
  connected: 'Ansluten',
  connecting: 'Ansluter…',
  error: 'Något gick fel',
  language: 'Språk',
}

const en: typeof sv = {
  brand: 'Scourgeborn',
  tagline: 'Lab mode — cure patients before time runs out.',
  heroSupport:
    'Party mode: TV/laptop shows the lobby, everyone joins on their phone. Then yell until the lab explodes.',
  create: 'Create lab',
  join: 'Join',
  yourName: 'Your name',
  roomCode: 'Code',
  startSolo: 'Start solo (practice)',
  startMulti: 'Start party!',
  waitingHost: 'Waiting for host…',
  shareHint: 'Party: one screen in the lobby, everyone else joins on mobile.',
  partySetupTitle: 'How to start party mode',
  partySetupSteps: [
    '1. Host opens this on a TV or laptop (this screen).',
    '2. Friends scan the QR or go to scourgeborn.com and enter the code.',
    '3. Each person gets ONE station on their phone — talk loud!',
    '4. Host presses Start party when everyone is in.',
  ],
  tvModeHint: 'TV MODE: Keep this screen visible for everyone',
  partyScanHint: 'Scan QR or open the link on your phone',
  partyGuestMsg: 'You are in! Waiting for the host to start…',
  partyRoster: 'Players in lobby',
  hostLabel: 'host',
  partyNeedMore: 'Need at least 2 for party — or start solo (practice) below.',
  leave: 'Leave',
  backToLobby: 'New game',
  endParty: 'End session',
  score: 'Score',
  misses: 'Failures',
  patients: 'Patients',
  noPatients: 'No patients right now',
  inHand: 'In hand',
  emptyHand: 'Empty',
  extractRed: 'RED',
  extractBlue: 'BLUE',
  synthesize: 'Mix',
  synthSlot: 'In synthesizer',
  heat: 'Heat',
  cool: 'Cool',
  deliver: 'Deliver!',
  drop: 'Drop',
  sendTo: 'Send to',
  switchStation: 'Switch station',
  wrongVaccine: 'No patient needs this — keep crafting.',
  gameOver: 'Lab shut down',
  youAre: 'YOU ARE',
  yellRole: 'Yell to your team!',
  teamBoard: 'Team',
  pingNeedRed: 'Need RED!',
  pingNeedBlue: 'Need BLUE!',
  pingNeedMix: 'Need MIX!',
  pingNeedHeat: 'Need HEAT!',
  pingNeedCool: 'Need COOL!',
  pingDeliver: 'DELIVER!',
  highlights: 'Match highlights',
  cures: 'cured',
  sends: 'sent',
  tutorialTitle: '30-sec intro',
  tutorialExtract: '1. Press RED — grab a sample',
  tutorialSend: '2. Send to teammate (multi) or mix/heat on the same screen (solo)',
  tutorialDeliver: '3. Deliver when the sample matches the patient!',
  tutorialDone: 'Done! Start when everyone is ready.',
  tutorialTry: 'Try it',
  tutorialSkip: 'Skip',
  soloFlow: 'RED·BLUE·GREEN·YELLOW → PURPLE → HEAT/COLD → deliver',
  coachSolo: 'All stations on one screen — tap directly, scroll if needed.',
  howTo: 'Quick guide',
  howToSteps: [
    'See colors — RED, BLUE, GREEN, YELLOW, PURPLE, HOT, COLD.',
    'Party: TV for lobby, phones for stations.',
    'Multi: pass samples — yell loud!',
    'Deliver when the sample matches the patient.',
  ],
  coachMulti: 'You have ONE station. Pass samples. YELL!',
  connected: 'Connected',
  connecting: 'Connecting…',
  error: 'Something went wrong',
  language: 'Language',
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
