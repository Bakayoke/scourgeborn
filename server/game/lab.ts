import type {
  Difficulty,
  ItemId,
  LabEventKind,
  Lang,
  LabLogKind,
  LabPlayerState,
  Patient,
  PatientKind,
  PingKind,
  PlayerAlert,
  Room,
  Station,
} from '../types.js'

export const MAX_MISSES = 3
export const TICK_MS = 1_000
export const MIN_MULTI_PLAYERS = 2
export const FULL_STATION_LAB_PLAYERS = 3
export const WIN_SCORE = 15
export const RACE_TARGET = 10
export const SERIES_TARGET = 2
export const WAVE4_SURVIVE_MS = 45_000
const MAX_LOG = 25
const PIPELINE_WINDOW_MS = 15_000

const STATIONS: Station[] = ['extractor', 'synthesizer', 'incubator']

const ORDER_TIME: Record<ItemId, number> = {
  red_rna: 24,
  blue_rna: 24,
  green_rna: 22,
  yellow_rna: 22,
  purple_rna: 30,
  heated_purple_rna: 36,
  cooled_blue_rna: 32,
}

const WAVE_THRESHOLDS = [0, 18_000, 50_000, 85_000] as const

const WAVE_LABELS: Record<number, { sv: string; en: string }> = {
  1: { sv: 'VÅG 1 — REDO?', en: 'WAVE 1 — READY?' },
  2: { sv: 'VÅG 2 — SNABBARE!', en: 'WAVE 2 — FASTER!' },
  3: { sv: 'VÅG 3 — PANIK!', en: 'WAVE 3 — PANIC!' },
  4: { sv: 'VÅG 4 — RUSKIGT!', en: 'WAVE 4 — BRUTAL!' },
}

const EVENT_LABELS: Record<LabEventKind, { sv: string; en: string }> = {
  blackout: { sv: 'STRÖMAVBROTT — en station offline!', en: 'BLACKOUT — one station offline!' },
  contamination: { sv: 'KONTAMINERING — släng proven!', en: 'CONTAMINATION — drop your samples!' },
  overtime: { sv: 'ÖVERTID — alla timers fryser!', en: 'OVERTIME — all timers frozen!' },
}

export const EXTRACT_ITEMS = ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna'] as const
export type ExtractItemId = (typeof EXTRACT_ITEMS)[number]

export function difficultyConfig(difficulty: Difficulty = 'normal') {
  switch (difficulty) {
    case 'training':
      return { maxMisses: 5, spawnScale: 1.35, timeScale: 1.15, winScore: 12 }
    case 'panic':
      return { maxMisses: 2, spawnScale: 0.72, timeScale: 0.82, winScore: 15 }
    default:
      return { maxMisses: 3, spawnScale: 1, timeScale: 1, winScore: 15 }
  }
}

export function maxMissesForRoom(room: Room): number {
  return difficultyConfig(room.difficulty).maxMisses
}

export function winScoreForRoom(room: Room): number {
  return difficultyConfig(room.difficulty).winScore
}

export function itemLabel(id: ItemId, lang: Lang): string {
  const sv: Record<ItemId, string> = {
    red_rna: 'Röd RNA',
    blue_rna: 'Blå RNA',
    green_rna: 'Grön RNA',
    yellow_rna: 'Gul RNA',
    purple_rna: 'Lila RNA',
    heated_purple_rna: 'Uppvärmd lila RNA',
    cooled_blue_rna: 'Kyld blå RNA',
  }
  const en: Record<ItemId, string> = {
    red_rna: 'Red RNA',
    blue_rna: 'Blue RNA',
    green_rna: 'Green RNA',
    yellow_rna: 'Yellow RNA',
    purple_rna: 'Purple RNA',
    heated_purple_rna: 'Heated Purple RNA',
    cooled_blue_rna: 'Cooled Blue RNA',
  }
  return lang === 'en' ? en[id] : sv[id]
}

