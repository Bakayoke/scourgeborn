import type { ActionOption, Lang, MapRegion, RegionId } from '../types.js'

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

/** One card = one complete choice (land + contain action). Players pick exactly one. */
export function generatePlayerOptions(opts: {
  lang: Lang
  points: number
  regions: MapRegion[]
  turn: number
}): ActionOption[] {
  const { lang, points, regions, turn } = opts
  const lands = [...playable(regions)].sort((a, b) => b.infection - a.infection)
  const hottest = lands[0]!
  const second = lands[1] ?? lands[0]!
  const options: ActionOption[] = []

  const qCost = hottest.quarantined ? 100 : 140
  const hotName = labelRegion(hottest.id, lang)
  options.push({
    id: `quarantine:${hottest.id}:${turn}`,
    kind: 'quarantine',
    side: 'good',
    targetRegionId: hottest.id,
    title: lang === 'en' ? `Quarantine ${hotName}` : `Karantän i ${hotName}`,
    description:
      lang === 'en'
        ? 'Seal the worst outbreak. Slows the next plague push there.'
        : 'Stäng det värsta utbrottet. Bromsar pestens nästa tryck där.',
    cost: qCost,
    affordable: points >= qCost,
  })

  const cleanseAmt = 16 + Math.floor(Math.random() * 8)
  const cleanseCost = 120 + Math.floor(hottest.infection * 0.5)
  options.push({
    id: `cleanse:${hottest.id}:${turn}`,
    kind: 'cleanse',
    side: 'good',
    targetRegionId: hottest.id,
    title: lang === 'en' ? `Cleanse ${hotName}` : `Rensa ${hotName}`,
    description:
      lang === 'en'
        ? `Heal the hotspot (−${cleanseAmt}% infection).`
        : `Hela epicentret (−${cleanseAmt}% smitta).`,
    cost: cleanseCost,
    amount: cleanseAmt,
    affordable: points >= cleanseCost,
  })

  if (second.id !== hottest.id) {
    const n2 = labelRegion(second.id, lang)
    const light = 10 + Math.floor(Math.random() * 5)
    options.push({
      id: `cleanse:${second.id}:${turn}`,
      kind: 'cleanse',
      side: 'good',
      targetRegionId: second.id,
      title: lang === 'en' ? `Aid ${n2}` : `Stöd ${n2}`,
      description:
        lang === 'en'
          ? `Field hospitals (−${light}% infection).`
          : `Fältsjukhus (−${light}% smitta).`,
      cost: 100,
      amount: light,
      affordable: points >= 100,
    })
  }

  const dmg = 14 + Math.floor(Math.random() * 8)
  options.push({
    id: `assault:plague_heart:${turn}`,
    kind: 'assault',
    side: 'good',
    targetRegionId: 'plague_heart',
    title: lang === 'en' ? 'Assault the Plague Heart' : 'Anfall Smittans hjärta',
    description:
      lang === 'en'
        ? `Strike the nest (−${dmg} HP).`
        : `Slå mot nästet (−${dmg} HP).`,
    cost: 200,
    amount: dmg,
    affordable: points >= 200,
  })

  // One cure card so victory_cure remains a path — still a single vote
  options.push({
    id: `research:heartlands:${turn}`,
    kind: 'research',
    side: 'good',
    targetRegionId: 'heartlands',
    title: lang === 'en' ? 'Fund the cure labs' : 'Finansiera botemedelslabben',
    description:
      lang === 'en'
        ? 'Advance the cure (+12–17). Fewer boots on outbreaks this round.'
        : 'Driv botemedlet (+12–17). Färre stövlar mot utbrott den här omgången.',
    cost: 160,
    amount: 12,
    affordable: points >= 160,
  })

  return options.map((o) => ({ ...o, affordable: points >= o.cost }))
}

