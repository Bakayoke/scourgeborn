import type { ActionKind, ActionOption, Lang, MapRegion, RegionId } from '../types.js'

export const MIN_PLAYERS = 0
export const STARTING_RESOURCE_POINTS = 520
export const BASE_INCOME = 220
export const WIN_CURE_PROGRESS = 100
export const WIN_CONTAINED_INFECTION = 22
export const LOSE_WORLD_INFECTION = 78
export const LOSE_HEART_HP = 0
export const STARTING_HEART_HP = 100
export const STARTING_CURE = 8
export const TIMEOUT_VICTORY_INFECTION = 40

/** Realtime hybrid pacing */
export const COUNCIL_MS = 25_000
export const RESOLVE_MS = 3_500
export const WORLD_TICK_MS = 7_000
export const LIVE_EVENT_CAP = 12

export const REGION_ORDER: RegionId[] = [
  'north_kingdom',
  'elf_woods',
  'eastern_wastes',
  'southern_ports',
  'heartlands',
  'plague_heart',
]

const REGION_META: Record<RegionId, { sv: string; en: string; starting: number }> = {
  north_kingdom: { sv: 'Nordriket', en: 'North Kingdom', starting: 16 },
  elf_woods: { sv: 'Alvskogarna', en: 'Elf Woods', starting: 20 },
  eastern_wastes: { sv: 'Ödemarken', en: 'Eastern Wastes', starting: 32 },
  southern_ports: { sv: 'Sydhamnarna', en: 'Southern Ports', starting: 26 },
  heartlands: { sv: 'Hjärtlandet', en: 'Heartlands', starting: 12 },
  plague_heart: { sv: 'Smittans hjärta', en: 'Plague Heart', starting: 65 },
}

export function labelRegion(id: RegionId, lang: Lang): string {
  const m = REGION_META[id]
  return lang === 'en' ? m.en : m.sv
}

export function createInitialRegions(): MapRegion[] {
  return REGION_ORDER.map((id) => ({
    id,
    infection: REGION_META[id].starting,
    quarantined: false,
  }))
}

export function worldInfection(regions: MapRegion[]): number {
  const playable = regions.filter((r) => r.id !== 'plague_heart')
  if (playable.length === 0) return 0
  const sum = playable.reduce((a, r) => a + r.infection, 0)
  return Math.round(sum / playable.length)
}