export function itemShort(id: ItemId, lang: Lang): string {
  const sv: Record<ItemId, string> = {
    red_rna: 'RÖD',
    blue_rna: 'BLÅ',
    green_rna: 'GRÖN',
    yellow_rna: 'GUL',
    purple_rna: 'LILA',
    heated_purple_rna: 'VARM LILA',
    cooled_blue_rna: 'KYLD BLÅ',
  }
  const en: Record<ItemId, string> = {
    red_rna: 'RED',
    blue_rna: 'BLUE',
    green_rna: 'GREEN',
    yellow_rna: 'YELLOW',
    purple_rna: 'PURPLE',
    heated_purple_rna: 'HOT PURPLE',
    cooled_blue_rna: 'COLD BLUE',
  }
  return lang === 'en' ? en[id] : sv[id]
}

export function stationLabel(station: Station, lang: Lang): string {
  const sv = { extractor: 'Extraktor', synthesizer: 'Synthesizer', incubator: 'Inkubator' }
  const en = { extractor: 'Extractor', synthesizer: 'Synthesizer', incubator: 'Incubator' }
  return lang === 'en' ? en[station] : sv[station]
}

export function connectedActiveIds(room: Room): string[] {
  return room.players.filter((p) => !p.spectator && p.connected).map((p) => p.id)
}

export function assignStations(playerIds: string[], solo: boolean): Record<string, LabPlayerState> {
  const lab: Record<string, LabPlayerState> = {}
  if (solo) {
    lab[playerIds[0]!] = {
      assignedStation: 'extractor',
      activeStation: 'extractor',
      itemInHand: null,
      synthSlot: null,
    }
    return lab
  }
  playerIds.forEach((id, i) => {
    const station = STATIONS[i % STATIONS.length]!
    lab[id] = {
      assignedStation: station,
      activeStation: station,
      itemInHand: null,
      synthSlot: null,
    }
  })
  return lab
}

export function elapsedMs(room: Room): number {
  if (!room.gameStartedAt) return 0
  return Date.now() - room.gameStartedAt
}

export function currentWave(room: Room): number {
  const elapsed = elapsedMs(room)
  if (elapsed >= WAVE_THRESHOLDS[3]) return 4
  if (elapsed >= WAVE_THRESHOLDS[2]) return 3
  if (elapsed >= WAVE_THRESHOLDS[1]) return 2
  return 1
}

export function waveConfig(room: Room, wave: number) {
  const diff = difficultyConfig(room.difficulty)
  let base: {
    pool: ItemId[]
    maxPatients: number
    spawnMs: number
    timeScale: number
  }
  switch (wave) {
    case 1:
      base = {
        pool: ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna'],
        maxPatients: 2,
        spawnMs: 12_000,
        timeScale: 0.78,
      }
      break
    case 2:
      base = {
        pool: ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna', 'purple_rna'],
        maxPatients: 3,
        spawnMs: 8_000,
        timeScale: 0.65,
      }
      break
    case 3:
      base = {
        pool: ['purple_rna', 'heated_purple_rna', 'cooled_blue_rna', 'green_rna', 'yellow_rna'],
        maxPatients: 4,
        spawnMs: 6_000,
        timeScale: 0.55,
      }
      break
    default:
      base = {
        pool: [
          'red_rna',
          'blue_rna',
          'green_rna',
          'yellow_rna',
          'purple_rna',
          'heated_purple_rna',
          'cooled_blue_rna',
        ],
        maxPatients: 5,
        spawnMs: 4_000,
        timeScale: 0.42,
      }
  }
  return {
    ...base,
    spawnMs: Math.max(2500, Math.round(base.spawnMs * diff.spawnScale)),
    timeScale: base.timeScale * diff.timeScale,
  }
}

function initStats(room: Room, playerIds: string[]) {
  room.stats = {}
  for (const id of playerIds) {
    room.stats[id] = { cures: 0, sends: 0, pings: 0 }
  }
}

export function isCompactLab(room: Room): boolean {
  return room.mode === 'multi' && Object.keys(room.lab).length < FULL_STATION_LAB_PLAYERS
}

function specialForWave(wave: number): PatientKind | null {
  if (wave === 1) return 'twin'
  if (wave === 2) return 'vip'
  if (wave === 3) return 'mutant'
  if (wave >= 4) return Math.random() < 0.5 ? 'vip' : 'mutant'
  return null
}

