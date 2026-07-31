import { getClass, partyStats } from './classes.js'
import { getNode } from './emberwood.js'
import type {
  CampaignNode,
  Lang,
  LastResolve,
  Localized,
  Player,
  PlayerClass,
  Room,
  StoryChoice,
  VoteTally,
} from '../types.js'

export function loc(text: Localized, lang: Lang): string {
  return text[lang] || text.sv
}

export function combatChoiceIds(): StoryChoice[] {
  return [
    {
      id: 'atk',
      text: { sv: 'Attackera', en: 'Attack' },
      next: '__combat__',
    },
    {
      id: 'def',
      text: { sv: 'Försvara', en: 'Defend' },
      next: '__combat__',
    },
    {
      id: 'ability',
      text: { sv: 'Använd klassförmåga', en: 'Use class ability' },
      next: '__combat__',
    },
    {
      id: 'flee',
      text: { sv: 'Fly', en: 'Flee' },
      next: '__combat__',
    },
  ]
}

export function availableChoices(room: Room, node: CampaignNode): StoryChoice[] {
  if (node.combat) return combatChoiceIds()
  if (!node.choices) return []

  let list = node.choices.filter((c) => {
    if (c.requireFlag && !room.flags[c.requireFlag]) return false
    if (c.requireFlagAbsent && room.flags[c.requireFlagAbsent]) return false
    if (room.campaignMode === 'short') {
      const next = getNode(c.next)
      if (next?.partyOnly) return false
      if (c.next === 'tower_gate' || c.next === 'dragon_approach') return false
      if (c.id === 'continue_full' || c.id === 'push_dragon' || c.id === 'bluff_ok_full' || c.id === 'march') {
        return false
      }
    }
    return true
  })

  // Chaos mode: shuffle order so democracy feels wild
  if (room.adventureMode === 'chaos') {
    list = [...list].sort(() => Math.random() - 0.5)
  }

  return list
}

export function tallyVotes(votes: Record<string, string>): VoteTally {
  const tally: VoteTally = {}
  for (const choiceId of Object.values(votes)) {
    tally[choiceId] = (tally[choiceId] ?? 0) + 1
  }
  return tally
}

export function pickWinner(
  tally: VoteTally,
  choiceIds: string[],
  hostVote: string | null,
): string {
  let bestId = choiceIds[0] ?? ''
  let bestCount = -1
  for (const id of choiceIds) {
    const n = tally[id] ?? 0
    if (n > bestCount) {
      bestCount = n
      bestId = id
    } else if (n === bestCount && hostVote && id === hostVote) {
      bestId = id
    }
  }
  // Tie: prefer host vote if it is among tied max
  if (hostVote && choiceIds.includes(hostVote)) {
    const hostCount = tally[hostVote] ?? 0
    const max = Math.max(0, ...choiceIds.map((id) => tally[id] ?? 0))
    if (hostCount === max) return hostVote
  }
  return bestId
}

function applyEffects(room: Room, choice: StoryChoice) {
  const fx = choice.effects
  if (!fx) return
  if (typeof fx.hp === 'number') {
    room.partyHp = Math.max(0, Math.min(room.partyHpMax, room.partyHp + fx.hp))
  }
  if (fx.flags) {
    room.flags = { ...room.flags, ...fx.flags }
  }
  if (fx.partyMightBonus) {
    room.flags.partyMightBonus =
      Number(room.flags.partyMightBonus ?? 0) + fx.partyMightBonus
  }
  if (fx.partyArcanaBonus) {
    room.flags.partyArcanaBonus =
      Number(room.flags.partyArcanaBonus ?? 0) + fx.partyArcanaBonus
  }
  if (fx.partyCunningBonus) {
    room.flags.partyCunningBonus =
      Number(room.flags.partyCunningBonus ?? 0) + fx.partyCunningBonus
  }
}

function adventurerPlayers(room: Room): Player[] {
  return room.players.filter((p) => {
    if (p.spectator) return false
    if (p.id === room.hostId && !room.hostPlays) return false
    return true
  })
}

function effectiveStats(room: Room) {
  const base = partyStats(adventurerPlayers(room).map((p) => p.classId))
  return {
    might: base.might + Number(room.flags.partyMightBonus ?? 0),
    arcana: base.arcana + Number(room.flags.partyArcanaBonus ?? 0),
    cunning: base.cunning + Number(room.flags.partyCunningBonus ?? 0),
  }
}

