import type { Lang, MapRegion, RegionId, SkillId, VoteOption } from '../types.js'

export const MIN_PLAYERS = 2
export const STARTING_CORRUPTION_POINTS = 400
export const BASE_INCOME = 180
export const WIN_WORLD_CORRUPTION = 72
export const LOSE_CURE_PROGRESS = 100
export const LOSE_HEART_HP = 0
export const STARTING_HEART_HP = 100
export const STARTING_CURE = 8

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
  { sv: string; en: string; starting: number; incomeWeight: number }
> = {
  north_kingdom: { sv: 'Nordriket', en: 'North Kingdom', starting: 8, incomeWeight: 1 },
  elf_woods: { sv: 'Alvskogarna', en: 'Elf Woods', starting: 5, incomeWeight: 1.1 },
  eastern_wastes: { sv: 'Ödemarken', en: 'Eastern Wastes', starting: 18, incomeWeight: 0.9 },
  southern_ports: { sv: 'Sydhamnarna', en: 'Southern Ports', starting: 10, incomeWeight: 1.2 },
  heartlands: { sv: 'Hjärtlandet', en: 'Heartlands', starting: 4, incomeWeight: 1.3 },
  plague_heart: { sv: 'Smittans hjärta', en: 'Plague Heart', starting: 55, incomeWeight: 0.4 },
}

export const SKILL_META: Record<
  SkillId,
  {
    sv: string
    en: string
    cost: number
    requires?: SkillId[]
    blurbSv: string
    blurbEn: string
  }
> = {
  contagion: {
    sv: 'Kontagion',
    en: 'Contagion',
    cost: 0,
    blurbSv: 'Grundkraften — korruption sipprar fram varje råd.',
    blurbEn: 'The base force — corruption seeps in each council.',
  },
  waterborne: {
    sv: 'Vattenburen smitta',
    en: 'Waterborne',
    cost: 320,
    requires: ['contagion'],
    blurbSv: 'Hamnar och floder sprider pesten billigare.',
    blurbEn: 'Ports and rivers spread the plague cheaper.',
  },
  necromancy: {
    sv: 'Nekromanti',
    en: 'Necromancy',
    cost: 450,
    requires: ['contagion'],
    blurbSv: 'Döda fiender reser sig och bromsar botemedlet.',
    blurbEn: 'Fallen foes rise and slow the cure.',
  },
  shadow_veil: {
    sv: 'Skuggslöja',
    en: 'Shadow Veil',
    cost: 380,
    requires: ['contagion'],
    blurbSv: 'Forskarna tappar spår — botemedlet går långsammare.',
    blurbEn: 'Researchers lose the trail — the cure slows.',
  },
  blight_bloom: {
    sv: 'Pestblom',
    en: 'Blight Bloom',
    cost: 500,
    requires: ['waterborne'],
    blurbSv: 'Utbrott träffar hårdare i redan sjuka länder.',
    blurbEn: 'Outbreaks hit harder in already sick lands.',
  },
  drake_summon: {
    sv: 'Drakekallelse',
    en: 'Drake Summon',
    cost: 600,
    requires: ['necromancy'],
    blurbSv: 'En drake distraherar De Goda i ett drag.',
    blurbEn: 'A drake distracts The Good for one turn.',
  },
}

export function labelRegion(id: RegionId, lang: Lang): string {
  const m = REGION_META[id]
  return lang === 'en' ? m.en : m.sv
}

export function labelSkill(id: SkillId, lang: Lang): string {
  const m = SKILL_META[id]
  return lang === 'en' ? m.en : m.sv
}

export function createInitialRegions(): MapRegion[] {
  return REGION_ORDER.map((id) => ({
    id,
    corruption: REGION_META[id].starting,
    quarantined: false,
  }))
}

export function worldCorruption(regions: MapRegion[]): number {
  const playable = regions.filter((r) => r.id !== 'plague_heart')
  if (playable.length === 0) return 0
  const sum = playable.reduce((a, r) => a + r.corruption, 0)
  return Math.round(sum / playable.length)
}

