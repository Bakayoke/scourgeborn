import type {
  ItemId,
  Lang,
  LabPlayerState,
  Patient,
  PingKind,
  PlayerAlert,
  Room,
  Station,
} from '../types.js'

export const MAX_MISSES = 3
export const TICK_MS = 1_000
export const MIN_MULTI_PLAYERS = 2

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

export const EXTRACT_ITEMS = ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna'] as const
export type ExtractItemId = (typeof EXTRACT_ITEMS)[number]

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

export function waveConfig(wave: number) {
  switch (wave) {
    case 1:
      return {
        pool: ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna'] as ItemId[],
        maxPatients: 2,
        spawnMs: 12_000,
        timeScale: 0.78,
      }
    case 2:
      return {
        pool: ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna', 'purple_rna'] as ItemId[],
        maxPatients: 3,
        spawnMs: 8_000,
        timeScale: 0.65,
      }
    case 3:
      return {
        pool: ['purple_rna', 'heated_purple_rna', 'cooled_blue_rna', 'green_rna', 'yellow_rna'] as ItemId[],
        maxPatients: 4,
        spawnMs: 6_000,
        timeScale: 0.55,
      }
    default:
      return {
        pool: [
          'red_rna',
          'blue_rna',
          'green_rna',
          'yellow_rna',
          'purple_rna',
          'heated_purple_rna',
          'cooled_blue_rna',
        ] as ItemId[],
        maxPatients: 5,
        spawnMs: 4_000,
        timeScale: 0.42,
      }
  }
}

function initStats(room: Room, playerIds: string[]) {
  room.stats = {}
  for (const id of playerIds) {
    room.stats[id] = { cures: 0, sends: 0 }
  }
}

export function initLabGame(room: Room, playerIds: string[]) {
  const solo = playerIds.length === 1
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
  room.lastTickAt = Date.now()
  room.lastSpawnAt = Date.now()
  room.lastEventSv = solo
    ? 'Alla stationer syns — scrolla och tryck direkt, ingen flikväxling!'
    : 'Nya patienter inkommer — skicka prover mellan stationerna!'
  room.lastEventEn = solo
    ? 'All stations visible — scroll and tap directly, no tab switching!'
    : 'New patients incoming — pass samples between stations!'
}

export function spawnPatient(room: Room, forceItem?: ItemId): Patient {
  const wave = currentWave(room)
  const cfg = waveConfig(wave)
  const requiredVaccine =
    forceItem ?? cfg.pool[Math.floor(Math.random() * cfg.pool.length)]!
  const baseTime = ORDER_TIME[requiredVaccine]
  const maxTime = Math.max(10, Math.round(baseTime * cfg.timeScale))
  return {
    id: crypto.randomUUID(),
    requiredVaccine,
    timeRemaining: maxTime,
    maxTime,
  }
}

function effectiveStation(room: Room, playerId: string): Station {
  const state = room.lab[playerId]
  if (!state) return 'extractor'
  return room.mode === 'solo' ? state.activeStation : state.assignedStation
}

function atStation(room: Room, playerId: string, station: Station): boolean {
  if (room.mode === 'solo') return true
  return effectiveStation(room, playerId) === station
}

function setEvent(room: Room, sv: string, en: string) {
  room.lastEventSv = sv
  room.lastEventEn = en
}

function setAlert(room: Room, playerId: string, alert: PlayerAlert) {
  if (!room.alerts) room.alerts = {}
  room.alerts[playerId] = alert
}

function bumpStat(room: Room, playerId: string, field: 'cures' | 'sends') {
  if (!room.stats[playerId]) room.stats[playerId] = { cures: 0, sends: 0 }
  room.stats[playerId][field] += 1
}

function playerName(room: Room, playerId: string) {
  return room.players.find((p) => p.id === playerId)?.name ?? '?'
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
  const msgPair = pingMessages[kind]
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

  setEvent(room, msgPair.sv, msgPair.en)
  return {}
}