/** Plague AI picks from the same style of option cards. */
export function generatePlagueOptions(opts: {
  lang: Lang
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  turn: number
}): ActionOption[] {
  const { lang, regions, cureProgress, heartHp, turn } = opts
  const lands = [...playable(regions)].sort((a, b) => a.infection - b.infection)
  const soft = lands.find((r) => !r.quarantined) ?? lands[0]!
  const sealed = lands.find((r) => r.quarantined)
  const options: ActionOption[] = []

  const spreadAmt = 7 + Math.floor(Math.max(0, turn - 2) * 0.8) + Math.floor(Math.random() * 5)
  const softName = labelRegion(soft.id, lang)
  options.push({
    id: `spread:${soft.id}:${turn}`,
    kind: 'spread',
    side: 'plague',
    targetRegionId: soft.id,
    title: lang === 'en' ? `Seep into ${softName}` : `Sipprar in i ${softName}`,
    description:
      lang === 'en'
        ? `Push infection (+${spreadAmt}%).`
        : `Höj smittan (+${spreadAmt}%).`,
    cost: 0,
    amount: spreadAmt,
    affordable: true,
  })

  if (sealed) {
    const sn = labelRegion(sealed.id, lang)
    options.push({
      id: `breach:${sealed.id}:${turn}`,
      kind: 'breach',
      side: 'plague',
      targetRegionId: sealed.id,
      title: lang === 'en' ? `Breach quarantine in ${sn}` : `Bryt karantän i ${sn}`,
      description:
        lang === 'en'
          ? 'Tear down the seals and surge (+10%).'
          : 'Riv förseglingarna och sväll (+10%).',
      cost: 0,
      amount: 10,
      affordable: true,
    })
  }

  if (cureProgress >= 20) {
    const cut = 4 + Math.floor(Math.random() * 5)
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

  if (heartHp < 90) {
    const heal = 4 + Math.floor(Math.random() * 5)
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

  // Always have a secondary drip target
  const drip = lands.filter((r) => r.id !== soft.id)[0] ?? soft
  options.push({
    id: `spread-drip:${drip.id}:${turn}`,
    kind: 'spread',
    side: 'plague',
    targetRegionId: drip.id,
    title: lang === 'en' ? `Drift into ${labelRegion(drip.id, lang)}` : `Driver in i ${labelRegion(drip.id, lang)}`,
    description:
      lang === 'en' ? 'A lesser outbreak (+5%).' : 'Ett mindre utbrott (+5%).',
    cost: 0,
    amount: 5,
    affordable: true,
  })

  return options
}

export function pickPlagueOption(options: ActionOption[]): ActionOption {
  if (options.length === 0) throw new Error('No plague options')
  // Prefer breach / sabotage when available
  const preferred = options.filter((o) => o.kind === 'breach' || o.kind === 'sabotage')
  const pool = preferred.length && Math.random() < 0.55 ? preferred : options
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
      logSv = `Karantän i ${nameSv}.`
      logEn = `Quarantine in ${nameEn}.`
      break
    }
    case 'cleanse': {
      const amt = option.amount ?? 12
      region.infection = clamp(region.infection - amt, 0, 100)
      if (region.infection < 25) region.quarantined = false
      // Small passive cure drip from successful cleansing
      cureProgress = clamp(cureProgress + 2, 0, 100)
      logSv = `Rensning i ${nameSv} (−${amt}%).`
      logEn = `Cleanse in ${nameEn} (−${amt}%).`
      break
    }
    case 'assault': {
      const dmg = option.amount ?? 14
      heartHp = clamp(heartHp - dmg, 0, 100)
      region.infection = clamp(region.infection - 8, 0, 100)
      logSv = `Anfall mot Smittans hjärta (−${dmg} HP).`
      logEn = `Assault on the Plague Heart (−${dmg} HP).`
      break
    }
    case 'research': {
      const base = option.amount ?? 10
      const gain = base + Math.floor(Math.random() * 6)
      cureProgress = clamp(cureProgress + gain, 0, 100)
      logSv = `Botemedlet avancerar (+${gain}).`
      logEn = `The cure advances (+${gain}).`
      break
    }
    case 'spread': {
      let amt = option.amount ?? 8
      if (region.quarantined) amt = Math.floor(amt * 0.45)
      region.infection = clamp(region.infection + amt, 0, 100)
      logSv = `Pesten sipprar in i ${nameSv} (+${amt}%).`
      logEn = `The plague seeps into ${nameEn} (+${amt}%).`
      break
    }
    case 'breach': {
      region.quarantined = false
      const amt = option.amount ?? 10
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
      nest.infection = clamp(nest.infection + 2, 0, 100)
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