function majorityClass(players: Player[]): PlayerClass | null {
  const counts: Partial<Record<PlayerClass, number>> = {}
  for (const p of players) {
    if (!p.classId) continue
    counts[p.classId] = (counts[p.classId] ?? 0) + 1
  }
  let best: PlayerClass | null = null
  let n = 0
  for (const [id, c] of Object.entries(counts) as [PlayerClass, number][]) {
    if (c > n) {
      n = c
      best = id
    }
  }
  return best
}

export type ResolveResult = {
  nextNodeId: string
  lastResolve: LastResolve
  finished: boolean
}

export function resolveVote(room: Room): ResolveResult | { error: string } {
  const node = getNode(room.nodeId)
  if (!node) return { error: 'Ogiltig scen' }

  const choices = availableChoices(room, node)
  const choiceIds = choices.map((c) => c.id)
  if (choiceIds.length === 0) return { error: 'Inga val' }

  const tally = tallyVotes(room.votes)
  const host = room.players.find((p) => p.id === room.hostId)
  // Host tie-break only if the host is playing (and voted)
  const hostVote =
    host && room.hostPlays ? room.votes[host.id] ?? null : null
  const winningId = pickWinner(tally, choiceIds, hostVote)
  const winning = choices.find((c) => c.id === winningId) ?? choices[0]

  if (node.combat && node.combat) {
    return resolveCombatRound(room, node, winningId, tally, winning.text)
  }

  applyEffects(room, winning)
  let nextId = winning.next

  // Free short gate: if somehow tower, clamp
  if (room.campaignMode === 'short') {
    const next = getNode(nextId)
    if (next?.partyOnly) nextId = 'ending_short'
  }

  const nextNode = getNode(nextId)
  return {
    nextNodeId: nextId,
    finished: Boolean(nextNode?.ending),
    lastResolve: {
      winningChoiceId: winningId,
      winningText: winning.text,
      tally,
      closeRace: isCloseRace(tally),
    },
  }
}

function isCloseRace(tally: VoteTally): boolean {
  const counts = Object.values(tally).sort((a, b) => b - a)
  if (counts.length < 2) return false
  return counts[0] > 0 && counts[0] === counts[1]
}