function decoyVaccine(real: ItemId, pool: ItemId[]): ItemId {
  const others = pool.filter((v) => v !== real)
  return others[Math.floor(Math.random() * others.length)] ?? 'green_rna'
}

export function initLabGame(room: Room, playerIds: string[], partyMulti = false) {
  const solo = !partyMulti && playerIds.length === 1
  const compact = partyMulti && playerIds.length < FULL_STATION_LAB_PLAYERS
  room.mode = solo ? 'solo' : 'multi'
  room.status = 'playing'
  room.score = 0
  room.misses = 0
  room.wave = 1
  room.gameStartedAt = Date.now()
  room.alerts = {}
  initStats(room, playerIds)
  room.patients = [spawnPatient(room)]
  room.lab = assignStations(playerIds, solo)
  room.eventLog = []
  room.missLog = []
  room.wave4StartedAt = null
  room.yellSv = null
  room.yellEn = null
  room.yellAt = 0
  room.yellItemId = null
  room.cureStreak = 0
  room.bestStreak = 0
  room.activeEvent = null
  room.eventEndsAt = 0
  room.disabledStation = null
  room.timersFrozenUntil = 0
  room.nextEventAt = Date.now() + 45_000 + Math.random() * 25_000
  room.pendingSpecialKind = specialForWave(1)
  room.specialSpawnedThisWave = false
  room.pipeline = null
  room.raceFinished = null
  room.lastTickAt = Date.now()
  room.lastSpawnAt = Date.now()
  if (solo || compact) {
    room.lastEventSv = solo
      ? 'Alla stationer syns — scrolla och tryck direkt, ingen flikväxling!'
      : 'Få spelare — alla stationer på mobilen. Skicka prover om ni är flera!'
    room.lastEventEn = solo
      ? 'All stations visible — scroll and tap directly, no tab switching!'
      : 'Short-handed — all stations on your phone. Pass samples if you are several!'
  } else {
    room.lastEventSv = 'Nya patienter inkommer — skicka prover mellan stationerna!'
    room.lastEventEn = 'New patients incoming — pass samples between stations!'
  }
}

export function spawnPatient(room: Room, forceItem?: ItemId, kind: PatientKind = 'normal'): Patient {
  const wave = currentWave(room)
  const cfg = waveConfig(room, wave)
  const requiredVaccine =
    forceItem ?? cfg.pool[Math.floor(Math.random() * cfg.pool.length)]!
  const baseTime = ORDER_TIME[requiredVaccine]
  const maxTime = Math.max(10, Math.round(baseTime * cfg.timeScale))
  const patient: Patient = {
    id: crypto.randomUUID(),
    requiredVaccine,
    timeRemaining: maxTime,
    maxTime,
    kind,
  }
  if (kind === 'vip') {
    patient.pointValue = 2
    patient.timeRemaining = Math.max(8, Math.round(maxTime * 0.75))
    patient.maxTime = patient.timeRemaining
  }
  if (kind === 'mutant') {
    patient.mutantStage = 0
    patient.decoyVaccine = decoyVaccine(requiredVaccine, cfg.pool)
  }
  return patient
}

function spawnSpecialPatients(room: Room, kind: PatientKind) {
  const wave = currentWave(room)
  const cfg = waveConfig(room, wave)
  const vaccine = cfg.pool[Math.floor(Math.random() * cfg.pool.length)]!
  if (kind === 'twin') {
    const groupId = crypto.randomUUID()
    const a = spawnPatient(room, vaccine, 'twin')
    const b = spawnPatient(room, vaccine, 'twin')
    a.twinGroupId = groupId
    b.twinGroupId = groupId
    room.patients.push(a, b)
    setEvent(room, 'TVILLINGAR — samma vaccin till båda!', 'TWINS — same vaccine for both!', 'spawn')
    setYell(room, 'TVILLING-PATIENTER!', 'TWIN PATIENTS!')
    return
  }
  const p = spawnPatient(room, vaccine, kind)
  room.patients.push(p)
  if (kind === 'vip') {
    setEvent(room, 'VIP-PATIENT — dubbel poäng!', 'VIP PATIENT — double points!', 'spawn')
    setYell(room, 'VIP — DUBBEL POÄNG!', 'VIP — DOUBLE POINTS!')
  } else {
    setEvent(
      room,
      'MUTANT — ge fel färg först, sedan rätt!',
      'MUTANT — deliver decoy first, then the real one!',
      'spawn',
    )
    setYell(room, 'MUTANT-PATIENT!', 'MUTANT PATIENT!')
  }
}

