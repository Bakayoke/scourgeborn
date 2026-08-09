import type { ActionKind, ActionOption, Lang, MapRegion, RegionId } from '../types.js'

/** Seated defenders required. Host alone may still start (solo). */
export const MIN_PLAYERS = 0
export const STARTING_RESOURCE_POINTS = 480
export const BASE_INCOME = 200
export const WIN_CURE_PROGRESS = 100
export const WIN_CONTAINED_INFECTION = 22
export const LOSE_WORLD_INFECTION = 78
export const LOSE_HEART_HP = 0
export const STARTING_HEART_HP = 100
export const STARTING_CURE = 5
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

const REGION_META: Record<
  RegionId,
  { sv: string; en: string; starting: number }
> = {
  north_kingdom: { sv: 'Nordriket', en: 'North Kingdom', starting: 18 },
  elf_woods: { sv: 'Alvskogarna', en: 'Elf Woods', starting: 22 },
  eastern_wastes: { sv: 'Ödemarken', en: 'Eastern Wastes', starting: 35 },
  southern_ports: { sv: 'Sydhamnarna', en: 'Southern Ports', starting: 28 },
  heartlands: { sv: 'Hjärtlandet', en: 'Heartlands', starting: 14 },
  plague_heart: { sv: 'Smittans hjärta', en: 'Plague Heart', starting: 70 },
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
  // Healthier world → more tribute / supply lines
  let income = BASE_INCOME + Math.floor((100 - blight) * 1.4)
  income += Math.floor(cureProgress * 0.35)
  return Math.max(120, income)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function regionById(regions: MapRegion[], id: RegionId): MapRegion {
  const r = regions.find((x) => x.id === id)
  if (!r) throw new Error(`Missing region ${id}`)
  return r
}

export function generateActionOptions(opts: {
  lang: Lang
  points: number
  focusRegionId: RegionId
  regions: MapRegion[]
  cureProgress: number
  turn: number
}): ActionOption[] {
  const { lang, points, focusRegionId, regions, turn } = opts
  const region = regionById(regions, focusRegionId)
  const name = labelRegion(focusRegionId, lang)
  const options: ActionOption[] = []

  if (focusRegionId !== 'plague_heart') {
    const qCost = region.quarantined ? 120 : 160
    options.push({
      id: `quarantine:${focusRegionId}:${turn}`,
      kind: 'quarantine',
      title: lang === 'en' ? `Quarantine ${name}` : `Karantän i ${name}`,
      description:
        lang === 'en'
          ? 'Seal the borders. Slows the next plague push here.'
          : 'Stäng gränserna. Bromsar pestens nästa tryck här.',
      cost: qCost,
      affordable: points >= qCost,
    })

    const cleanseAmt = 16 + Math.floor(Math.random() * 8)
    const cleanseCost = 140 + Math.floor(region.infection * 0.8)
    options.push({
      id: `cleanse:${focusRegionId}:${turn}`,
      kind: 'cleanse',
      title: lang === 'en' ? `Cleanse ${name}` : `Rensa ${name}`,
      description:
        lang === 'en'
          ? `Heal the land (−${cleanseAmt}% infection).`
          : `Hela landet (−${cleanseAmt}% smitta).`,
      cost: cleanseCost,
      amount: cleanseAmt,
      affordable: points >= cleanseCost,
    })
  }

  // Cure research is always available — spend resources anywhere; labs are strongest in key lands.
  {
    const hub = focusRegionId === 'heartlands' || focusRegionId === 'elf_woods'
    const rAmt = focusRegionId === 'heartlands' ? 14 : hub ? 12 : 8
    const rCost = hub ? 180 : 200
    options.push({
      id: `research:${focusRegionId}:${turn}`,
      kind: 'research',
      title: lang === 'en' ? 'Develop the cure' : 'Utveckla botemedlet',
      description:
        lang === 'en'
          ? hub
            ? `Fund the royal labs (+${rAmt}–${rAmt + 5} cure).`
            : `Ship supplies to the labs from here (+${rAmt}–${rAmt + 4} cure).`
          : hub
            ? `Finansiera kungliga labb (+${rAmt}–${rAmt + 5} botemedel).`
            : `Skicka resurser till labben härifrån (+${rAmt}–${rAmt + 4} botemedel).`,
      cost: rCost,
      amount: rAmt,
      affordable: points >= rCost,
    })
  }

  if (focusRegionId === 'plague_heart') {
    const dmg = 16 + Math.floor(Math.random() * 8)
    const aCost = 220
    options.push({
      id: `assault:plague_heart:${turn}`,
      kind: 'assault',
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
      title: lang === 'en' ? 'Bleed the nest' : 'Tömma nästet',
      description:
        lang === 'en'
          ? `Weaken local blight (−${cleanseAmt}%).`
          : `Försvaga lokal smitta (−${cleanseAmt}%).`,
      cost: 200,
      amount: cleanseAmt,
      affordable: points >= 200,
    })
  }

  if (options.length === 0) {
    options.push({
      id: `cleanse:${focusRegionId}:fallback:${turn}`,
      kind: 'cleanse',
      title: lang === 'en' ? `Aid ${name}` : `Stöd ${name}`,
      description:
        lang === 'en' ? 'A modest cleanse (−10%).' : 'En blygsam rensning (−10%).',
      cost: 100,
      amount: 10,
      affordable: points >= 100,
    })
  }

  return options.map((o) => ({ ...o, affordable: points >= o.cost }))
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
  const region = regionById(regions, focusRegionId)
  const nameSv = labelRegion(focusRegionId, 'sv')
  const nameEn = labelRegion(focusRegionId, 'en')
  let logSv = ''
  let logEn = ''

  switch (option.kind as ActionKind) {
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
      const gain = base + Math.floor(Math.random() * 6)
      cureProgress = clamp(cureProgress + gain, 0, 100)
      logSv = `Botemedlet avancerar (+${gain}).`
      logEn = `The cure advances (+${gain}).`
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

  // Natural seep from the nest
  heart.infection = clamp(heart.infection + 2 + Math.floor(Math.random() * 3), 0, 100)

  const targets = [...playable].sort((a, b) => a.infection - b.infection)
  const soft = targets.filter((r) => !r.quarantined)
  const pick = (soft[0] ?? targets[0])!

  let spread = 8 + Math.floor(state.turn * 0.5) + Math.floor(Math.random() * 6)
  if (pick.quarantined) spread = Math.floor(spread * 0.4)
  pick.infection = clamp(pick.infection + spread, 0, 100)

  // Secondary drip into a random non-quarantined land
  const open = playable.filter((r) => !r.quarantined && r.id !== pick.id)
  if (open.length) {
    const t = open[Math.floor(Math.random() * open.length)]
    t.infection = clamp(t.infection + 3 + Math.floor(Math.random() * 4), 0, 100)
  }

  // Sometimes the plague lashes at the cure or recovers heart HP
  const roll = Math.random()
  let logSv = ''
  let logEn = ''
  const name = labelRegion(pick.id, 'sv')
  const nameEn = labelRegion(pick.id, 'en')

  if (state.cureProgress >= 35 && roll < 0.3) {
    const cut = 4 + Math.floor(Math.random() * 5)
    cureProgress = clamp(cureProgress - cut, 0, 100)
    logSv = `Pesten sipprar in i ${name} (+${spread}%) och saboterar labben (−${cut} botemedel).`
    logEn = `The plague seeps into ${nameEn} (+${spread}%) and sabotages the labs (−${cut} cure).`
  } else if (heartHp < 85 && roll < 0.45) {
    const heal = 4 + Math.floor(Math.random() * 5)
    heartHp = clamp(heartHp + heal, 0, 100)
    logSv = `Pesten sväller i ${name} (+${spread}%). Smittans hjärta pulserar (+${heal} HP).`
    logEn = `The plague swells in ${nameEn} (+${spread}%). The Plague Heart pulses (+${heal} HP).`
  } else {
    logSv = `Pesten bryter ut i ${name} (+${spread}%).`
    logEn = `The plague breaks out in ${nameEn} (+${spread}%).`
  }

  // Quarantines eventually fray
  for (const r of playable) {
    if (r.quarantined && Math.random() < 0.25) {
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
