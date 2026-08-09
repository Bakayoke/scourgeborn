import type { ActionOption, Lang, MapRegion, RegionId } from '../types.js'

/** Seated defenders required. Host alone may still start (solo). */
export const MIN_PLAYERS = 0
export const STARTING_RESOURCE_POINTS = 520
export const BASE_INCOME = 220
export const WIN_CURE_PROGRESS = 100
export const WIN_CONTAINED_INFECTION = 22
export const LOSE_WORLD_INFECTION = 78
export const LOSE_HEART_HP = 0
export const STARTING_HEART_HP = 100
export const STARTING_CURE = 8
/** Soft win if campaign times out at or below this infection */
export const TIMEOUT_VICTORY_INFECTION = 40

export const REGION_ORDER: RegionId[] = [
  'north_kingdom',
  'elf_woods',
  'eastern_wastes',
  'southern_ports',
  'heartlands',
  'plague_heart',
]

export const CURE_HUBS: RegionId[] = ['heartlands', 'elf_woods']

const REGION_META: Record<
  RegionId,
  { sv: string; en: string; starting: number }
> = {
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

/** Infection control options for the chosen contain land. Always at least one affordable at ~520 bank. */
export function generateContainOptions(opts: {
  lang: Lang
  points: number
  focusRegionId: RegionId
  regions: MapRegion[]
  turn: number
}): ActionOption[] {
  const { lang, points, focusRegionId, regions, turn } = opts
  const region = regionById(regions, focusRegionId)
  const name = labelRegion(focusRegionId, lang)
  const options: ActionOption[] = []

  if (focusRegionId === 'plague_heart') {
    const dmg = 14 + Math.floor(Math.random() * 8)
    const aCost = 200
    options.push({
      id: `assault:plague_heart:${turn}`,
      kind: 'assault',
      group: 'contain',
      title: lang === 'en' ? 'Assault the Plague Heart' : 'Anfall Smittans hjärta',
      description:
        lang === 'en'
          ? `Paladins strike the nest (−${dmg} HP).`
          : `Paladiner slår mot nästet (−${dmg} HP).`,
      cost: aCost,
      amount: dmg,
      affordable: points >= aCost,
    })
    const cleanseAmt = 10 + Math.floor(Math.random() * 6)
    options.push({
      id: `cleanse:plague_heart:${turn}`,
      kind: 'cleanse',
      group: 'contain',
      title: lang === 'en' ? 'Bleed the nest' : 'Tömma nästet',
      description:
        lang === 'en'
          ? `Weaken local blight (−${cleanseAmt}%).`
          : `Försvaga lokal smitta (−${cleanseAmt}%).`,
      cost: 160,
      amount: cleanseAmt,
      affordable: points >= 160,
    })
  } else {
    const qCost = region.quarantined ? 100 : 140
    options.push({
      id: `quarantine:${focusRegionId}:${turn}`,
      kind: 'quarantine',
      group: 'contain',
      title: lang === 'en' ? `Quarantine ${name}` : `Karantän i ${name}`,
      description:
        lang === 'en'
          ? 'Seal the borders. Strongly slows the next plague push here.'
          : 'Stäng gränserna. Bromsar kraftigt pestens nästa tryck här.',
      cost: qCost,
      affordable: points >= qCost,
    })

    const cleanseAmt = 18 + Math.floor(Math.random() * 8)
    const cleanseCost = 120 + Math.floor(region.infection * 0.55)
    options.push({
      id: `cleanse:${focusRegionId}:${turn}`,
      kind: 'cleanse',
      group: 'contain',
      title: lang === 'en' ? `Cleanse ${name}` : `Rensa ${name}`,
      description:
        lang === 'en'
          ? `Heal the land (−${cleanseAmt}% infection).`
          : `Hela landet (−${cleanseAmt}% smitta).`,
      cost: cleanseCost,
      amount: cleanseAmt,
      affordable: points >= cleanseCost,
    })

    // Cheap emergency contain so the council can always act
    const lightAmt = 8 + Math.floor(Math.random() * 4)
    options.push({
      id: `cleanse-light:${focusRegionId}:${turn}`,
      kind: 'cleanse',
      group: 'contain',
      title: lang === 'en' ? `Field hospitals in ${name}` : `Fältsjukhus i ${name}`,
      description:
        lang === 'en'
          ? `Modest relief (−${lightAmt}% infection).`
          : `Blygsam hjälp (−${lightAmt}% smitta).`,
      cost: 90,
      amount: lightAmt,
      affordable: points >= 90,
    })
  }

  return options.map((o) => ({ ...o, affordable: points >= o.cost }))
}

/** Cure focus options — always offered every round; pick which hub/area to fund. */
export function generateCureOptions(opts: {
  lang: Lang
  points: number
  turn: number
}): ActionOption[] {
  const { lang, points, turn } = opts
  const options: ActionOption[] = []

  options.push({
    id: `research:heartlands:${turn}`,
    kind: 'research',
    group: 'cure',
    targetRegionId: 'heartlands',
    title: lang === 'en' ? 'Cure labs — Heartlands' : 'Botemedel — Hjärtlandet',
    description:
      lang === 'en'
        ? 'Fund the royal labs (+14–19 cure). Strongest hub.'
        : 'Finansiera kungliga labb (+14–19 botemedel). Starkaste hubben.',
    cost: 170,
    amount: 14,
    affordable: points >= 170,
  })

  options.push({
    id: `research:elf_woods:${turn}`,
    kind: 'research',
    group: 'cure',
    targetRegionId: 'elf_woods',
    title: lang === 'en' ? 'Cure labs — Elf Woods' : 'Botemedel — Alvskogarna',
    description:
      lang === 'en'
        ? 'Elven alchemy (+12–17 cure).'
        : 'Alvisk alkemi (+12–17 botemedel).',
    cost: 160,
    amount: 12,
    affordable: points >= 160,
  })

  options.push({
    id: `research:southern_ports:${turn}`,
    kind: 'research',
    group: 'cure',
    targetRegionId: 'southern_ports',
    title: lang === 'en' ? 'Supply lines — Southern Ports' : 'Försörjning — Sydhamnarna',
    description:
      lang === 'en'
        ? 'Ship reagents worldwide (+8–12 cure).'
        : 'Skeppa reagens världen över (+8–12 botemedel).',
    cost: 150,
    amount: 8,
    affordable: points >= 150,
  })

  options.push({
    id: `research:north_kingdom:${turn}`,
    kind: 'research',
    group: 'cure',
    targetRegionId: 'north_kingdom',
    title: lang === 'en' ? 'Field science — North Kingdom' : 'Fältforskning — Nordriket',
    description:
      lang === 'en'
        ? 'Knight-scribes gather samples (+7–11 cure).'
        : 'Riddarskrivare samlar prover (+7–11 botemedel).',
    cost: 140,
    amount: 7,
    affordable: points >= 140,
  })

  // Always keep a cheap cure tick so dual-spend stays possible after contain
  options.push({
    id: `research:global:${turn}`,
    kind: 'research',
    group: 'cure',
    targetRegionId: 'eastern_wastes',
    title: lang === 'en' ? 'Emergency lab stipend' : 'Nödstipendium till labben',
    description:
      lang === 'en'
        ? 'Small advance (+5–8 cure). Cheap after a big contain spend.'
        : 'Liten avancering (+5–8 botemedel). Billigt efter stor smittspend.',
    cost: 100,
    amount: 5,
    affordable: points >= 100,
  })

  return options.map((o) => ({ ...o, affordable: points >= o.cost }))
}

/** @deprecated use generateContainOptions / generateCureOptions */
export function generateActionOptions(opts: {
  lang: Lang
  points: number
  focusRegionId: RegionId
  regions: MapRegion[]
  cureProgress: number
  turn: number
}): ActionOption[] {
  return generateContainOptions({
    lang: opts.lang,
    points: opts.points,
    focusRegionId: opts.focusRegionId,
    regions: opts.regions,
    turn: opts.turn,
  })
}

export type ApplyResult = {
  points: number
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  logSv: string
  logEn: string
}

export function applyDefenderAction(
  option: ActionOption,
  focusRegionId: RegionId,
  state: {
    points: number
    regions: MapRegion[]
    cureProgress: number
    heartHp: number
    lang: Lang
  },
): ApplyResult | { error: string } {
  if (state.points < option.cost) {
    return {
      error:
        state.lang === 'en' ? 'Not enough resources' : 'Inte tillräckligt med resurser',
    }
  }

  let points = state.points - option.cost
  const regions = state.regions.map((r) => ({ ...r }))
  let cureProgress = state.cureProgress
  let heartHp = state.heartHp
  const regionId = option.targetRegionId ?? focusRegionId
  const region = regionById(regions, regionId)
  const nameSv = labelRegion(regionId, 'sv')
  const nameEn = labelRegion(regionId, 'en')
  let logSv = ''
  let logEn = ''

  switch (option.kind) {
    case 'quarantine': {
      region.quarantined = true
      logSv = `Karantän utfärdas i ${nameSv}.`
      logEn = `Quarantine is declared in ${nameEn}.`
      break
    }
    case 'cleanse': {
      const amt = option.amount ?? 12
      region.infection = clamp(region.infection - amt, 0, 100)
      if (region.infection < 25) region.quarantined = false
      logSv = `Rensningen i ${nameSv} lyckas (−${amt}%).`
      logEn = `The cleanse in ${nameEn} succeeds (−${amt}%).`
      break
    }
    case 'research': {
      const base = option.amount ?? 10
      const spread = option.targetRegionId === 'heartlands' ? 6 : 5
      const gain = base + Math.floor(Math.random() * spread)
      cureProgress = clamp(cureProgress + gain, 0, 100)
      logSv = `Botemedel via ${nameSv} (+${gain}).`
      logEn = `Cure via ${nameEn} (+${gain}).`
      break
    }
    case 'assault': {
      const dmg = option.amount ?? 16
      heartHp = clamp(heartHp - dmg, 0, 100)
      region.infection = clamp(region.infection - 8, 0, 100)
      logSv = `Anfallet mot Smittans hjärta träffar (−${dmg} HP).`
      logEn = `The assault on the Plague Heart lands (−${dmg} HP).`
      break
    }
  }

  return { points, regions, cureProgress, heartHp, logSv, logEn }
}

export type AiResult = {
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  logSv: string
  logEn: string
}

export function applyPlagueTurn(state: {
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  turn: number
}): AiResult {
  const regions = state.regions.map((r) => ({ ...r }))
  let cureProgress = state.cureProgress
  let heartHp = state.heartHp
  const playable = regions.filter((r) => r.id !== 'plague_heart')
  const heart = regionById(regions, 'plague_heart')

  heart.infection = clamp(heart.infection + 1 + Math.floor(Math.random() * 3), 0, 100)

  const targets = [...playable].sort((a, b) => a.infection - b.infection)
  const soft = targets.filter((r) => !r.quarantined)
  const pick = (soft[0] ?? targets[0])!

  const ramp = state.turn <= 3 ? 0 : Math.floor((state.turn - 3) * 0.7)
  let spread = 6 + ramp + Math.floor(Math.random() * 5)
  if (pick.quarantined) spread = Math.floor(spread * 0.45)
  pick.infection = clamp(pick.infection + spread, 0, 100)

  const open = playable.filter((r) => !r.quarantined && r.id !== pick.id)
  if (open.length && state.turn >= 3) {
    const t = open[Math.floor(Math.random() * open.length)]
    t.infection = clamp(t.infection + 2 + Math.floor(Math.random() * 3), 0, 100)
  }

  const roll = Math.random()
  let logSv = ''
  let logEn = ''
  const name = labelRegion(pick.id, 'sv')
  const nameEn = labelRegion(pick.id, 'en')

  if (state.cureProgress >= 40 && roll < 0.28) {
    const cut = 3 + Math.floor(Math.random() * 4)
    cureProgress = clamp(cureProgress - cut, 0, 100)
    logSv = `Pesten sipprar in i ${name} (+${spread}%) och saboterar labben (−${cut} botemedel).`
    logEn = `The plague seeps into ${nameEn} (+${spread}%) and sabotages the labs (−${cut} cure).`
  } else if (heartHp < 85 && roll < 0.4) {
    const heal = 3 + Math.floor(Math.random() * 4)
    heartHp = clamp(heartHp + heal, 0, 100)
    logSv = `Pesten sväller i ${name} (+${spread}%). Smittans hjärta pulserar (+${heal} HP).`
    logEn = `The plague swells in ${nameEn} (+${spread}%). The Plague Heart pulses (+${heal} HP).`
  } else {
    logSv = `Pesten bryter ut i ${name} (+${spread}%).`
    logEn = `The plague breaks out in ${nameEn} (+${spread}%).`
  }

  for (const r of playable) {
    if (r.quarantined && Math.random() < 0.22) {
      r.quarantined = false
    }
  }

  return { regions, cureProgress, heartHp, logSv, logEn }
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