export function incomeFor(regions: MapRegion[], cureProgress: number): number {
  const blight = worldInfection(regions)
  let income = BASE_INCOME + Math.floor((100 - blight) * 1.5)
  income += Math.floor(cureProgress * 0.4)
  return Math.max(140, income)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function regionById(regions: MapRegion[], id: RegionId): MapRegion {
  const r = regions.find((x) => x.id === id)
  if (!r) throw new Error(`Missing region ${id}`)
  return r
}

function playable(regions: MapRegion[]) {
  return regions.filter((r) => r.id !== 'plague_heart')
}

/** Small continuous seep while the council deliberates. */
export function applyWorldTick(
  regions: MapRegion[],
  turn: number,
): { regions: MapRegion[]; targetId: RegionId; delta: number } {
  const next = regions.map((r) => ({ ...r }))
  const lands = playable(next)
  const soft = [...lands].sort((a, b) => a.infection - b.infection)
  const target = soft.find((r) => !r.quarantined)
  if (!target) {
    const heart = regionById(next, 'plague_heart')
    const before = heart.infection
    heart.infection = clamp(heart.infection + 1, 0, 100)
    return { regions: next, targetId: 'plague_heart', delta: heart.infection - before }
  }

  const before = target.infection
  let drip = 3 + Math.floor(Math.max(0, turn - 1) * 0.45) + Math.floor(Math.random() * 3)
  target.infection = clamp(target.infection + drip, 0, 100)
  const delta = target.infection - before

  const heart = regionById(next, 'plague_heart')
  heart.infection = clamp(heart.infection + 1, 0, 100)

  if (Math.random() < 0.1) {
    for (const r of lands) {
      if (r.quarantined && Math.random() < 0.4) r.quarantined = false
    }
  }

  return { regions: next, targetId: target.id, delta }
}

/**
 * Four sharp strategies each council (Plague Inc, but you are the cure):
 * lockdown · purge · worldwide triage · research OR strike the nest.
 */
export function generatePlayerOptions(opts: {
  lang: Lang
  points: number
  regions: MapRegion[]
  turn: number
  cureProgress?: number
  heartHp?: number
}): ActionOption[] {
  const { lang, points, regions, turn } = opts
  const cureProgress = opts.cureProgress ?? 0
  const heartHp = opts.heartHp ?? STARTING_HEART_HP
  const lands = [...playable(regions)].sort((a, b) => b.infection - a.infection)
  const hottest = lands[0]!
  const hotName = labelRegion(hottest.id, lang)
  const options: ActionOption[] = []

  // 1) LOCKDOWN — buys time, does not heal much
  const qCost = hottest.quarantined ? 90 : 150
  options.push({
    id: `quarantine:${hottest.id}:${turn}`,
    kind: 'quarantine',
    side: 'good',
    targetRegionId: hottest.id,
    title: lang === 'en' ? `Total lockdown: ${hotName}` : `Total lockdown i ${hotName}`,
    description:
      lang === 'en'
        ? 'Seal borders. Blocks plague seep there; light cleanse (−8%). Time, not a cure.'
        : 'Stäng gränserna. Blockerar sipprande där; lätt rensning (−8%). Tid, inte bot.',
    cost: qCost,
    amount: 8,
    affordable: points >= qCost,
  })

  // 2) PURGE — huge local swing
  const purgeAmt = 28 + Math.floor(Math.random() * 10) + Math.min(8, Math.floor(hottest.infection / 12))
  const purgeCost = 130 + Math.floor(hottest.infection * 0.35)
  options.push({
    id: `cleanse:${hottest.id}:${turn}`,
    kind: 'cleanse',
    side: 'good',
    targetRegionId: hottest.id,
    title: lang === 'en' ? `Purge ${hotName}` : `Rensa ut ${hotName}`,
    description:
      lang === 'en'
        ? `Aggressive treatment (−${purgeAmt}% infection). Leaves other lands bleeding.`
        : `Aggressiv behandling (−${purgeAmt}% smitta). Andra länder blöder vidare.`,
    cost: purgeCost,
    amount: purgeAmt,
    affordable: points >= purgeCost,
  })

  // 3) WORLDWIDE TRIAGE — shallow everywhere
  const triageAmt = 9 + Math.floor(Math.min(4, turn / 2))
  const triageCost = 170
  options.push({
    id: `triage:heartlands:${turn}`,
    kind: 'triage',
    side: 'good',
    targetRegionId: 'heartlands',
    title: lang === 'en' ? 'Worldwide field hospitals' : 'Världsomfattande fältsjukhus',
    description:
      lang === 'en'
        ? `Treat every kingdom (−${triageAmt}% each). Broad, not deep.`
        : `Behandla varje rike (−${triageAmt}% var). Brett, inte djupt.`,
    cost: triageCost,
    amount: triageAmt,
    affordable: points >= triageCost,
  })

  // 4) Win-path: cure race OR nest strike — pick the more dramatic one
  const preferCure =
    cureProgress < 55 || heartHp > 55 || (turn % 2 === 1 && cureProgress < 80)
  if (preferCure) {
    const gain = 18 + Math.floor(Math.random() * 8) + Math.floor(Math.min(6, turn))
    const rCost = 175
    options.push({
      id: `research:heartlands:${turn}`,
      kind: 'research',
      side: 'good',
      targetRegionId: 'heartlands',
      title: lang === 'en' ? 'All-in on the cure' : 'All-in på botemedlet',
      description:
        lang === 'en'
          ? `Lab surge (+${gain} cure). The map is undefended — the plague will answer.`
          : `Labbsatsning (+${gain} bot). Kartan oförsvarad — pesten kommer svara.`,
      cost: rCost,
      amount: gain,
      affordable: points >= rCost,
    })
  } else {
    const dmg = 22 + Math.floor(Math.random() * 10)
    const aCost = 210
    options.push({
      id: `assault:plague_heart:${turn}`,
      kind: 'assault',
      side: 'good',
      targetRegionId: 'plague_heart',
      title: lang === 'en' ? 'Raid the Plague Heart' : 'Räd mot Smittans hjärta',
      description:
        lang === 'en'
          ? `Heavy strike (−${dmg} HP). Expect revenge outbreaks across soft lands.`
          : `Hårt slag (−${dmg} HP). Räkna med hämndutbrott i mjuka länder.`,
      cost: aCost,
      amount: dmg,
      affordable: points >= aCost,
    })
  }

  // Late game: always surface the missing win path as a 5th high-stakes card
  if (turn >= 4 && preferCure && heartHp <= 70) {
    const dmg = 18 + Math.floor(Math.random() * 8)
    options.push({
      id: `assault:plague_heart:${turn}`,
      kind: 'assault',
      side: 'good',
      targetRegionId: 'plague_heart',
      title: lang === 'en' ? 'Desperate raid on the nest' : 'Desperat räd mot nästet',
      description:
        lang === 'en'
          ? `Strike for −${dmg} HP. Risky — plague rage follows.`
          : `Slå för −${dmg} HP. Riskabelt — pestvrede följer.`,
      cost: 190,
      amount: dmg,
      affordable: points >= 190,
    })
  }
  if (turn >= 4 && !preferCure && cureProgress < 90) {
    const gain = 16 + Math.floor(Math.random() * 7)
    options.push({
      id: `research:heartlands:${turn}`,
      kind: 'research',
      side: 'good',
      targetRegionId: 'heartlands',
      title: lang === 'en' ? 'Emergency cure funding' : 'Nödfinansiering av botemedlet',
      description:
        lang === 'en'
          ? `Labs surge (+${gain} cure). Boots stay off the map.`
          : `Labben rusar (+${gain} bot). Stövlarna stannar hemma.`,
      cost: 165,
      amount: gain,
      affordable: points >= 165,
    })
  }

  return options.map((o) => ({ ...o, affordable: points >= o.cost }))
}

/** Plague AI picks counters — especially when provoked by the council's last move. */
export function generatePlagueOptions(opts: {
  lang: Lang
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  turn: number
  provokedBy?: ActionKind | null
}): ActionOption[] {
  const { lang, regions, cureProgress, heartHp, turn, provokedBy } = opts
  const lands = [...playable(regions)].sort((a, b) => a.infection - b.infection)
  const soft = lands.find((r) => !r.quarantined) ?? lands[0]!
  const sealed = lands.find((r) => r.quarantined)
  const hot = [...playable(regions)].sort((a, b) => b.infection - a.infection)[0]!
  const options: ActionOption[] = []

  const rage =
    provokedBy === 'research' || provokedBy === 'assault'
      ? 1.45
      : provokedBy === 'triage' || provokedBy === 'cleanse'
        ? 1.15
        : 1

  const spreadAmt = Math.round(
    (9 + Math.floor(Math.max(0, turn - 1) * 1.1) + Math.floor(Math.random() * 6)) * rage,
  )
  const softName = labelRegion(soft.id, lang)
  options.push({
    id: `spread:${soft.id}:${turn}`,
    kind: 'spread',
    side: 'plague',
    targetRegionId: soft.id,
    title:
      lang === 'en'
        ? rage > 1.2
          ? `Fury seeps into ${softName}`
          : `Seep into ${softName}`
        : rage > 1.2
          ? `Vrede sipprar in i ${softName}`
          : `Sipprar in i ${softName}`,
    description:
      lang === 'en'
        ? `Push infection (+${spreadAmt}%).`
        : `Höj smittan (+${spreadAmt}%).`,
    cost: 0,
    amount: spreadAmt,
    affordable: true,
  })

  // Dual outbreak when the council ignored the map
  if (provokedBy === 'research' || provokedBy === 'assault') {
    const second = lands.find((r) => r.id !== soft.id && !r.quarantined) ?? hot
    const amt = Math.round(8 * rage)
    options.push({
      id: `spread-wave:${second.id}:${turn}`,
      kind: 'spread',
      side: 'plague',
      targetRegionId: second.id,
      title:
        lang === 'en'
          ? `Secondary wave in ${labelRegion(second.id, lang)}`
          : `Sekundär våg i ${labelRegion(second.id, lang)}`,
      description:
        lang === 'en' ? `Retaliation (+${amt}%).` : `Vedergällning (+${amt}%).`,
      cost: 0,
      amount: amt,
      affordable: true,
    })
  }

  if (sealed) {
    const sn = labelRegion(sealed.id, lang)
    const surge = provokedBy === 'quarantine' ? 18 : 12
    options.push({
      id: `breach:${sealed.id}:${turn}`,
      kind: 'breach',
      side: 'plague',
      targetRegionId: sealed.id,
      title: lang === 'en' ? `Breach quarantine in ${sn}` : `Bryt karantän i ${sn}`,
      description:
        lang === 'en'
          ? `Tear the seals and surge (+${surge}%).`
          : `Riv förseglingarna och sväll (+${surge}%).`,
      cost: 0,
      amount: surge,
      affordable: true,
    })
  }

  if (cureProgress >= 15) {
    const cut =
      (provokedBy === 'research' ? 9 : 5) + Math.floor(Math.random() * 5)
    options.push({
      id: `sabotage:heartlands:${turn}`,
      kind: 'sabotage',
      side: 'plague',
      targetRegionId: 'heartlands',
      title: lang === 'en' ? 'Sabotage the labs' : 'Sabotera labben',
      description:
        lang === 'en' ? `Cut cure progress (−${cut}).` : `Sänk botemedlet (−${cut}).`,
      cost: 0,
      amount: cut,
      affordable: true,
    })
  }

  if (heartHp < 95) {
    const heal = (provokedBy === 'assault' ? 10 : 5) + Math.floor(Math.random() * 5)
    options.push({
      id: `pulse:plague_heart:${turn}`,
      kind: 'pulse',
      side: 'plague',
      targetRegionId: 'plague_heart',
      title: lang === 'en' ? 'Heart pulse' : 'Hjärtslag',
      description:
        lang === 'en' ? `The nest recovers (+${heal} HP).` : `Nästet återhämtar (+${heal} HP).`,
      cost: 0,
      amount: heal,
      affordable: true,
    })
  }

  return options
}

export function pickPlagueOption(
  options: ActionOption[],
  provokedBy?: ActionKind | null,
): ActionOption {
  if (options.length === 0) throw new Error('No plague options')
  let preferred: ActionOption[] = []
  if (provokedBy === 'quarantine') preferred = options.filter((o) => o.kind === 'breach')
  else if (provokedBy === 'research') preferred = options.filter((o) => o.kind === 'sabotage' || o.kind === 'spread')
  else if (provokedBy === 'assault') preferred = options.filter((o) => o.kind === 'pulse' || o.kind === 'spread')
  else preferred = options.filter((o) => o.kind === 'breach' || o.kind === 'sabotage')

  const pool = preferred.length && Math.random() < 0.72 ? preferred : options
  return pool[Math.floor(Math.random() * pool.length)]!
}

export type ApplyResult = {
  points: number
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  logSv: string
  logEn: string
}

export function applyAction(
  option: ActionOption,
  state: {
    points: number
    regions: MapRegion[]
    cureProgress: number
    heartHp: number
    lang: Lang
  },
): ApplyResult | { error: string } {
  if (option.side === 'good' && state.points < option.cost) {
    return {
      error:
        state.lang === 'en' ? 'Not enough resources' : 'Inte tillräckligt med resurser',
    }
  }

  let points = option.side === 'good' ? state.points - option.cost : state.points
  const regions = state.regions.map((r) => ({ ...r }))
  let cureProgress = state.cureProgress
  let heartHp = state.heartHp
  const region = regionById(regions, option.targetRegionId)
  const nameSv = labelRegion(option.targetRegionId, 'sv')
  const nameEn = labelRegion(option.targetRegionId, 'en')
  let logSv = ''
  let logEn = ''

  switch (option.kind) {
    case 'quarantine': {
      region.quarantined = true
      const light = option.amount ?? 8
      region.infection = clamp(region.infection - light, 0, 100)
      logSv = `Total lockdown i ${nameSv} (−${light}%, förseglad).`
      logEn = `Total lockdown in ${nameEn} (−${light}%, sealed).`
      break
    }
    case 'cleanse': {
      const amt = option.amount ?? 28
      region.infection = clamp(region.infection - amt, 0, 100)
      if (region.infection < 20) region.quarantined = false
      cureProgress = clamp(cureProgress + 1, 0, 100)
      logSv = `Utrensning i ${nameSv} (−${amt}%).`
      logEn = `Purge in ${nameEn} (−${amt}%).`
      break
    }
    case 'triage': {
      const amt = option.amount ?? 9
      for (const r of playable(regions)) {
        r.infection = clamp(r.infection - amt, 0, 100)
      }
      logSv = `Fältsjukhus världen över (−${amt}% i varje rike).`
      logEn = `Field hospitals worldwide (−${amt}% in every kingdom).`
      break
    }
    case 'assault': {
      const dmg = option.amount ?? 22
      heartHp = clamp(heartHp - dmg, 0, 100)
      region.infection = clamp(region.infection - 10, 0, 100)
      // Revenge: softest open lands spike
      const soft = [...playable(regions)]
        .filter((r) => !r.quarantined)
        .sort((a, b) => a.infection - b.infection)
      const revenge = 10 + Math.floor(Math.random() * 6)
      for (const r of soft.slice(0, 2)) {
        r.infection = clamp(r.infection + revenge, 0, 100)
      }
      const hitNames = soft
        .slice(0, 2)
        .map((r) => labelRegion(r.id, 'sv'))
        .join(', ')
      const hitNamesEn = soft
        .slice(0, 2)
        .map((r) => labelRegion(r.id, 'en'))
        .join(', ')
      logSv = `Räd mot hjärtat (−${dmg} HP). Hämnd i ${hitNames || 'öppna länder'} (+${revenge}%).`
      logEn = `Raid on the Heart (−${dmg} HP). Revenge in ${hitNamesEn || 'open lands'} (+${revenge}%).`
      break
    }
    case 'research': {
      const gain = option.amount ?? 18
      cureProgress = clamp(cureProgress + gain, 0, 100)
      logSv = `All-in på botemedlet (+${gain}). Kartan lämnas öppen.`
      logEn = `All-in on the cure (+${gain}). The map is left open.`
      break
    }
    case 'spread': {
      let amt = option.amount ?? 8
      if (region.quarantined) amt = Math.floor(amt * 0.2)
      region.infection = clamp(region.infection + amt, 0, 100)
      logSv = `Pesten sipprar in i ${nameSv} (+${amt}%).`
      logEn = `The plague seeps into ${nameEn} (+${amt}%).`
      break
    }
    case 'breach': {
      region.quarantined = false
      const amt = option.amount ?? 12
      region.infection = clamp(region.infection + amt, 0, 100)
      logSv = `Karantänen i ${nameSv} bryts (+${amt}%).`
      logEn = `Quarantine in ${nameEn} breaks (+${amt}%).`
      break
    }
    case 'sabotage': {
      const cut = option.amount ?? 5
      cureProgress = clamp(cureProgress - cut, 0, 100)
      logSv = `Pesten saboterar labben (−${cut} botemedel).`
      logEn = `The plague sabotages the labs (−${cut} cure).`
      break
    }
    case 'pulse': {
      const heal = option.amount ?? 5
      heartHp = clamp(heartHp + heal, 0, 100)
      const nest = regionById(regions, 'plague_heart')
      nest.infection = clamp(nest.infection + 3, 0, 100)
      logSv = `Smittans hjärta pulserar (+${heal} HP).`
      logEn = `The Plague Heart pulses (+${heal} HP).`
      break
    }
  }

  return { points, regions, cureProgress, heartHp, logSv, logEn }
}

export type Outcome =
  | 'ongoing'
  | 'victory_cure'
  | 'victory_heart'
  | 'victory_contained'
  | 'defeat_plague'

export function evaluateOutcome(state: {
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
}): Outcome {
  if (state.heartHp <= LOSE_HEART_HP) return 'victory_heart'
  if (state.cureProgress >= WIN_CURE_PROGRESS) return 'victory_cure'
  const blight = worldInfection(state.regions)
  if (blight >= LOSE_WORLD_INFECTION) return 'defeat_plague'
  if (blight <= WIN_CONTAINED_INFECTION && state.cureProgress >= 40) return 'victory_contained'
  return 'ongoing'
}

export function pickWinningId(
  votes: Record<string, string>,
  candidates: string[],
  hostVote?: string | null,
): string | null {
  if (candidates.length === 0) return null
  const counts = new Map<string, number>()
  for (const id of Object.values(votes)) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  let max = 0
  for (const n of counts.values()) max = Math.max(max, n)
  const tied = candidates.filter((id) => (counts.get(id) ?? 0) === max && max > 0)
  if (tied.length === 0) return candidates[0] ?? null
  if (tied.length === 1) return tied[0]
  if (hostVote && tied.includes(hostVote)) return hostVote
  return tied[0]
}

export function tally(votes: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of Object.values(votes)) {
    out[id] = (out[id] ?? 0) + 1
  }
  return out
}