function effectiveStation(room: Room, playerId: string): Station {
  const state = room.lab[playerId]
  if (!state) return 'extractor'
  return room.mode === 'solo' ? state.activeStation : state.assignedStation
}

function atStation(room: Room, playerId: string, station: Station): boolean {
  if (room.mode === 'solo' || isCompactLab(room)) return true
  return effectiveStation(room, playerId) === station
}

function stationDisabled(room: Room, station: Station): boolean {
  return room.activeEvent === 'blackout' && room.disabledStation === station
}

function pushLog(room: Room, kind: LabLogKind, sv: string, en: string) {
  if (!room.eventLog) room.eventLog = []
  room.eventLog.push({ at: Date.now(), kind, sv, en })
  if (room.eventLog.length > MAX_LOG) {
    room.eventLog = room.eventLog.slice(-MAX_LOG)
  }
}

function setEvent(room: Room, sv: string, en: string, kind: LabLogKind = 'system') {
  room.lastEventSv = sv
  room.lastEventEn = en
  pushLog(room, kind, sv, en)
}

function setYell(room: Room, sv: string, en: string, itemId: ItemId | null = null) {
  room.yellSv = sv
  room.yellEn = en
  room.yellAt = Date.now()
  room.yellItemId = itemId
}

function describeMiss(room: Room, patient: Patient): { sv: string; en: string } {
  const needSv = itemShort(patient.requiredVaccine, 'sv')
  const needEn = itemShort(patient.requiredVaccine, 'en')
  const handsSv: string[] = []
  const handsEn: string[] = []
  for (const [id, state] of Object.entries(room.lab)) {
    if (!state.itemInHand) continue
    const name = playerName(room, id)
    handsSv.push(`${name}: ${itemShort(state.itemInHand, 'sv')}`)
    handsEn.push(`${name}: ${itemShort(state.itemInHand, 'en')}`)
  }
  if (handsSv.length === 0) {
    return {
      sv: `Behövde ${needSv} — ingen hade rätt prov i handen`,
      en: `Needed ${needEn} — nobody held the right sample`,
    }
  }
  return {
    sv: `Behövde ${needSv} — laget hade: ${handsSv.join(', ')}`,
    en: `Needed ${needEn} — team held: ${handsEn.join(', ')}`,
  }
}

function checkVictory(room: Room) {
  if (room.status !== 'playing') return
  const now = Date.now()
  const target = winScoreForRoom(room)
  if (room.score >= target) {
    room.status = 'victory'
    finalizeSeriesRound(room, true)
    const sv = `Mål nått — ${target} botade! Labbet räddat!`
    const en = `Goal reached — ${target} cured! Lab saved!`
    setEvent(room, sv, en, 'victory')
    setYell(room, sv, en)
    return
  }
  if (room.wave4StartedAt && now - room.wave4StartedAt >= WAVE4_SURVIVE_MS) {
    room.status = 'victory'
    finalizeSeriesRound(room, true)
    const sv = 'Överlevde våg 4 — labbet räddat!'
    const en = 'Survived wave 4 — lab saved!'
    setEvent(room, sv, en, 'victory')
    setYell(room, sv, en)
  }
}

export function finalizeSeriesRound(room: Room, won: boolean) {
  if (!room.seriesEnabled) return
  if (won) room.seriesWins += 1
  room.seriesRound += 1
  if (room.seriesWins >= SERIES_TARGET || room.seriesRound > 3) {
    room.seriesComplete = true
  }
}

function setAlert(room: Room, playerId: string, alert: PlayerAlert) {
  if (!room.alerts) room.alerts = {}
  room.alerts[playerId] = alert
}

function bumpStat(room: Room, playerId: string, field: 'cures' | 'sends' | 'pings') {
  if (!room.stats[playerId]) room.stats[playerId] = { cures: 0, sends: 0, pings: 0 }
  room.stats[playerId][field] += 1
}