export function incomeFor(skills: SkillId[], regions: MapRegion[]): number {
  let income = BASE_INCOME
  if (skills.includes('contagion')) income += 40
  if (skills.includes('waterborne')) income += 35
  if (skills.includes('blight_bloom')) income += 50
  const avg = worldCorruption(regions)
  income += Math.floor(avg * 1.2)
  return income
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function regionById(regions: MapRegion[], id: RegionId): MapRegion {
  const r = regions.find((x) => x.id === id)
  if (!r) throw new Error(`Missing region ${id}`)
  return r
}

export function canUnlock(skills: SkillId[], id: SkillId): boolean {
  if (skills.includes(id)) return false
  const req = SKILL_META[id].requires ?? []
  return req.every((r) => skills.includes(r))
}

type GenCtx = {
  lang: Lang
  points: number
  skills: SkillId[]
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  turn: number
}

function outbreakCost(skills: SkillId[], region: MapRegion): number {
  let cost = 220 + Math.floor(region.corruption * 1.5)
  if (region.id === 'southern_ports' && skills.includes('waterborne')) cost = Math.floor(cost * 0.7)
  if (region.id === 'elf_woods' && skills.includes('waterborne')) cost = Math.floor(cost * 0.85)
  if (region.quarantined) cost += 120
  return cost
}

function outbreakPower(skills: SkillId[], region: MapRegion): number {
  let power = 18 + Math.floor(Math.random() * 8)
  if (skills.includes('blight_bloom') && region.corruption >= 25) power += 10
  if (region.quarantined) power = Math.floor(power * 0.55)
  return power
}

export function generateVoteOptions(ctx: GenCtx): VoteOption[] {
  const { lang, points, skills, regions, cureProgress, heartHp, turn } = ctx
  const options: VoteOption[] = []
  const playable = regions.filter((r) => r.id !== 'plague_heart')

  // Prefer spreading to least-corrupted non-quarantined lands
  const targets = [...playable].sort((a, b) => a.corruption - b.corruption)
  for (const region of targets.slice(0, 3)) {
    const cost = outbreakCost(skills, region)
    const power = outbreakPower(skills, region)
    const name = labelRegion(region.id, lang)
    options.push({
      id: `outbreak:${region.id}:${turn}`,
      kind: 'outbreak',
      title: lang === 'en' ? `Outbreak in ${name}` : `Utbrott i ${name}`,
      description:
        lang === 'en'
          ? `Spend ${cost} corruption to push +${power}% blight${region.quarantined ? ' (quarantine resists)' : ''}.`
          : `Spendera ${cost} korruption för +${power}% pest${region.quarantined ? ' (karantän motstår)' : ''}.`,
      cost,
      regionId: region.id,
      amount: power,
      affordable: points >= cost,
    })
  }

  // Unlock next available skills
  for (const id of Object.keys(SKILL_META) as SkillId[]) {
    if (id === 'contagion') continue
    if (!canUnlock(skills, id)) continue
    const meta = SKILL_META[id]
    options.push({
      id: `mutate:${id}:${turn}`,
      kind: 'mutate',
      title: lang === 'en' ? `Mutate: ${meta.en}` : `Mutera: ${meta.sv}`,
      description: lang === 'en' ? meta.blurbEn : meta.blurbSv,
      cost: meta.cost,
      skillId: id,
      affordable: points >= meta.cost,
    })
  }

  // Narrative / tactical options
  if (cureProgress >= 40 && !skills.includes('shadow_veil')) {
    options.push({
      id: `sabotage:research:${turn}`,
      kind: 'sabotage',
      title: lang === 'en' ? 'Sabotage their laboratories' : 'Sabotera laboratorierna',
      description:
        lang === 'en'
          ? 'Risk a strike on the cure project (−12–18 research).'
          : 'Slå till mot botemedelsprojektet (−12–18 forskning).',
      cost: 280,
      amount: 15,
      affordable: points >= 280,
    })
  }

  if (heartHp <= 55) {
    options.push({
      id: `fortify:heart:${turn}`,
      kind: 'fortify',
      title: lang === 'en' ? 'Fortify the Plague Heart' : 'Förstärk Smittans hjärta',
      description:
        lang === 'en'
          ? 'Spend corruption to mend the heart (+20 HP).'
          : 'Spendera korruption för att läka hjärtat (+20 HP).',
      cost: 250,
      amount: 20,
      affordable: points >= 250,
    })
  }

  if (skills.includes('drake_summon') || turn >= 3) {
    const cost = skills.includes('drake_summon') ? 200 : 550
    options.push({
      id: `distract:drake:${turn}`,
      kind: 'distract',
      title: lang === 'en' ? 'Unleash a distraction in the east' : 'Släpp lös en distraktion i öster',
      description:
        lang === 'en'
          ? 'A massive threat pulls The Good away — weaker AI response this turn.'
          : 'Ett massivt hot drar bort De Goda — svagare AI-svar detta drag.',
      cost,
      amount: 1,
      affordable: points >= cost,
    })
  }

  // Ensure at least 3 distinct choices; pad with cheap bloom if needed
  const uniqueKinds = new Map<string, VoteOption>()
  for (const o of options) {
    const key = o.kind === 'outbreak' ? o.id : `${o.kind}:${o.skillId ?? o.id}`
    if (!uniqueKinds.has(key)) uniqueKinds.set(key, o)
  }
  let picked = [...uniqueKinds.values()]

  // Prefer mix: up to 2 outbreaks + mutations/tactics, max 4 options
  const outbreaks = picked.filter((o) => o.kind === 'outbreak').slice(0, 2)
  const rest = picked.filter((o) => o.kind !== 'outbreak')
  picked = [...outbreaks, ...rest].slice(0, 4)

  if (picked.length < 2) {
    const fallbackCost = 150
    picked.push({
      id: `outbreak:eastern_wastes:fallback:${turn}`,
      kind: 'outbreak',
      title: lang === 'en' ? 'Bleed into the Wastes' : 'Sippa ut i Ödemarken',
      description:
        lang === 'en'
          ? `A cautious push (+12%) for ${fallbackCost} corruption.`
          : `En försiktig push (+12%) för ${fallbackCost} korruption.`,
      cost: fallbackCost,
      regionId: 'eastern_wastes',
      amount: 12,
      affordable: points >= fallbackCost,
    })
  }

  return picked.map((o) => ({ ...o, affordable: points >= o.cost }))
}

export type ApplyResult = {
  points: number
  skills: SkillId[]
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  logSv: string
  logEn: string
  distracted: boolean
}

export function applyPlayerChoice(
  option: VoteOption,
  state: {
    points: number
    skills: SkillId[]
    regions: MapRegion[]
    cureProgress: number
    heartHp: number
    lang: Lang
  },
): ApplyResult | { error: string } {
  if (state.points < option.cost) {
    return {
      error:
        state.lang === 'en'
          ? 'Not enough corruption points'
          : 'Inte tillräckligt med korruptionspoäng',
    }
  }

  let points = state.points - option.cost
  const skills = [...state.skills]
  const regions = state.regions.map((r) => ({ ...r }))
  let cureProgress = state.cureProgress
  let heartHp = state.heartHp
  let distracted = false
  let logSv = ''
  let logEn = ''

  switch (option.kind) {
    case 'outbreak': {
      const id = option.regionId!
      const region = regionById(regions, id)
      const amount = option.amount ?? 15
      region.corruption = clamp(region.corruption + amount, 0, 100)
      if (region.corruption >= 40) region.quarantined = false
      const name = labelRegion(id, 'sv')
      const nameEn = labelRegion(id, 'en')
      logSv = `Utbrottet slår till i ${name} (+${amount}%).`
      logEn = `The outbreak hits ${nameEn} (+${amount}%).`
      break
    }
    case 'mutate': {
      const id = option.skillId!
      if (!canUnlock(skills, id)) {
        return {
          error: state.lang === 'en' ? 'Cannot unlock that mutation' : 'Kan inte låsa upp mutationen',
        }
      }
      skills.push(id)
      logSv = `Mutationen ${labelSkill(id, 'sv')} vaknar.`
      logEn = `The mutation ${labelSkill(id, 'en')} awakens.`
      break
    }
    case 'sabotage': {
      const cut = option.amount ?? 15
      const actual = cut + Math.floor(Math.random() * 4)
      cureProgress = clamp(cureProgress - actual, 0, 100)
      if (skills.includes('necromancy')) {
        cureProgress = clamp(cureProgress - 4, 0, 100)
      }
      logSv = `Laboratorierna brinner. Botemedlet −${actual}.`
      logEn = `Laboratories burn. Cure −${actual}.`
      break
    }
    case 'fortify': {
      const heal = option.amount ?? 20
      heartHp = clamp(heartHp + heal, 0, 100)
      logSv = `Smittans hjärta pulserar starkare (+${heal} HP).`
      logEn = `The Plague Heart pulses stronger (+${heal} HP).`
      break
    }
    case 'distract': {
      distracted = true
      logSv = 'En skräckinjagande skugga reser sig i öster — De Goda vänder blicken.'
      logEn = 'A terrifying shadow rises in the east — The Good look away.'
      break
    }
  }

  return { points, skills, regions, cureProgress, heartHp, logSv, logEn, distracted }
}

export type AiResult = {
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
  logSv: string
  logEn: string
}

export function applyAiTurn(
  state: {
    regions: MapRegion[]
    cureProgress: number
    heartHp: number
    skills: SkillId[]
    distracted: boolean
    turn: number
  },
): AiResult {
  const regions = state.regions.map((r) => ({ ...r }))
  let cureProgress = state.cureProgress
  let heartHp = state.heartHp
  const skills = state.skills

  let researchGain = 7 + Math.floor(state.turn * 0.6) + Math.floor(Math.random() * 5)
  if (skills.includes('shadow_veil')) researchGain = Math.max(3, Math.floor(researchGain * 0.55))
  if (skills.includes('necromancy')) researchGain = Math.max(2, researchGain - 2)
  if (state.distracted) researchGain = Math.max(1, Math.floor(researchGain * 0.4))

  const playable = regions.filter((r) => r.id !== 'plague_heart')
  const worst = [...playable].sort((a, b) => b.corruption - a.corruption)[0]
  const heart = regionById(regions, 'plague_heart')

  // Choose AI focus
  const roll = Math.random()
  let logSv = ''
  let logEn = ''

  if (state.distracted) {
    cureProgress = clamp(cureProgress + researchGain, 0, 100)
    logSv = `De Goda jagar distraktionen. Forskningen kryper ändå fram (+${researchGain}).`
    logEn = `The Good chase the distraction. Research still creeps (+${researchGain}).`
    return { regions, cureProgress, heartHp, logSv, logEn }
  }

  if (heartHp <= 45 && roll < 0.45) {
    const dmg = 14 + Math.floor(Math.random() * 10)
    heartHp = clamp(heartHp - dmg, 0, 100)
    heart.corruption = clamp(heart.corruption - 8, 0, 100)
    logSv = `Paladiner anfaller Smittans hjärta (−${dmg} HP).`
    logEn = `Paladins assault the Plague Heart (−${dmg} HP).`
  } else if (worst && worst.corruption >= 35 && roll < 0.75) {
    const cleanse = 12 + Math.floor(Math.random() * 8)
    worst.corruption = clamp(worst.corruption - cleanse, 0, 100)
    worst.quarantined = true
    cureProgress = clamp(cureProgress + Math.floor(researchGain * 0.6), 0, 100)
    const name = labelRegion(worst.id, 'sv')
    const nameEn = labelRegion(worst.id, 'en')
    logSv = `De Goda sätter ${name} i karantän (−${cleanse}%) och forskar (+${Math.floor(researchGain * 0.6)}).`
    logEn = `The Good quarantine ${nameEn} (−${cleanse}%) and research (+${Math.floor(researchGain * 0.6)}).`
  } else {
    cureProgress = clamp(cureProgress + researchGain, 0, 100)
    // Light cleanse on a random sick region
    const sick = playable.filter((r) => r.corruption >= 20)
    if (sick.length) {
      const t = sick[Math.floor(Math.random() * sick.length)]
      t.corruption = clamp(t.corruption - 6, 0, 100)
    }
    logSv = `Alver och kungariken forcerar botemedlet (+${researchGain} forskning).`
    logEn = `Elves and kingdoms push the cure (+${researchGain} research).`
  }

  return { regions, cureProgress, heartHp, logSv, logEn }
}

export type Outcome = 'ongoing' | 'victory' | 'defeat_cure' | 'defeat_heart'

export function evaluateOutcome(state: {
  regions: MapRegion[]
  cureProgress: number
  heartHp: number
}): Outcome {
  if (state.heartHp <= LOSE_HEART_HP) return 'defeat_heart'
  if (state.cureProgress >= LOSE_CURE_PROGRESS) return 'defeat_cure'
  if (worldCorruption(state.regions) >= WIN_WORLD_CORRUPTION) return 'victory'
  const heartlands = state.regions.find((r) => r.id === 'heartlands')
  const ports = state.regions.find((r) => r.id === 'southern_ports')
  const elves = state.regions.find((r) => r.id === 'elf_woods')
  if (
    heartlands &&
    ports &&
    elves &&
    heartlands.corruption >= 85 &&
    ports.corruption >= 80 &&
    elves.corruption >= 80
  ) {
    return 'victory'
  }
  return 'ongoing'
}

export function tallyVotes(votes: Record<string, string>): string | null {
  const counts = new Map<string, number>()
  for (const optionId of Object.values(votes)) {
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = -1
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id
      bestCount = n
    }
  }
  return best
}

/** Host vote breaks ties when provided. */
export function pickWinningOption(
  votes: Record<string, string>,
  options: VoteOption[],
  hostVote?: string | null,
): VoteOption | null {
  if (options.length === 0) return null
  const counts = new Map<string, number>()
  for (const optionId of Object.values(votes)) {
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1)
  }
  let max = 0
  for (const n of counts.values()) max = Math.max(max, n)
  const tied = options.filter((o) => (counts.get(o.id) ?? 0) === max && max > 0)
  if (tied.length === 0) {
    // No votes — pick first affordable, else first
    return options.find((o) => o.affordable) ?? options[0] ?? null
  }
  if (tied.length === 1) return tied[0]
  if (hostVote) {
    const hostPick = tied.find((o) => o.id === hostVote)
    if (hostPick) return hostPick
  }
  return tied[0]
}
