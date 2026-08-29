import type {
  CleansingVoteState,
  GameOutcome,
  KeeperRole,
  Lang,
  RitualTask,
  Room,
  TaskKind,
  ToolId,
} from '../types.js'

export const MATRIX_MAX_HEALTH = 100
export const CYCLES_TO_WIN = 5
export const AFFLICTION_DELAY_MS = 120_000
export const TASK_WAVE_MS = 28_000
export const CYCLE_BREAK_MS = 6_000
export const CLEANSING_MS = 25_000
export const AFFLICTION_MODAL_MS = 12_000
export const MIN_MULTI_PLAYERS = 2
export const TASK_FAIL_PENALTY = 18
export const TASK_SUCCESS_HEAL = 4
export const WRONG_SEAL_PENALTY = 35
export const SCOURGE_SEAL_HEAL = 15

const GLYPHS = ['void', 'arc', 'blood', 'star', 'ash'] as const

export function activePlayerIds(room: Room): string[] {
  return room.players.filter((p) => !p.spectator).map((p) => p.id)
}

export function connectedActiveIds(room: Room): string[] {
  return room.players.filter((p) => !p.spectator && p.connected).map((p) => p.id)
}

export function scourgebornCount(n: number): number {
  if (n <= 4) return 1
  if (n <= 7) return 2
  return 3
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function pickGlyphs(len: number): string[] {
  return shuffle([...GLYPHS]).slice(0, len)
}

function taskTitle(kind: TaskKind, lang: Lang): { sv: string; en: string } {
  switch (kind) {
    case 'crystal':
      return {
        sv: 'Justera Void-kristallen till 75%',
        en: 'Align Void Crystal to 75%',
      }
    case 'glyphs':
      return {
        sv: 'Sekvensera arkaniska glyfer',
        en: 'Sequence Arcane Glyphs',
      }
    case 'essence':
      return {
        sv: 'Stabilisera essensflödet (40–60%)',
        en: 'Stabilize Essence Drain (40–60%)',
      }
  }
}

export function distributeTools(playerIds: string[], solo: boolean): Record<string, ToolId[]> {
  const tools: ToolId[] = ['crystal_slider', 'glyph_board', 'essence_valve']
  const map: Record<string, ToolId[]> = {}
  if (solo) {
    map[playerIds[0]!] = [...tools]
    return map
  }
  for (const id of playerIds) map[id] = []
  playerIds.forEach((id, i) => {
    map[id]!.push(tools[i % tools.length]!)
  })
  return map
}

function playersForTaskKind(room: Room, kind: TaskKind): string[] {
  const ids = activePlayerIds(room)
  const toolByKind: Record<TaskKind, ToolId> = {
    crystal: 'crystal_slider',
    glyphs: 'glyph_board',
    essence: 'essence_valve',
  }
  const needed = toolByKind[kind]
  const matched = ids.filter((id) => room.playerTools[id]?.includes(needed))
  return matched.length > 0 ? matched : ids
}

export function spawnTaskWave(room: Room): RitualTask[] {
  const ids = activePlayerIds(room)
  const kinds: TaskKind[] = room.mode === 'solo' ? ['crystal', 'glyphs', 'essence'] : shuffle(['crystal', 'glyphs', 'essence']).slice(0, 2)
  const now = Date.now()
  const deadline = now + TASK_WAVE_MS

  return kinds.map((kind, idx) => {
    const title = taskTitle(kind, room.language)
    const assigned = playersForTaskKind(room, kind)
    return {
      id: `${room.cycle}-${kind}-${now}-${idx}`,
      kind,
      titleSv: title.sv,
      titleEn: title.en,
      deadlineAt: deadline,
      targetCrystal: 50,
      glyphSequence: pickGlyphs(4),
      glyphProgress: 0,
      essenceMin: 40,
      essenceMax: 60,
      essenceValue: 50,
      assignedPlayerIds: assigned.length ? assigned : ids,
      completed: false,
      failed: false,
    }
  })
}

export function assignAffliction(room: Room) {
  const ids = activePlayerIds(room)
  for (const id of ids) room.roles[id] = 'keeper'
  const traitors = scourgebornCount(ids.length)
  for (const id of shuffle(ids).slice(0, traitors)) {
    room.roles[id] = 'scourgeborn'
    room.playerTools[id] = [...(room.playerTools[id] ?? []), 'miasma_cloud', 'sabotage_pulse']
  }
  room.afflictionTriggered = true
  room.status = 'affliction'
  room.phaseEndsAt = Date.now() + AFFLICTION_MODAL_MS
}

export function initGameState(room: Room, playerIds: string[]) {
  const solo = playerIds.length === 1
  room.mode = solo ? 'solo' : 'multi'
  room.status = 'ritual'
  room.matrixHealth = MATRIX_MAX_HEALTH
  room.cycle = 1
  room.maxCycles = CYCLES_TO_WIN
  room.gameStartedAt = Date.now()
  room.afflictionAt = solo ? 0 : room.gameStartedAt + AFFLICTION_DELAY_MS
  room.afflictionTriggered = false
  room.roles = Object.fromEntries(playerIds.map((id) => [id, 'keeper' as KeeperRole]))
  room.afflictionSeen = {}
  room.playerTools = distributeTools(playerIds, solo)
  room.tasks = spawnTaskWave(room)
  room.scourgeMeter = 0
  room.miasmaUntil = 0
  room.cleansing = null
  room.soloSurvivalMs = 0
  room.outcome = 'ongoing'
  room.phaseEndsAt = room.tasks[0]?.deadlineAt ?? Date.now() + TASK_WAVE_MS
  room.lastEventSv = solo ? 'Solo-ritual startad — överlev så länge du kan.' : 'Ritualmatrisen vaknar.'
  room.lastEventEn = solo ? 'Solo ritual begun — survive as long as you can.' : 'The ritual matrix awakens.'
}

function taskComplete(task: RitualTask): boolean {
  if (task.failed) return false
  if (task.kind === 'crystal') {
    return Math.abs(task.targetCrystal - 75) <= 3
  }
  if (task.kind === 'glyphs') {
    return task.glyphProgress >= task.glyphSequence.length
  }
  return task.essenceValue >= task.essenceMin && task.essenceValue <= task.essenceMax
}

export function evaluateTasks(room: Room): { completed: number; failed: number } {
  let completed = 0
  let failed = 0
  const now = Date.now()
  for (const task of room.tasks) {
    if (task.completed || task.failed) continue
    if (taskComplete(task)) {
      task.completed = true
      completed++
    } else if (now >= task.deadlineAt) {
      task.failed = true
      failed++
    }
  }
  return { completed, failed }
}

export function applyWaveResult(room: Room, failed: number, completed: number) {
  if (failed > 0) {
    room.matrixHealth = Math.max(0, room.matrixHealth - TASK_FAIL_PENALTY * failed)
    room.scourgeMeter = Math.min(100, room.scourgeMeter + 12 * failed)
    room.lastEventSv = `Ritualfel! Matrisen skadas (−${TASK_FAIL_PENALTY * failed} HP).`
    room.lastEventEn = `Ritual failure! Matrix damaged (−${TASK_FAIL_PENALTY * failed} HP).`
  } else if (completed > 0) {
    room.matrixHealth = Math.min(MATRIX_MAX_HEALTH, room.matrixHealth + TASK_SUCCESS_HEAL)
    room.lastEventSv = 'Uppgifterna stabiliserade sig — lite lättnad.'
    room.lastEventEn = 'Tasks stabilized — brief relief.'
  }
}

export function checkOutcome(room: Room): GameOutcome {
  if (room.matrixHealth <= 0) return 'scourgeborn_win'
  if (room.mode === 'solo') return 'ongoing'
  if (room.cycle > room.maxCycles) return 'keepers_win'
  return 'ongoing'
}

export function advanceCycle(room: Room) {
  room.cycle += 1
  room.status = 'cycle_end'
  room.phaseEndsAt = Date.now() + CYCLE_BREAK_MS
  room.lastEventSv = `Cykel ${room.cycle - 1} klar. Andas ut — nästa våg kommer.`
  room.lastEventEn = `Cycle ${room.cycle - 1} complete. Breathe — next wave incoming.`
}

export function startNextWave(room: Room) {
  room.status = 'ritual'
  room.tasks = spawnTaskWave(room)
  room.phaseEndsAt = room.tasks[0]?.deadlineAt ?? Date.now() + TASK_WAVE_MS
}

export function applyToolAction(
  room: Room,
  playerId: string,
  tool: ToolId,
  payload: Record<string, unknown>,
): { error?: string } {
  const tools = room.playerTools[playerId] ?? []
  if (!tools.includes(tool)) {
    return { error: 'Du har inte detta verktyg / You do not have this tool' }
  }

  if (tool === 'crystal_slider') {
    const value = Number(payload.value)
    if (!Number.isFinite(value)) return { error: 'Ogiltigt värde' }
    for (const task of room.tasks) {
      if (task.kind === 'crystal' && task.assignedPlayerIds.includes(playerId)) {
        task.targetCrystal = Math.max(0, Math.min(100, Math.round(value)))
      }
    }
    return {}
  }

  if (tool === 'glyph_board') {
    const symbol = String(payload.symbol ?? '')
    for (const task of room.tasks) {
      if (task.kind !== 'glyphs' || !task.assignedPlayerIds.includes(playerId)) continue
      const expected = task.glyphSequence[task.glyphProgress]
      if (symbol === expected) task.glyphProgress++
      else task.glyphProgress = 0
    }
    return {}
  }

  if (tool === 'essence_valve') {
    const value = Number(payload.value)
    if (!Number.isFinite(value)) return { error: 'Ogiltigt värde' }
    for (const task of room.tasks) {
      if (task.kind === 'essence' && task.assignedPlayerIds.includes(playerId)) {
        task.essenceValue = Math.max(0, Math.min(100, Math.round(value)))
      }
    }
    return {}
  }

  if (tool === 'miasma_cloud') {
    if (room.roles[playerId] !== 'scourgeborn') {
      return { error: 'Endast Scourgeborn / Scourgeborn only' }
    }
    room.miasmaUntil = Date.now() + 8_000
    room.scourgeMeter = Math.min(100, room.scourgeMeter + 5)
    return {}
  }

  if (tool === 'sabotage_pulse') {
    if (room.roles[playerId] !== 'scourgeborn') {
      return { error: 'Endast Scourgeborn / Scourgeborn only' }
    }
    room.matrixHealth = Math.max(0, room.matrixHealth - 6)
    room.scourgeMeter = Math.min(100, room.scourgeMeter + 8)
    for (const task of room.tasks) {
      if (!task.completed && !task.failed && Math.random() < 0.35) {
        if (task.kind === 'essence') task.essenceValue += Math.random() < 0.5 ? 8 : -8
        if (task.kind === 'crystal') task.targetCrystal += Math.random() < 0.5 ? 5 : -5
      }
    }
    return {}
  }

  return { error: 'Okänt verktyg' }
}

export function startCleansingVote(room: Room, initiatorId: string): { error?: string } {
  if (room.mode === 'solo') return { error: 'Solo har ingen röstning' }
  if (room.status === 'cleansing') return { error: 'Röstning pågår redan' }
  room.status = 'cleansing'
  room.cleansing = {
    initiatedBy: initiatorId,
    votes: {},
    deadlineAt: Date.now() + CLEANSING_MS,
    resolved: false,
    result: null,
    sealedId: null,
  }
  room.phaseEndsAt = room.cleansing.deadlineAt
  room.lastEventSv = 'Nödröstning! Vem är kärl för smittan?'
  room.lastEventEn = 'Emergency rite! Who is the vessel?'
  return {}
}

export function castCleansingVote(
  room: Room,
  voterId: string,
  targetId: string,
): { error?: string } {
  const vote = room.cleansing
  if (!vote || vote.resolved) return { error: 'Ingen aktiv röstning' }
  if (room.status !== 'cleansing') return { error: 'Inte röstningsfas' }
  vote.votes[voterId] = targetId
  return {}
}

export function resolveCleansingVote(room: Room) {
  const vote = room.cleansing
  if (!vote || vote.resolved) return

  const voters = activePlayerIds(room)
  const tally = new Map<string, number>()
  for (const [voter, target] of Object.entries(vote.votes)) {
    if (target === 'skip') continue
    tally.set(target, (tally.get(target) ?? 0) + 1)
  }

  let topId: string | null = null
  let topCount = 0
  for (const [id, count] of tally) {
    if (count > topCount) {
      topId = id
      topCount = count
    }
  }

  const needed = Math.floor(voters.length / 2) + 1
  vote.resolved = true

  if (!topId || topCount < needed) {
    vote.result = 'no_majority'
    room.lastEventSv = 'Ingen majoritet — röstningen avbryts.'
    room.lastEventEn = 'No majority — vote cancelled.'
    room.status = 'ritual'
    room.cleansing = null
    room.phaseEndsAt = room.tasks[0]?.deadlineAt ?? Date.now() + TASK_WAVE_MS
    return
  }

  vote.sealedId = topId
  const role = room.roles[topId] ?? 'keeper'
  if (role === 'scourgeborn') {
    vote.result = 'sealed_scourge'
    room.scourgeMeter = Math.max(0, room.scourgeMeter - SCOURGE_SEAL_HEAL)
    room.roles[topId] = 'keeper'
    room.lastEventSv = `${room.players.find((p) => p.id === topId)?.name ?? '?'} var Scourgeborn — smittan dämpas.`
    room.lastEventEn = `${room.players.find((p) => p.id === topId)?.name ?? '?'} was Scourgeborn — plague dampened.`
  } else {
    vote.result = 'sealed_innocent'
    room.matrixHealth = Math.max(0, room.matrixHealth - WRONG_SEAL_PENALTY)
    room.scourgeMeter = Math.min(100, room.scourgeMeter + 20)
    room.lastEventSv = 'Oskuldig förseglad — katastrofal reaktion i matrisen!'
    room.lastEventEn = 'Innocent sealed — catastrophic matrix reaction!'
  }

  room.status = 'ritual'
  room.cleansing = null
  room.phaseEndsAt = room.tasks[0]?.deadlineAt ?? Date.now() + TASK_WAVE_MS
}

export function allAfflictionSeen(room: Room): boolean {
  return activePlayerIds(room).every((id) => room.afflictionSeen[id])
}

export function msg(lang: Lang, sv: string, en: string) {
  return lang === 'en' ? en : sv
}

export function publicGlyphHint(task: RitualTask, lang: Lang = 'sv'): string {
  if (task.glyphProgress >= task.glyphSequence.length) {
    return lang === 'en' ? 'Done!' : 'Klart!'
  }
  const remaining = task.glyphSequence.slice(task.glyphProgress)
  const labels: Record<string, { sv: string; en: string }> = {
    void: { sv: 'Tomhet', en: 'Void' },
    arc: { sv: 'Båge', en: 'Arc' },
    blood: { sv: 'Blod', en: 'Blood' },
    star: { sv: 'Stjärna', en: 'Star' },
    ash: { sv: 'Ask', en: 'Ash' },
  }
  return remaining
    .map((g) => (lang === 'en' ? labels[g]?.en : labels[g]?.sv) ?? g)
    .join(' → ')
}