function playerName(room: Room, playerId: string) {
  return room.players.find((p) => p.id === playerId)?.name ?? '?'
}

function touchPipeline(room: Room, playerId: string, step: 'extract' | 'mix' | 'process' | 'send') {
  const now = Date.now()
  if (!room.pipeline || now - room.pipeline.startedAt > PIPELINE_WINDOW_MS) {
    room.pipeline = {
      startedAt: now,
      players: [playerId],
      extract: false,
      mix: false,
      process: false,
    }
  }
  if (!room.pipeline.players.includes(playerId)) room.pipeline.players.push(playerId)
  if (step === 'extract') room.pipeline.extract = true
  if (step === 'mix') room.pipeline.mix = true
  if (step === 'process') room.pipeline.process = true
}

function pipelineBonus(room: Room): number {
  const p = room.pipeline
  if (!p) return 0
  if (Date.now() - p.startedAt > PIPELINE_WINDOW_MS) return 0
  if (p.extract && p.mix && p.process && p.players.length >= 3) {
    room.pipeline = null
    return 1
  }
  return 0
}

function bumpStreak(room: Room) {
  room.cureStreak += 1
  if (room.cureStreak > room.bestStreak) room.bestStreak = room.cureStreak
  if (room.cureStreak >= 3) {
    const sv = `×${room.cureStreak} STREAK!`
    const en = `×${room.cureStreak} STREAK!`
    setEvent(room, sv, en, 'streak')
    setYell(room, sv, en)
    if (room.cureStreak % 3 === 0) room.lastSpawnAt += 1500
  }
}

function resetStreak(room: Room) {
  room.cureStreak = 0
}

function stationForPing(kind: PingKind): Station | null {
  switch (kind) {
    case 'need_red':
    case 'need_blue':
      return 'extractor'
    case 'need_mix':
      return 'synthesizer'
    case 'need_heat':
    case 'need_cool':
      return 'incubator'
    default:
      return null
  }
}

export function pingStation(
  room: Room,
  fromId: string,
  kind: PingKind,
  customMessage?: string,
): { error?: string } {
  if (room.status !== 'playing') return { error: 'Spelet körs inte' }
  if (room.mode !== 'multi') return { error: 'Bara multi' }

  const fromName = playerName(room, fromId)
  const pingMessages: Record<PingKind, { sv: string; en: string }> = {
    need_red: { sv: `${fromName} behöver RÖD!`, en: `${fromName} needs RED!` },
    need_blue: { sv: `${fromName} behöver BLÅ!`, en: `${fromName} needs BLUE!` },
    need_mix: { sv: `${fromName} behöver MIX!`, en: `${fromName} needs MIX!` },
    need_heat: { sv: `${fromName} behöver VÄRME!`, en: `${fromName} needs HEAT!` },
    need_cool: { sv: `${fromName} behöver KYLA!`, en: `${fromName} needs COOL!` },
    need_deliver: { sv: `${fromName}: LEVERERA NU!`, en: `${fromName}: DELIVER NOW!` },
  }

  const targetStation = stationForPing(kind)
  let msgPair = pingMessages[kind]
  const safe = customMessage?.trim().slice(0, 40)
  if (safe) {
    msgPair = { sv: `${fromName}: ${safe}`, en: `${fromName}: ${safe}` }
  }
  let sent = 0

  for (const p of room.players) {
    if (p.spectator || !p.connected || p.id === fromId) continue
    const ls = room.lab[p.id]
    if (!ls) continue
    if (targetStation && ls.assignedStation !== targetStation) continue
    setAlert(room, p.id, {
      kind: 'ping',
      fromName,
      messageSv: msgPair.sv,
      messageEn: msgPair.en,
      at: Date.now(),
    })
    sent++
  }

  if (kind === 'need_deliver') {
    for (const p of room.players) {
      if (p.spectator || !p.connected || p.id === fromId) continue
      const ls = room.lab[p.id]
      if (!ls?.itemInHand) continue
      const matches = room.patients.some((pat) => pat.requiredVaccine === ls.itemInHand)
      if (matches) {
        setAlert(room, p.id, {
          kind: 'ping',
          fromName,
          messageSv: msgPair.sv,
          messageEn: msgPair.en,
          itemId: ls.itemInHand,
          at: Date.now(),
        })
        sent++
      }
    }
  }

  if (sent === 0 && targetStation) {
    return { error: 'Ingen på rätt station är online' }
  }

  bumpStat(room, fromId, 'pings')
  setEvent(room, msgPair.sv, msgPair.en, 'ping')
  setYell(room, msgPair.sv, msgPair.en)
  return {}
}