export function switchStation(room: Room, playerId: string, station: Station): { error?: string } {
  if (room.status !== 'playing') return { error: 'Spelet körs inte' }
  if (room.mode !== 'solo') return { error: 'Bara solo kan byta station' }
  const state = room.lab[playerId]
  if (!state) return { error: 'Spelare saknas' }
  state.activeStation = station
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
  if (state.itemInHand) return { error: 'Händerna är fulla — skicka eller leverera först' }
  state.itemInHand = element
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
  if (!state.itemInHand) return { error: 'Du har inget i handen' }

  if (mode === 'heat') {
    if (state.itemInHand !== 'purple_rna') return { error: 'Värme kräver lila RNA' }
    state.itemInHand = 'heated_purple_rna'
    setEvent(room, 'Provet uppvärmt!', 'Sample heated!')
    return {}
  }

  if (state.itemInHand !== 'blue_rna') return { error: 'Kyla kräver blå RNA' }
  state.itemInHand = 'cooled_blue_rna'
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
  setEvent(room, `${fromName} skickade ${shortSv}!`, `${fromName} sent ${shortEn}!`)
  return {}
}

export function deliverVaccine(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (!state.itemInHand) return { error: 'Du har inget att leverera' }

  const patient = room.patients.find((p) => p.requiredVaccine === state.itemInHand)
  if (!patient) {
    return { error: 'Ingen patient behöver detta prov just nu' }
  }

  room.patients = room.patients.filter((p) => p.id !== patient.id)
  state.itemInHand = null
  room.score += 1
  bumpStat(room, playerId, 'cures')
  setEvent(room, `Patient botad! (+1 poäng)`, `Patient cured! (+1 score)`)
  return {}
}

export function dropItem(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state?.itemInHand) return { error: 'Inget att släppa' }
  state.itemInHand = null
  return {}
}

function maybeAdvanceWave(room: Room) {
  const wave = currentWave(room)
  if (wave > room.wave) {
    room.wave = wave
    const labels = WAVE_LABELS[wave]!
    setEvent(room, labels.sv, labels.en)
  }
}

export function tickLab(room: Room) {
  if (room.status !== 'playing') return

  const now = Date.now()
  if (now - room.lastTickAt < TICK_MS) return
  room.lastTickAt = now

  maybeAdvanceWave(room)
  const cfg = waveConfig(currentWave(room))

  const expired: Patient[] = []
  for (const p of room.patients) {
    p.timeRemaining -= 1
    if (p.timeRemaining <= 0) expired.push(p)
  }

  if (expired.length > 0) {
    room.patients = room.patients.filter((p) => p.timeRemaining > 0)
    room.misses += expired.length
    setEvent(
      room,
      `${expired.length} patient(er) försämrades — misslyckande!`,
      `${expired.length} patient(s) deteriorated — missed!`,
    )
    if (room.misses >= MAX_MISSES) {
      room.status = 'gameover'
      setEvent(room, 'För många misslyckanden — labbet stängs.', 'Too many failures — lab shut down.')
      return
    }
  }

  if (room.patients.length < cfg.maxPatients && now - room.lastSpawnAt >= cfg.spawnMs) {
    const newPatient = spawnPatient(room)
    const duplicate = room.patients.some((p) => p.requiredVaccine === newPatient.requiredVaccine)
    if (duplicate && currentWave(room) >= 4 && Math.random() < 0.6) {
      room.patients.push(spawnPatient(room, newPatient.requiredVaccine))
    } else {
      room.patients.push(newPatient)
    }
    room.lastSpawnAt = now
    setEvent(room, 'Ny patient inkommen!', 'New patient arrived!')
  }
}

export function waveLabel(wave: number, lang: Lang) {
  const labels = WAVE_LABELS[wave] ?? WAVE_LABELS[4]!
  return lang === 'en' ? labels.en : labels.sv
}

export function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}