function resolveCombatRound(
  room: Room,
  node: CampaignNode,
  actionId: string,
  tally: VoteTally,
  winningText: Localized,
): ResolveResult {
  const combat = node.combat!
  if (room.combatEnemyHp === null) {
    room.combatEnemyHp = combat.enemy.hp
  }

  const stats = effectiveStats(room)
  const maj = majorityClass(adventurerPlayers(room))
  const majClass = getClass(maj)

  let dmgToEnemy = 0
  let dmgToParty = combat.enemy.attack
  let heal = 0
  let log: Localized = { sv: '', en: '' }

  if (actionId === 'flee') {
    return {
      nextNodeId: combat.fleeNext ?? 'ending_coward',
      finished: true,
      lastResolve: {
        winningChoiceId: actionId,
        winningText,
        tally,
        closeRace: isCloseRace(tally),
        combatLog: {
          sv: 'Gruppen flyr från striden!',
          en: 'The party flees the battle!',
        },
      },
    }
  }

  let heroBanner: Localized | undefined

  if (actionId === 'def') {
    dmgToParty = Math.max(1, Math.floor(combat.enemy.attack / 2) - Math.floor(stats.might / 4))
    dmgToEnemy = 2 + Math.floor(stats.might / 3)
    log = {
      sv: `Ni formar en försvarslinje. Fienden tar ${dmgToEnemy} skada, ni tar ${dmgToParty}.`,
      en: `You form a defensive line. Enemy takes ${dmgToEnemy}, you take ${dmgToParty}.`,
    }
  } else if (actionId === 'ability' && majClass) {
    if (majClass.id === 'cleric') {
      heal = 8 + stats.arcana
      dmgToEnemy = 3 + stats.arcana
      dmgToParty = Math.max(2, combat.enemy.attack - 2)
      log = {
        sv: `Klerkens ljus helar ${heal} HP och bränner fienden för ${dmgToEnemy}.`,
        en: `Cleric light heals ${heal} HP and burns the foe for ${dmgToEnemy}.`,
      }
      heroBanner = {
        sv: '✨ Klerken räddade er!',
        en: '✨ The Cleric saved you!',
      }
    } else if (majClass.id === 'mage') {
      dmgToEnemy = 10 + stats.arcana * 2
      dmgToParty = combat.enemy.attack
      log = {
        sv: `Eldklot! Fienden tar ${dmgToEnemy} magisk skada.`,
        en: `Firebolt! Enemy takes ${dmgToEnemy} magic damage.`,
      }
      heroBanner = {
        sv: '🔥 Magikerns eldklot!',
        en: "🔥 The Mage's firebolt!",
      }
    } else if (majClass.id === 'rogue') {
      dmgToEnemy = 8 + stats.cunning * 2
      dmgToParty = Math.max(2, combat.enemy.attack - 1)
      log = {
        sv: `Bakhåll! Kritisk träff på ${dmgToEnemy} skada.`,
        en: `Ambush! Critical hit for ${dmgToEnemy} damage.`,
      }
      heroBanner = {
        sv: '🗡️ Tjuvens bakhåll!',
        en: "🗡️ The Rogue's ambush!",
      }
    } else if (majClass.id === 'ranger') {
      dmgToEnemy = 7 + stats.might + stats.cunning
      dmgToParty = combat.enemy.attack - 1
      log = {
        sv: `Pilregn träffar för ${dmgToEnemy} skada.`,
        en: `Arrow storm hits for ${dmgToEnemy} damage.`,
      }
      heroBanner = {
        sv: '🏹 Rangerns pilregn!',
        en: "🏹 The Ranger's arrow storm!",
      }
    } else {
      dmgToEnemy = 6 + stats.might
      dmgToParty = Math.max(1, Math.floor(combat.enemy.attack / 2))
      log = {
        sv: `Sköldmur! Ni gör ${dmgToEnemy} skada och tar bara ${dmgToParty}.`,
        en: `Shield wall! You deal ${dmgToEnemy} and take only ${dmgToParty}.`,
      }
      heroBanner = {
        sv: '🛡️ Krigarens sköldmur!',
        en: "🛡️ The Warrior's shield wall!",
      }
    }
  } else {
    dmgToEnemy = 5 + stats.might + Math.floor(stats.arcana / 2) + Math.floor(stats.cunning / 2)
    if (room.flags.ambush) {
      dmgToEnemy += 4
      room.flags.ambush = false
    }
    dmgToParty = Math.max(2, combat.enemy.attack - Math.floor(stats.might / 3))
    log = {
      sv: `Gruppen anfaller för ${dmgToEnemy} skada och tar ${dmgToParty} tillbaka.`,
      en: `The party strikes for ${dmgToEnemy} and takes ${dmgToParty} back.`,
    }
  }

  room.combatEnemyHp = Math.max(0, (room.combatEnemyHp ?? combat.enemy.hp) - dmgToEnemy)
  room.partyHp = Math.max(0, Math.min(room.partyHpMax, room.partyHp - dmgToParty + heal))

  const lastResolve: LastResolve = {
    winningChoiceId: actionId,
    winningText,
    tally,
    combatLog: log,
    heroBanner,
    closeRace: isCloseRace(tally),
  }

  if (room.partyHp <= 0) {
    room.combatEnemyHp = null
    return {
      nextNodeId: combat.loseNext,
      finished: true,
      lastResolve,
    }
  }

  if ((room.combatEnemyHp ?? 0) <= 0) {
    room.combatEnemyHp = null
    // Ambush bonus already consumed
    const winNext = combat.winNext
    // Short mode: after orc win go to orc_camp then short path
    return {
      nextNodeId: winNext,
      finished: Boolean(getNode(winNext)?.ending),
      lastResolve,
    }
  }

  // Stay in combat — same node, new round
  return {
    nextNodeId: node.id,
    finished: false,
    lastResolve,
  }
}

export function enterNode(room: Room, nodeId: string) {
  const node = getNode(nodeId)
  if (!node) return
  room.nodeId = nodeId
  if (node.combat) {
    room.combatEnemyHp = node.combat.enemy.hp
  } else {
    room.combatEnemyHp = null
  }
  room.votes = {}
  const choices = availableChoices(room, node)
  room.activeChoiceIds = choices.map((c) => c.id)
}