export function extract(
  room: Room,
  playerId: string,
  element: ExtractItemId,
): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (!atStation(room, playerId, 'extractor')) {
    return { error: 'Du står inte vid extraktorn' }
  }
  if (stationDisabled(room, 'extractor')) {
    return { error: 'Extraktorn är offline — strömavbrott!' }
  }
  if (state.itemInHand) return { error: 'Händerna är fulla — skicka eller leverera först' }
  state.itemInHand = element
  if (element === 'red_rna' || element === 'blue_rna') {
    touchPipeline(room, playerId, 'extract')
  }
  setEvent(
    room,
    `${itemShort(element, 'sv')} extraherad!`,
    `${itemShort(element, 'en')} extracted!`,
  )
  return {}
}

export function synthesize(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (!atStation(room, playerId, 'synthesizer')) {
    return { error: 'Du står inte vid synthesizern' }
  }
  if (stationDisabled(room, 'synthesizer')) {
    return { error: 'Synthesizern är offline — strömavbrott!' }
  }
  if (!state.itemInHand) return { error: 'Du har inget i handen' }

  const item = state.itemInHand
  if (item !== 'red_rna' && item !== 'blue_rna') {
    return { error: 'Synthesizern tar bara röd eller blå RNA' }
  }

  if (!state.synthSlot) {
    state.synthSlot = item
    state.itemInHand = null
    setEvent(room, 'Första provet i synthesizern — skicka det andra!', 'First sample loaded — send the other!')
    return {}
  }

  const hasRed =
    (state.synthSlot === 'red_rna' && item === 'blue_rna') ||
    (state.synthSlot === 'blue_rna' && item === 'red_rna')
  if (!hasRed) {
    return { error: 'Behöver en röd OCH en blå RNA' }
  }

  state.itemInHand = 'purple_rna'
  state.synthSlot = null
  touchPipeline(room, playerId, 'mix')
  setEvent(room, 'LILA RNA syntetiserad!', 'PURPLE RNA synthesized!')
  return {}
}

export function incubate(
  room: Room,
  playerId: string,
  mode: 'heat' | 'cool',
): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (!atStation(room, playerId, 'incubator')) {
    return { error: 'Du står inte vid inkubatorn' }
  }
  if (stationDisabled(room, 'incubator')) {
    return { error: 'Inkubatorn är offline — strömavbrott!' }
  }
  if (!state.itemInHand) return { error: 'Du har inget i handen' }

  if (mode === 'heat') {
    if (state.itemInHand !== 'purple_rna') return { error: 'Värme kräver lila RNA' }
    state.itemInHand = 'heated_purple_rna'
    touchPipeline(room, playerId, 'process')
    setEvent(room, 'Provet uppvärmt!', 'Sample heated!')
    return {}
  }

  if (state.itemInHand !== 'blue_rna') return { error: 'Kyla kräver blå RNA' }
  state.itemInHand = 'cooled_blue_rna'
  touchPipeline(room, playerId, 'process')
  setEvent(room, 'Provet kyld!', 'Sample cooled!')
  return {}
}

