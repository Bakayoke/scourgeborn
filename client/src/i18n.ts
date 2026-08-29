import type { GameOutcome, Lang, RoomStatus, ToolId } from './types'

const sv = {
  brand: 'Scourgeborn',
  tagline: 'Håll ritualen vid liv — innan tiden tar slut.',
  heroSupport: 'Ett stressigt co-op på mobilen. Klara uppgifter tillsammans. I multi kan någon bli förrädare efter ett tag.',
  stamp: 'CO-OP · TIDSPRESS · FÖRRÄDERI',
  create: 'Skapa spel',
  join: 'Gå med',
  yourName: 'Ditt namn',
  roomCode: 'Kod',
  startGame: 'Starta (2+ spelare)',
  startSolo: 'Spela solo',
  backToLobby: 'Nytt spel',
  leave: 'Lämna',
  lobby: 'Lobby',
  waitingHost: 'Väntar på att värden startar…',
  shareHint: 'Dela koden så fler kan gå med på sina mobiler.',
  showQr: 'Visa QR',
  hideQr: 'Stäng QR',
  joinOnPhone: 'Gå med på scourgeborn.com',
  tvMode: 'TV-läge',
  tvExit: 'Stäng TV',
  connected: 'Ansluten',
  connecting: 'Ansluter…',
  error: 'Något gick fel',
  howTo: 'Så funkar det — kort',
  howToSteps: [
    'Varje runda får ni uppgifter med nedräkning.',
    'Gör klart uppgifterna innan timern når noll — annars tappar matrisen hälsa.',
    'Solo: du sköter alla tre verktyg själv.',
    'Multi: varje person får ETT verktyg — prata med varandra!',
    'Efter ~2 min kan smittan välja hemliga förrädare (Scourgeborn).',
    'Vinn genom att klara 5 rundor. Förlora om matrisen når 0%.',
  ],
  matrixHealth: 'Matrishälsa',
  cycle: 'Runda',
  scourgeMeter: 'Misstanke',
  afflictionTitle: 'Du är Scourgeborn',
  afflictionBody:
    'Du är smittad. Ditt jobb: sabotera i hemlighet (Miasmamoln / Sabotage) utan att bli utpekad. Låtsas hjälpa som alla andra.',
  afflictionAck: 'Jag förstår — börja sabotera',
  toolCrystal: 'Kristallreglage',
  toolGlyphs: 'Glyfknappsar',
  toolEssence: 'Essensreglage',
  toolMiasma: 'Miasmamoln (sabota)',
  toolSabotage: 'Sabotagepuls (sabota)',
  callCleansing: 'Rösta ut misstänkt',
  cleansingHint: 'Vem tror du bär smittan?',
  voteSkip: 'Ingen / hoppa över',
  phaseRitual: 'Uppgiftsrunda',
  phaseAffliction: 'Smittan slår till',
  phaseCleansing: 'Utrustning',
  phaseCycle: 'Paus mellan rundor',
  phaseFinished: 'Spelet slut',
  outcomeKeepers: 'Ni klarade det!',
  outcomeScourge: 'Matrisen dog',
  soloTime: 'Du overlevde',
  endParty: 'Avsluta',
  minMulti: 'Minst 2 spelare för multi',
  miasma: 'MIASMA — någon saboterar just nu',
  lastEvent: 'Senast',
  goalTitle: 'Ditt mål',
  goalSolo: 'Håll matrisen över 0%. Klara alla tre uppgifter innan timern tar slut. Ju längre du överlever, desto bättre.',
  goalMulti: 'Håll matrisen över 0% tills ni klarat 5 rundor. Prata med laget — ni har olika verktyg.',
  coachLobbySolo: 'Du är ensam. När du startar får du tre reglage/knappar — använd dem innan timern tar slut.',
  coachLobbyMulti: 'Bjud in minst en till. Varje spelare får ett verktyg på mobilen och måste samarbeta.',
  coachRitualSolo: 'Gör ALLA tre uppgifterna nedan innan timern når 0.',
  coachCrystal: 'Dra reglaget tills kristallen visar 75%. (Grönt = bra!)',
  coachGlyphs: 'Tryck knapparna i ordning — från vänster till höger i listan.',
  coachEssence: 'Dra reglaget så essensen hamnar mellan 40% och 60%.',
  coachWaiting: 'Din uppgift är klar eller väntar — hjälp laget prata ihop sig.',
  coachCycle: 'Rundan är klar! Strax kommer nya uppgifter.',
  coachTimer: 'Tid kvar på denna runda',
  coachFail: 'Missar ni uppgifter tappar matrisen ~18 HP.',
  coachCleansing: 'Tryck på den du misstänker — eller hoppa över om ni är osäkra.',
  crystalOk: 'Perfekt!',
  crystalClose: 'Nästan — justera till 75%',
  crystalFar: 'Fel — dra reglaget mot 75%',
  essenceOk: 'Stabil!',
  essenceFar: 'Håll mellan 40% och 60%',
  glyphNext: 'Tryck härnäst',
  glyphDone: 'Glyfsekvensen klar!',
  yourJob: 'Ditt jobb just nu',
  teamTasks: 'Lagets uppgifter',
  statusLive: 'Pågår',
  statusDone: 'Klar',
  statusFail: 'Misslyckades',
  players: 'Spelare',
}

