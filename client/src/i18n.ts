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
  startSolo: 'Starta solo',
  startMulti: 'Starta multi',
  waitingHost: 'Väntar på värd…',
  shareHint: 'Dela koden. I multi får varje person EN station på mobilen.',
  leave: 'Lämna',
  backToLobby: 'Nytt spel',
  endParty: 'Avsluta',
  score: 'Poäng',
  misses: 'Misslyckanden',
  patients: 'Patienter',
  noPatients: 'Inga patienter just nu',
  inHand: 'I handen',
  emptyHand: 'Tomt',
  extractRed: 'Extrahera röd RNA',
  extractBlue: 'Extrahera blå RNA',
  synthesize: 'Ladda / Mixa i synthesizer',
  synthSlot: 'I synthesizern',
  heat: 'Värme (lila → uppvärmd)',
  cool: 'Kyla (blå → kyld)',
  deliver: 'Ge vaccin till patient',
  drop: 'Släng prov',
  sendTo: 'Skicka till',
  switchStation: 'Byt station',
  gameOver: 'Labbt stängt',
  youWin: 'Bra jobbat!',
  howTo: 'Så funkar det',
  howToSteps: [
    'Patienter behöver specifika vaccin (t.ex. Uppvärmd lila RNA).',
    'Extraktor: ta röd eller blå RNA.',
    'Synthesizer: ladda röd + blå → lila RNA.',
    'Inkubator: värme på lila, eller kyla blå.',
    'Multi: skicka prov till rätt kollega — prata!',
    'Tryck "Ge vaccin" när du har rätt prov i handen.',
  ],
  coachMulti: 'Du har EN station. Skicka prover till laget. Prata!',
  coachSolo: 'Byt flik mellan stationerna. Gör vaccinet som patienten behöver.',
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
  startSolo: 'Start solo',
  startMulti: 'Start multiplayer',
  waitingHost: 'Waiting for host…',
  shareHint: 'Share the code. In multi each person gets ONE station on their phone.',
  leave: 'Leave',
  backToLobby: 'New game',
  endParty: 'End session',
  score: 'Score',
  misses: 'Failures',
  patients: 'Patients',
  noPatients: 'No patients right now',
  inHand: 'In hand',
  emptyHand: 'Empty',
  extractRed: 'Extract Red RNA',
  extractBlue: 'Extract Blue RNA',
  synthesize: 'Load / Mix in synthesizer',
  synthSlot: 'In synthesizer',
  heat: 'Heat (purple → heated)',
  cool: 'Cool (blue → cooled)',
  deliver: 'Deliver to patient',
  drop: 'Drop sample',
  sendTo: 'Send to',
  switchStation: 'Switch station',
  gameOver: 'Lab shut down',
  youWin: 'Great work!',
  howTo: 'How it works',
  howToSteps: [
    'Patients need specific vaccines (e.g. Heated Purple RNA).',
    'Extractor: get red or blue RNA.',
    'Synthesizer: load red + blue → purple RNA.',
    'Incubator: heat purple, or cool blue.',
    'Multi: send samples to the right teammate — talk!',
    'Press "Deliver" when you hold the right sample.',
  ],
  coachMulti: 'You have ONE station. Pass samples to teammates. Talk!',
  coachSolo: 'Switch tabs between stations. Craft what the patient needs.',
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