export function sendItem(
  room: Room,
  fromId: string,
  toId: string,
): { error?: string } {
  if (room.status !== 'playing') return { error: 'Spelet körs inte' }
  if (fromId === toId) return { error: 'Välj en annan spelare' }
  const from = room.lab[fromId]
  const to = room.lab[toId]
  if (!from || !to) return { error: 'Spelare saknas' }
  if (!from.itemInHand) return { error: 'Du har inget att skicka' }
  if (to.itemInHand) return { error: 'Mottagaren har redan något i handen' }

  const item = from.itemInHand
  to.itemInHand = item
  from.itemInHand = null
  bumpStat(room, fromId, 'sends')
  touchPipeline(room, fromId, 'send')

  const fromName = playerName(room, fromId)
  const shortSv = itemShort(item, 'sv')
  const shortEn = itemShort(item, 'en')
  setAlert(room, toId, {
    kind: 'incoming',
    fromName,
    messageSv: `${fromName} skickar ${shortSv}!`,
    messageEn: `${fromName} sends ${shortEn}!`,
    itemId: item,
    at: Date.now(),
  })
  const sendSv = `${fromName} skickar ${shortSv}!`
  const sendEn = `${fromName} sends ${shortEn}!`
  setEvent(room, sendSv, sendEn, 'send')
  setYell(room, sendSv, sendEn, item)
  return {}
}

function findDeliverPatient(room: Room, item: ItemId): Patient | undefined {
  for (const p of room.patients) {
    if (p.kind === 'mutant' && p.mutantStage === 0 && p.decoyVaccine === item) return p
    if (p.requiredVaccine === item && (p.kind !== 'mutant' || p.mutantStage === 1)) return p
  }
  return undefined
}

export function deliverVaccine(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (!state.itemInHand) return { error: 'Du har inget att leverera' }

  const item = state.itemInHand
  const patient = findDeliverPatient(room, item)
  if (!patient) {
    return { error: 'Ingen patient behöver detta prov just nu' }
  }

  if (patient.kind === 'mutant' && patient.mutantStage === 0 && patient.decoyVaccine === item) {
    patient.mutantStage = 1
    state.itemInHand = null
    const name = playerName(room, playerId)
    setEvent(
      room,
      `${name} stabiliserade mutanten — nu rätt vaccin!`,
      `${name} stabilized the mutant — now the real vaccine!`,
      'cure',
    )
    setYell(
      room,
      'Mutant stabiliserad — leverera rätt nu!',
      'Mutant stabilized — deliver the real one now!',
      patient.requiredVaccine,
    )
    return {}
  }

  room.patients = room.patients.filter((p) => p.id !== patient.id)
  state.itemInHand = null
  const points = patient.pointValue ?? 1
  room.score += points
  bumpStat(room, playerId, 'cures')
  bumpStreak(room)

  const bonus = pipelineBonus(room)
  if (bonus > 0) {
    room.score += bonus
    setEvent(room, 'FULL PIPELINE — bonuspoäng!', 'FULL PIPELINE — bonus point!', 'pipeline')
    setYell(room, 'FULL PIPELINE!!!', 'FULL PIPELINE!!!')
  }

  const name = playerName(room, playerId)
  const ptsLabel = points > 1 ? `(+${points})` : '(+1)'
  setEvent(
    room,
    `${name} botade en patient! ${ptsLabel}`,
    `${name} cured a patient! ${ptsLabel}`,
    'cure',
  )
  checkVictory(room)
  return {}
}

export function dropItem(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state?.itemInHand) return { error: 'Inget att släppa' }
  const item = state.itemInHand
  state.itemInHand = null
  const name = playerName(room, playerId)
  setEvent(
    room,
    `${name} slängde ${itemShort(item, 'sv')}`,
    `${name} dropped ${itemShort(item, 'en')}`,
    'drop',
  )
  return {}
}

function clearActiveEvent(room: Room) {
  room.activeEvent = null
  room.eventEndsAt = 0
  room.disabledStation = null
  room.timersFrozenUntil = 0
}

function activateEvent(room: Room, kind: LabEventKind) {
  const labels = EVENT_LABELS[kind]
  room.activeEvent = kind
  room.eventEndsAt = Date.now() + (kind === 'overtime' ? 5000 : 8000)
  if (kind === 'blackout') {
    room.disabledStation = STATIONS[Math.floor(Math.random() * STATIONS.length)]!
  }
  if (kind === 'contamination') {
    for (const state of Object.values(room.lab)) {
      state.itemInHand = null
    }
    room.eventEndsAt = Date.now() + 3000
  }
  if (kind === 'overtime') {
    room.timersFrozenUntil = room.eventEndsAt
  }
  setEvent(room, labels.sv, labels.en, 'event')
  setYell(room, labels.sv, labels.en)
}

