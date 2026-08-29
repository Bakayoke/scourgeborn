import type { GameOutcome, Lang, RoomStatus } from './types'

const sv = {
  brand: 'Scourgeborn',
  tagline: 'Håll matrisen vid liv. Någon bär smittan.',
  heroSupport:
    'Overcooked-motorik möter Secret Hitler-förräderi. Synka ritualer på mobilen — överlev fem cykler eller fall i tomma.',
  stamp: 'RITUALMATRIS · AFFLICTION · NÖDRÖSTNING',
  create: 'Skapa ritual',
  join: 'Gå med',
  yourName: 'Ditt namn',
  roomCode: 'Kod',
  startGame: 'Starta ritualen',
  startSolo: 'Solo — överlev',
  backToLobby: 'Tillbaka till lobby',
  leave: 'Lämna',
  lobby: 'Lobby',
  waitingHost: 'Väntar på värd…',
  shareHint: 'Dela koden — varje spelare behöver sin mobil.',
  showQr: 'QR',
  hideQr: 'Stäng',
  joinOnPhone: 'Gå med på scourgeborn.com',
  tvMode: 'TV-läge',
  tvExit: 'Lämna TV',
  language: 'Språk',
  connected: 'Ansluten',
  connecting: 'Ansluter…',
  disconnected: 'Frånkopplad',
  error: 'Något gick fel',
  howTo: 'Så funkar det',
  howToSteps: [
    'Synka tidskritiska ritualuppgifter på mobilen',
    'Solo: överlev så länge som möjligt',
    'Multi: efter ~2 min väljer smittan Scourgeborn',
    'Scourgeborn saboterar i hemlighet',
    'Nödröstning — försegl misstänkt eller hoppa över',
    '5 cykler = seger · 0 matrishälsa = Scourgeborn vinner',
  ],
  matrixHealth: 'Matris',
  cycle: 'Cykel',
  scourgeMeter: 'Smitta',
  afflictionTitle: 'Scourgen väljer dig',
  afflictionBody: 'Du är Scourgeborn. Sabotera ritualen utan att avslöjas.',
  afflictionAck: 'Jag förstår',
  toolCrystal: 'Void-kristall',
  toolGlyphs: 'Arkaniska glyfer',
  toolEssence: 'Essensventil',
  toolMiasma: 'Miasmamoln',
  toolSabotage: 'Sabotagepuls',
  callCleansing: 'Nödröstning',
  cleansingHint: 'Vem är smittans kärl?',
  voteSkip: 'Hoppa över',
  taskCrystal: 'Justera kristallen till 75%',
  taskGlyphs: 'Sekvensera glyferna',
  taskEssence: 'Håll essensen 40–60%',
  phaseRitual: 'Ritual',
  phaseAffliction: 'Affliction',
  phaseCleansing: 'Nödröstning',
  phaseCycle: 'Cykelpaus',
  phaseFinished: 'Slut',
  outcomeKeepers: 'Matrisen håller!',
  outcomeScourge: 'Tomma slukar er',
  soloTime: 'Överlevnadstid',
  endParty: 'Avsluta',
  minMulti: 'Minst 2 spelare för multi',
  miasma: 'MIASMA — delad skärm dold',
  lastEvent: 'Händelse',
}

const en: typeof sv = {
  brand: 'Scourgeborn',
  tagline: 'Keep the matrix alive. Someone carries the plague.',
  heroSupport:
    'Overcooked chaos meets Secret Hitler betrayal. Sync rituals on your phone — survive five cycles or fall to the void.',
  stamp: 'RITUAL MATRIX · AFFLICTION · EMERGENCY RITE',
  create: 'Create ritual',
  join: 'Join',
  yourName: 'Your name',
  roomCode: 'Code',
  startGame: 'Start ritual',
  startSolo: 'Solo — survive',
  backToLobby: 'Back to lobby',
  leave: 'Leave',
  lobby: 'Lobby',
  waitingHost: 'Waiting for host…',
  shareHint: 'Share the code — each player needs their phone.',
  showQr: 'QR',
  hideQr: 'Close',
  joinOnPhone: 'Join at scourgeborn.com',
  tvMode: 'TV mode',
  tvExit: 'Exit TV',
  language: 'Language',
  connected: 'Connected',
  connecting: 'Connecting…',
  disconnected: 'Disconnected',
  error: 'Something went wrong',
  howTo: 'How it works',
  howToSteps: [
    'Sync time-critical ritual tasks on your phone',
    'Solo: survive as long as you can',
    'Multi: after ~2 min the plague picks Scourgeborn',
    'Scourgeborn sabotage in secret',
    'Emergency rite — seal a suspect or skip',
    '5 cycles = victory · 0 matrix health = Scourgeborn win',
  ],
  matrixHealth: 'Matrix',
  cycle: 'Cycle',
  scourgeMeter: 'Plague',
  afflictionTitle: 'The Scourge chooses you',
  afflictionBody: 'You are Scourgeborn. Sabotage the ritual without being obvious.',
  afflictionAck: 'I understand',
  toolCrystal: 'Void crystal',
  toolGlyphs: 'Arcane glyphs',
  toolEssence: 'Essence valve',
  toolMiasma: 'Miasma cloud',
  toolSabotage: 'Sabotage pulse',
  callCleansing: 'Emergency rite',
  cleansingHint: 'Who is the vessel?',
  voteSkip: 'Skip',
  taskCrystal: 'Align crystal to 75%',
  taskGlyphs: 'Sequence the glyphs',
  taskEssence: 'Hold essence 40–60%',
  phaseRitual: 'Ritual',
  phaseAffliction: 'Affliction',
  phaseCleansing: 'Cleansing vote',
  phaseCycle: 'Cycle break',
  phaseFinished: 'End',
  outcomeKeepers: 'The matrix holds!',
  outcomeScourge: 'The void claims you',
  soloTime: 'Survival time',
  endParty: 'End session',
  minMulti: 'At least 2 players for multi',
  miasma: 'MIASMA — shared screen obscured',
  lastEvent: 'Event',
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

export function phaseLabel(status: RoomStatus, lang: Lang) {
  const ui = t(lang)
  switch (status) {
    case 'ritual':
      return ui.phaseRitual
    case 'affliction':
      return ui.phaseAffliction
    case 'cleansing':
      return ui.phaseCleansing
    case 'cycle_end':
      return ui.phaseCycle
    case 'finished':
      return ui.phaseFinished
    default:
      return ui.lobby
  }
}

export function outcomeLabel(outcome: GameOutcome, lang: Lang) {
  const ui = t(lang)
  if (outcome === 'keepers_win') return ui.outcomeKeepers
  if (outcome === 'scourgeborn_win') return ui.outcomeScourge
  return ''
}

export function taskTitle(task: { kind: string; titleSv: string; titleEn: string }, lang: Lang) {
  return lang === 'en' ? task.titleEn : task.titleSv
}

export function formatMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
