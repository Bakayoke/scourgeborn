import type { ItemId, Lang, LabPlayerState, Patient, Room, Station } from '../types.js'

export const MAX_MISSES = 3
export const MAX_PATIENTS = 4
export const PATIENT_SPAWN_MS = 18_000
export const TICK_MS = 1_000
export const MIN_MULTI_PLAYERS = 2

const STATIONS: Station[] = ['extractor', 'synthesizer', 'incubator']

const ORDER_POOL: ItemId[] = [
  'heated_purple_rna',
  'purple_rna',
  'cooled_blue_rna',
  'red_rna',
  'blue_rna',
]

const ORDER_TIME: Record<ItemId, number> = {
  red_rna: 45,
  blue_rna: 45,
  purple_rna: 55,
  heated_purple_rna: 70,
  cooled_blue_rna: 60,
}

export function itemLabel(id: ItemId, lang: Lang): string {
  const sv: Record<ItemId, string> = {
    red_rna: 'Röd RNA',
    blue_rna: 'Blå RNA',
    purple_rna: 'Lila RNA',
    heated_purple_rna: 'Uppvärmd lila RNA',
    cooled_blue_rna: 'Kyld blå RNA',
  }
  const en: Record<ItemId, string> = {
    red_rna: 'Red RNA',
    blue_rna: 'Blue RNA',
    purple_rna: 'Purple RNA',
    heated_purple_rna: 'Heated Purple RNA',
    cooled_blue_rna: 'Cooled Blue RNA',
  }
  return lang === 'en' ? en[id] : sv[id]
}

export function stationLabel(station: Station, lang: Lang): string {
  const sv = { extractor: 'Extraktor', synthesizer: 'Synthesizer', incubator: 'Inkubator' }
  const en = { extractor: 'Extractor', synthesizer: 'Synthesizer', incubator: 'Incubator' }
  return lang === 'en' ? en[station] : sv[station]
}

export function activePlayerIds(room: Room): string[] {
  return room.players.filter((p) => !p.spectator).map((p) => p.id)
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

export function initLabGame(room: Room, playerIds: string[]) {
  const solo = playerIds.length === 1
  room.mode = solo ? 'solo' : 'multi'
  room.status = 'playing'
  room.score = 0
  room.misses = 0
  room.patients = [spawnPatient()]
  room.lab = assignStations(playerIds, solo)
  room.lastTickAt = Date.now()
  room.lastSpawnAt = Date.now()
  room.lastEventSv = solo
    ? 'Solo-läge: byt flik mellan Extraktor, Synthesizer och Inkubator.'
    : 'Nya patienter inkommer — skicka prover mellan stationerna!'
  room.lastEventEn = solo
    ? 'Solo mode: switch tabs between Extractor, Synthesizer and Incubator.'
    : 'New patients incoming — pass samples between stations!'
}

export function spawnPatient(): Patient {
  const requiredVaccine = ORDER_POOL[Math.floor(Math.random() * ORDER_POOL.length)]!
  const maxTime = ORDER_TIME[requiredVaccine]
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

function setEvent(room: Room, sv: string, en: string) {
  room.lastEventSv = sv
  room.lastEventEn = en
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
  element: 'red_rna' | 'blue_rna',
): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (effectiveStation(room, playerId) !== 'extractor') {
    return { error: 'Du står inte vid extraktorn' }
  }
  if (state.itemInHand) return { error: 'Händerna är fulla — skicka eller leverera först' }
  state.itemInHand = element
  setEvent(
    room,
    `${element === 'red_rna' ? 'Röd' : 'Blå'} RNA extraherad.`,
    `${element === 'red_rna' ? 'Red' : 'Blue'} RNA extracted.`,
  )
  return {}
}

export function synthesize(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (effectiveStation(room, playerId) !== 'synthesizer') {
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
    setEvent(room, 'Första provet i synthesizern — skicka det andra.', 'First sample loaded — send the other.')
    return {}
  }

  const hasRed = (state.synthSlot === 'red_rna' && item === 'blue_rna') || (state.synthSlot === 'blue_rna' && item === 'red_rna')
  if (!hasRed) {
    return { error: 'Behöver en röd OCH en blå RNA' }
  }

  state.itemInHand = 'purple_rna'
  state.synthSlot = null
  setEvent(room, 'Lila RNA syntetiserad!', 'Purple RNA synthesized!')
  return {}
}

export function incubate(
  room: Room,
  playerId: string,
  mode: 'heat' | 'cool',
): { error?: string } {
  const state = room.lab[playerId]
  if (!state || room.status !== 'playing') return { error: 'Ogiltigt' }
  if (effectiveStation(room, playerId) !== 'incubator') {
    return { error: 'Du står inte vid inkubatorn' }
  }
  if (!state.itemInHand) return { error: 'Du har inget i handen' }

  if (mode === 'heat') {
    if (state.itemInHand !== 'purple_rna') return { error: 'Värme kräver lila RNA' }
    state.itemInHand = 'heated_purple_rna'
    setEvent(room, 'Provet uppvärmt.', 'Sample heated.')
    return {}
  }

  if (state.itemInHand !== 'blue_rna') return { error: 'Kyla kräver blå RNA' }
  state.itemInHand = 'cooled_blue_rna'
  setEvent(room, 'Provet kyld.', 'Sample cooled.')
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

  to.itemInHand = from.itemInHand
  from.itemInHand = null
  const toName = room.players.find((p) => p.id === toId)?.name ?? '?'
  setEvent(room, `Prov skickat till ${toName}.`, `Sample sent to ${toName}.`)
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
  setEvent(room, `Patient botad! (+1 poäng)`, `Patient cured! (+1 score)`)
  return {}
}

export function dropItem(room: Room, playerId: string): { error?: string } {
  const state = room.lab[playerId]
  if (!state?.itemInHand) return { error: 'Inget att släppa' }
  state.itemInHand = null
  return {}
}

export function tickLab(room: Room) {
  if (room.status !== 'playing') return

  const now = Date.now()
  if (now - room.lastTickAt < TICK_MS) return
  room.lastTickAt = now

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

  if (
    room.patients.length < MAX_PATIENTS &&
    now - room.lastSpawnAt >= PATIENT_SPAWN_MS
  ) {
    room.patients.push(spawnPatient())
    room.lastSpawnAt = now
    setEvent(room, 'Ny patient inkommen!', 'New patient arrived!')
  }
}

export function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}