function maybeLabEvent(room: Room) {
  const now = Date.now()
  if (room.activeEvent) {
    if (now >= room.eventEndsAt) clearActiveEvent(room)
    return
  }
  if (now < room.nextEventAt || elapsedMs(room) < 20_000) return
  const kinds: LabEventKind[] = ['blackout', 'contamination', 'overtime']
  activateEvent(room, kinds[Math.floor(Math.random() * kinds.length)]!)
  room.nextEventAt = now + 50_000 + Math.random() * 35_000
}

function maybeAdvanceWave(room: Room) {
  const wave = currentWave(room)
  if (wave > room.wave) {
    room.wave = wave
    room.specialSpawnedThisWave = false
    room.pendingSpecialKind = specialForWave(wave)
    const labels = WAVE_LABELS[wave]!
    setEvent(room, labels.sv, labels.en, 'wave')
    if (wave >= 4 && !room.wave4StartedAt) {
      room.wave4StartedAt = Date.now()
      setYell(
        room,
        'VÅG 4 — håll ut 45 sekunder för seger!',
        'WAVE 4 — survive 45 seconds to win!',
      )
    }
  }
}

export function tickLab(room: Room) {
  if (room.status !== 'playing') return

  const now = Date.now()
  if (now - room.lastTickAt < TICK_MS) return
  room.lastTickAt = now

  maybeAdvanceWave(room)
  maybeLabEvent(room)
  const cfg = waveConfig(room, currentWave(room))
  const timersFrozen = now < room.timersFrozenUntil

  const expired: Patient[] = []
  if (!timersFrozen) {
    for (const p of room.patients) {
      p.timeRemaining -= 1
      if (p.timeRemaining <= 0) expired.push(p)
    }
  }

  if (expired.length > 0) {
    room.patients = room.patients.filter((p) => p.timeRemaining > 0)
    if (!room.missLog) room.missLog = []
    resetStreak(room)
    for (const patient of expired) {
      const attr = describeMiss(room, patient)
      room.missLog.push({
        at: now,
        vaccine: patient.requiredVaccine,
        sv: attr.sv,
        en: attr.en,
      })
      pushLog(room, 'miss', attr.sv, attr.en)
      setYell(room, attr.sv, attr.en, patient.requiredVaccine)
    }
    room.misses += expired.length
    setEvent(
      room,
      `${expired.length} patient(er) försämrades — misslyckande!`,
      `${expired.length} patient(s) deteriorated — missed!`,
      'miss',
    )
    const cap = maxMissesForRoom(room)
    if (room.misses >= cap) {
      room.status = 'gameover'
      finalizeSeriesRound(room, false)
      setEvent(room, 'För många misslyckanden — labbet stängs.', 'Too many failures — lab shut down.', 'system')
      return
    }
  }

  checkVictory(room)
  if (room.status !== 'playing') return

  if (room.patients.length < cfg.maxPatients && now - room.lastSpawnAt >= cfg.spawnMs) {
    if (room.pendingSpecialKind && !room.specialSpawnedThisWave) {
      spawnSpecialPatients(room, room.pendingSpecialKind)
      room.specialSpawnedThisWave = true
      room.pendingSpecialKind = null
    } else {
      const newPatient = spawnPatient(room)
      const duplicate = room.patients.some((p) => p.requiredVaccine === newPatient.requiredVaccine)
      if (duplicate && currentWave(room) >= 4 && Math.random() < 0.6) {
        room.patients.push(spawnPatient(room, newPatient.requiredVaccine))
      } else {
        room.patients.push(newPatient)
      }
      setEvent(room, 'Ny patient inkommen!', 'New patient arrived!', 'spawn')
    }
    room.lastSpawnAt = now
  }
}

export function waveLabel(wave: number, lang: Lang) {
  const labels = WAVE_LABELS[wave] ?? WAVE_LABELS[4]!
  return lang === 'en' ? labels.en : labels.sv
}

export function eventLabel(kind: LabEventKind, lang: Lang) {
  const labels = EVENT_LABELS[kind]
  return lang === 'en' ? labels.en : labels.sv
}

export function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}