const en: typeof sv = {
  brand: 'Scourgeborn',
  tagline: 'Keep the ritual alive — before time runs out.',
  heroSupport: 'Stressful co-op on your phone. Clear tasks together. In multi, a traitor may appear after ~2 min.',
  stamp: 'CO-OP · TIME PRESSURE · BETRAYAL',
  create: 'Create game',
  join: 'Join',
  yourName: 'Your name',
  roomCode: 'Code',
  startGame: 'Start (2+ players)',
  startSolo: 'Play solo',
  backToLobby: 'New game',
  leave: 'Leave',
  lobby: 'Lobby',
  waitingHost: 'Waiting for host to start…',
  shareHint: 'Share the code so others can join on their phones.',
  showQr: 'Show QR',
  hideQr: 'Hide QR',
  joinOnPhone: 'Join at scourgeborn.com',
  tvMode: 'TV mode',
  tvExit: 'Exit TV',
  connected: 'Connected',
  connecting: 'Connecting…',
  error: 'Something went wrong',
  howTo: 'How it works — quick',
  howToSteps: [
    'Each round gives you tasks with a countdown.',
    'Finish tasks before the timer hits zero — or the matrix loses health.',
    'Solo: you handle all three tools yourself.',
    'Multi: each person gets ONE tool — talk to each other!',
    'After ~2 min the plague may pick secret traitors (Scourgeborn).',
    'Win by completing 5 rounds. Lose if the matrix hits 0%.',
  ],
  matrixHealth: 'Matrix health',
  cycle: 'Round',
  scourgeMeter: 'Suspicion',
  afflictionTitle: 'You are Scourgeborn',
  afflictionBody:
    'You are infected. Sabotage in secret (Miasma / Sabotage pulse) without getting caught. Pretend to help.',
  afflictionAck: 'Got it — start sabotaging',
  toolCrystal: 'Crystal slider',
  toolGlyphs: 'Glyph buttons',
  toolEssence: 'Essence slider',
  toolMiasma: 'Miasma cloud (sabotage)',
  toolSabotage: 'Sabotage pulse (sabotage)',
  callCleansing: 'Vote out suspect',
  cleansingHint: 'Who do you think carries the plague?',
  voteSkip: 'Nobody / skip',
  phaseRitual: 'Task round',
  phaseAffliction: 'Plague strikes',
  phaseCleansing: 'Accusation vote',
  phaseCycle: 'Break between rounds',
  phaseFinished: 'Game over',
  outcomeKeepers: 'You made it!',
  outcomeScourge: 'The matrix collapsed',
  soloTime: 'You survived',
  endParty: 'End session',
  minMulti: 'At least 2 players for multi',
  miasma: 'MIASMA — someone is sabotaging',
  lastEvent: 'Latest',
  goalTitle: 'Your goal',
  goalSolo: 'Keep matrix above 0%. Finish all three tasks before the timer ends.',
  goalMulti: 'Keep matrix above 0% through 5 rounds. Talk to your team — you have different tools.',
  coachLobbySolo: 'You are alone. When you start you get three sliders/buttons — use them before time runs out.',
  coachLobbyMulti: 'Invite at least one more player. Each person gets one tool on their phone.',
  coachRitualSolo: 'Complete ALL three tasks below before the timer hits 0.',
  coachCrystal: 'Drag the slider until the crystal shows 75%. (Green = good!)',
  coachGlyphs: 'Tap the buttons in order — left to right in the list.',
  coachEssence: 'Drag the slider so essence stays between 40% and 60%.',
  coachWaiting: 'Your task is done or waiting — help the team communicate.',
  coachCycle: 'Round complete! New tasks incoming.',
  coachTimer: 'Time left this round',
  coachFail: 'Missing tasks costs ~18 matrix HP.',
  coachCleansing: 'Tap who you suspect — or skip if unsure.',
  crystalOk: 'Perfect!',
  crystalClose: 'Almost — adjust to 75%',
  crystalFar: 'Wrong — move slider toward 75%',
  essenceOk: 'Stable!',
  essenceFar: 'Keep between 40% and 60%',
  glyphNext: 'Tap next',
  glyphDone: 'Glyph sequence complete!',
  yourJob: 'Your job right now',
  teamTasks: 'Team tasks',
  statusLive: 'Active',
  statusDone: 'Done',
  statusFail: 'Failed',
  players: 'Players',
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

export function coachForPhase(
  room: {
    status: RoomStatus
    mode: 'solo' | 'multi'
    yourTools: ToolId[]
    tasks: { kind: string; completed: boolean; failed: boolean; assignedPlayerIds: string[] }[]
  },
  viewerId: string | undefined,
  lang: Lang,
): string {
  const ui = t(lang)
  if (room.status === 'lobby') {
    return room.mode === 'solo' ? ui.coachLobbySolo : ui.coachLobbyMulti
  }
  if (room.status === 'cycle_end') return ui.coachCycle
  if (room.status === 'cleansing') return ui.coachCleansing
  if (room.status !== 'ritual') return ui.coachFail

  if (room.mode === 'solo') return ui.coachRitualSolo

  if (room.yourTools.includes('crystal_slider')) {
    const t = room.tasks.find((x) => x.kind === 'crystal' && !x.completed && !x.failed)
    if (t) return ui.coachCrystal
  }
  if (room.yourTools.includes('glyph_board')) {
    const t = room.tasks.find((x) => x.kind === 'glyphs' && !x.completed && !x.failed)
    if (t) return ui.coachGlyphs
  }
  if (room.yourTools.includes('essence_valve')) {
    const t = room.tasks.find((x) => x.kind === 'essence' && !x.completed && !x.failed)
    if (t) return ui.coachEssence
  }
  const mine = room.tasks.some(
    (x) => viewerId && x.assignedPlayerIds.includes(viewerId) && !x.completed && !x.failed,
  )
  return mine ? ui.coachWaiting : ui.coachWaiting
}

const GLYPH_LABELS: Record<string, { sv: string; en: string }> = {
  void: { sv: 'Tomhet', en: 'Void' },
  arc: { sv: 'Båge', en: 'Arc' },
  blood: { sv: 'Blod', en: 'Blood' },
  star: { sv: 'Stjärna', en: 'Star' },
  ash: { sv: 'Ask', en: 'Ash' },
}

export function glyphLabel(symbol: string, lang: Lang) {
  return lang === 'en' ? GLYPH_LABELS[symbol]?.en ?? symbol : GLYPH_LABELS[symbol]?.sv ?? symbol
}
