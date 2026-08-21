import type { ActionKind, ActionOption, Lang, MapRegion, RegionId } from '../types.js'

export const MIN_PLAYERS = 0
export const STARTING_RESOURCE_POINTS = 480
export const BASE_INCOME = 180
export const WIN_CURE_PROGRESS = 100
export const WIN_CONTAINED_INFECTION = 18
export const LOSE_WORLD_INFECTION = 72
export const LOSE_HEART_HP = 0
export const STARTING_HEART_HP = 100
export const STARTING_CURE = 0
export const TIMEOUT_VICTORY_INFECTION = 35

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
  let drip = 4 + Math.floor(Math.max(0, turn - 1) * 0.55) + Math.floor(Math.random() * 3)
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
 * Rotating strategy deck — each council feels different; cure is a long grind.
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
  const blight = worldInfection(regions)
  const lands = [...playable(regions)].sort((a, b) => b.infection - a.infection)
  const hottest = lands[0]!
  const second = lands[1] ?? lands[0]!
  const softest = [...playable(regions)].sort((a, b) => a.infection - b.infection)[0]!
  const sealed = lands.find((r) => r.quarantined)
  const pool: ActionOption[] = []

  {
    const target = sealed && turn % 3 === 0 ? sealed : hottest
    const name = labelRegion(target.id, lang)
    const qCost = target.quarantined ? 110 : 155
    pool.push({
      id: `quarantine:${target.id}:${turn}`,
      kind: 'quarantine',
      side: 'good',
      targetRegionId: target.id,
      title:
        lang === 'en'
          ? target.quarantined
            ? `Reinforce lockdown: ${name}`
            : `Lockdown ${name}`
          : target.quarantined
            ? `Förstärk lockdown: ${name}`
            : `Lockdown ${name}`,
      description:
        lang === 'en'
          ? 'Buy time. Blocks seep there (−6%). Does not win the war.'
          : 'Köp tid. Blockerar sipprande (−6%). Vinner inte kriget.',
      cost: qCost,
      amount: 6,
      affordable: points >= qCost,
    })
  }

  {
    const target = turn % 2 === 0 ? hottest : softest.infection < 40 ? softest : hottest
    const name = labelRegion(target.id, lang)
    const purgeAmt =
      18 + Math.floor(Math.random() * 7) + Math.min(6, Math.floor(target.infection / 15))
    const purgeCost = 140 + Math.floor(target.infection * 0.4)
    pool.push({
      id: `cleanse:${target.id}:${turn}`,
      kind: 'cleanse',
      side: 'good',
      targetRegionId: target.id,
      title:
        lang === 'en'
          ? target.id === hottest.id
            ? `Purge ${name}`
            : `Stabilize ${name}`
          : target.id === hottest.id
            ? `Rensa ut ${name}`
            : `Stabilisera ${name}`,
      description:
        lang === 'en'
          ? `Field treatment (−${purgeAmt}%). One land only.`
          : `Fältbehandling (−${purgeAmt}%). Ett land bara.`,
      cost: purgeCost,
      amount: purgeAmt,
      affordable: points >= purgeCost,
    })
  }

  {
    const triageAmt = 6 + Math.min(3, Math.floor(turn / 3))
    pool.push({
      id: `triage:heartlands:${turn}`,
      kind: 'triage',
      side: 'good',
      targetRegionId: 'heartlands',
      title: lang === 'en' ? 'Worldwide triage' : 'Världstriage',
      description:
        lang === 'en'
          ? `Every kingdom −${triageAmt}%. Stops collapse, not a cure.`
          : `Varje rike −${triageAmt}%. Stoppar kollaps, inte ett bot.`,
      cost: 185,
      amount: triageAmt,
      affordable: points >= 185,
    })
  }

  if (second.id !== hottest.id) {
    const name = labelRegion(second.id, lang)
    const amt = 12 + Math.floor(Math.random() * 5)
    pool.push({
      id: `aid:${second.id}:${turn}`,
      kind: 'cleanse',
      side: 'good',
      targetRegionId: second.id,
      title: lang === 'en' ? `Aid convoy to ${name}` : `Hjälpkonvoj till ${name}`,
      description:
        lang === 'en'
          ? `Relief (−${amt}%). A different front.`
          : `Nödhjälp (−${amt}%). En annan front.`,
      cost: 125,
      amount: amt,
      affordable: points >= 125,
    })
  }

  {
    const baseGain = 5 + Math.floor(Math.random() * 3) + Math.min(3, Math.floor(turn / 4))
    const pressureCut = blight >= 55 ? Math.ceil(baseGain * 0.45) : 0
    const gain = Math.max(2, baseGain - pressureCut)
    const rCost = 170 + Math.floor(cureProgress * 0.9)
    pool.push({
      id: `research:heartlands:${turn}`,
      kind: 'research',
      side: 'good',
      targetRegionId: 'heartlands',
      title: lang === 'en' ? 'Fund the cure' : 'Finansiera botemedlet',
      description:
        lang === 'en'
          ? blight >= 55
            ? `Labs under pressure (+${gain} cure). High infection slows research.`
            : `Slow lab work (+${gain} cure). Map stays undefended.`
          : blight >= 55
            ? `Labben pressade (+${gain} bot). Hög smitta bromsar.`
            : `Långsamt labbjobb (+${gain} bot). Kartan oförsvarad.`,
      cost: rCost,
      amount: gain,
      affordable: points >= rCost,
    })
  }

  {
    const dmg = 14 + Math.floor(Math.random() * 6) + Math.min(4, Math.floor((100 - heartHp) / 20))
    pool.push({
      id: `assault:plague_heart:${turn}`,
      kind: 'assault',
      side: 'good',
      targetRegionId: 'plague_heart',
      title: lang === 'en' ? 'Raid the Plague Heart' : 'Räd mot Smittans hjärta',
      description:
        lang === 'en'
          ? `Strike (−${dmg} HP). Soft lands take revenge outbreaks.`
          : `Slå (−${dmg} HP). Mjuka länder får hämndutbrott.`,
      cost: 220,
      amount: dmg,
      affordable: points >= 220,
    })
  }

  const rotations: (ActionKind | 'aid')[][] = [
    ['quarantine', 'cleanse', 'research', 'triage'],
    ['cleanse', 'assault', 'quarantine', 'research'],
    ['triage', 'research', 'cleanse', 'quarantine'],
    ['assault', 'quarantine', 'aid', 'triage'],
    ['research', 'cleanse', 'assault', 'quarantine'],
    ['quarantine', 'triage', 'assault', 'research'],
  ]
  // 'aid' is cleanse with id prefix aid — treat specially
  const wanted = rotations[(Math.max(1, turn) - 1) % rotations.length]!
  const picked: ActionOption[] = []
  const used = new Set<string>()

  for (const slot of wanted) {
    let match: ActionOption | undefined
    if (slot === 'aid') {
      match = pool.find((o) => o.id.startsWith('aid:') && !used.has(o.id))
    } else {
      match = pool.find((o) => o.kind === slot && !o.id.startsWith('aid:') && !used.has(o.id))
    }
    if (match) {
      picked.push(match)
      used.add(match.id)
    }
  }

  for (const o of pool) {
    if (picked.length >= 4) break
    if (used.has(o.id)) continue
    picked.push(o)
    used.add(o.id)
  }

  if (cureProgress >= 60 && !picked.some((p) => p.kind === 'research')) {
    const research = pool.find((o) => o.kind === 'research')
    if (research) picked[3] = research
  }
  if (heartHp <= 40 && !picked.some((p) => p.kind === 'assault')) {
    const assault = pool.find((o) => o.kind === 'assault')
    if (assault) picked[3] = assault
  }

  return picked.slice(0, 4).map((o) => ({ ...o, affordable: points >= o.cost }))
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
      ? 1.55
      : provokedBy === 'triage' || provokedBy === 'cleanse'
        ? 1.2
        : 1

  const spreadAmt = Math.round(
    (10 + Math.floor(Math.max(0, turn - 1) * 1.25) + Math.floor(Math.random() * 6)) * rage,
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

  if (cureProgress >= 12) {
    const cut =
      (provokedBy === 'research' ? 11 : 6) + Math.floor(Math.random() * 6)
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
      const light = option.amount ?? 6
      region.infection = clamp(region.infection - light, 0, 100)
      logSv = `Lockdown i ${nameSv} (−${light}%, förseglad).`
      logEn = `Lockdown in ${nameEn} (−${light}%, sealed).`
      break
    }
    case 'cleanse': {
      const amt = option.amount ?? 18
      region.infection = clamp(region.infection - amt, 0, 100)
      if (region.infection < 20) region.quarantined = false
      logSv = `Behandling i ${nameSv} (−${amt}%).`
      logEn = `Treatment in ${nameEn} (−${amt}%).`
      break
    }
    case 'triage': {
      const amt = option.amount ?? 6
      for (const r of playable(regions)) {
        r.infection = clamp(r.infection - amt, 0, 100)
      }
      logSv = `Världstriage (−${amt}% i varje rike).`
      logEn = `Worldwide triage (−${amt}% in every kingdom).`
      break
    }
    case 'assault': {
      const dmg = option.amount ?? 14
      heartHp = clamp(heartHp - dmg, 0, 100)
      region.infection = clamp(region.infection - 8, 0, 100)
      const soft = [...playable(regions)]
        .filter((r) => !r.quarantined)
        .sort((a, b) => a.infection - b.infection)
      const revenge = 12 + Math.floor(Math.random() * 7)
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
      let gain = option.amount ?? 5
      const blight = worldInfection(regions)
      if (blight >= 70) gain = Math.max(1, Math.floor(gain * 0.35))
      else if (blight >= 55) gain = Math.max(2, Math.floor(gain * 0.55))
      // Diminishing returns as the cure nears completion
      gain = Math.max(1, Math.floor(gain * (1 - cureProgress / 180)))
      cureProgress = clamp(cureProgress + gain, 0, 100)
      logSv =
        blight >= 55
          ? `Botemedlet kryper fram (+${gain}) under smitttryck.`
          : `Botemedlet avancerar (+${gain}). Kartan lämnas öppen.`
      logEn =
        blight >= 55
          ? `The cure inches forward (+${gain}) under blight pressure.`
          : `The cure advances (+${gain}). The map is left open.`
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
  if (blight <= WIN_CONTAINED_INFECTION && state.cureProgress >= 50) return 'victory_contained'
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
