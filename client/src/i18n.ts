import type { ItemId, Lang, Station } from './types'

const ITEM_SV: Record<ItemId, string> = {
  red_rna: 'Röd RNA',
  blue_rna: 'Blå RNA',
  purple_rna: 'Lila RNA',
  heated_purple_rna: 'Uppvärmd lila RNA',
  cooled_blue_rna: 'Kyld blå RNA',
}

const ITEM_EN: Record<ItemId, string> = {
  red_rna: 'Red RNA',
  blue_rna: 'Blue RNA',
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
    'Som Overcooked, fast i ett viruslabb. Extrahera, mixa, värme/kyla — och skicka prover till varandra i multi.',
  create: 'Skapa labb',
  join: 'Gå med',
  yourName: 'Ditt namn',
  roomCode: 'Kod',
  startSolo: 'Starta solo (träning)',
  startMulti: 'Starta party!',
  waitingHost: 'Väntar på värd…',
  shareHint: 'Dela koden. I multi får varje person EN station — prata högt!',
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
  soloFlow: 'RÖD + BLÅ → LILA → VÄRM/KYL → leverera',
  coachSolo: 'Alla stationer på en skärm — tryck direkt, scrolla vid behov.',
  howTo: 'Snabbguide',
  howToSteps: [
    'Se färger — RÖD, BLÅ, LILA, VARM, KYLD.',
    'Extraktor → Synthesizer → Inkubator (samma skärm i solo).',
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
    'Like Overcooked in a virus lab. Extract, mix, heat/cool — pass samples in multiplayer.',
  create: 'Create lab',
  join: 'Join',
  yourName: 'Your name',
  roomCode: 'Code',
  startSolo: 'Start solo (practice)',
  startMulti: 'Start party!',
  waitingHost: 'Waiting for host…',
  shareHint: 'Share the code. In multi each person gets ONE station — talk loud!',
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
  soloFlow: 'RED + BLUE → PURPLE → HEAT/COLD → deliver',
  coachSolo: 'All stations on one screen — tap directly, scroll if needed.',
  howTo: 'Quick guide',
  howToSteps: [
    'See colors — RED, BLUE, PURPLE, HOT, COLD.',
    'Extractor → Synthesizer → Incubator.',
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
