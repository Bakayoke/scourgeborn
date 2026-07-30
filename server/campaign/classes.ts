import type { ClassDef, PlayerClass } from '../types.js'

export const CLASSES: ClassDef[] = [
  {
    id: 'warrior',
    name: { sv: 'Krigare', en: 'Warrior' },
    blurb: {
      sv: 'Stark i närstrid. Skyddar gruppen med sköld och svärd.',
      en: 'Strong in melee. Protects the party with shield and steel.',
    },
    might: 3,
    arcana: 0,
    cunning: 1,
    ability: { sv: 'Sköldmur — minska skada', en: 'Shield wall — reduce damage' },
  },
  {
    id: 'mage',
    name: { sv: 'Magiker', en: 'Mage' },
    blurb: {
      sv: 'Behärskar eld och runor. Farlig mot trollkarlar och drakar.',
      en: 'Masters fire and runes. Dangerous against wizards and dragons.',
    },
    might: 0,
    arcana: 3,
    cunning: 1,
    ability: { sv: 'Eldklot — kraftig magisk attack', en: 'Firebolt — strong magic attack' },
  },
  {
    id: 'ranger',
    name: { sv: 'Ranger', en: 'Ranger' },
    blurb: {
      sv: 'Spårar i skogen. Bra mot orcher och vilda bestar.',
      en: 'Tracks through the woods. Strong against orcs and beasts.',
    },
    might: 2,
    arcana: 0,
    cunning: 2,
    ability: { sv: 'Pilregn — träffsäker attack', en: 'Arrow storm — precise attack' },
  },
  {
    id: 'rogue',
    name: { sv: 'Tjuv', en: 'Rogue' },
    blurb: {
      sv: 'Smyger, låser upp och hittar hemliga vägar.',
      en: 'Sneaks, picks locks, and finds secret paths.',
    },
    might: 1,
    arcana: 0,
    cunning: 3,
    ability: { sv: 'Bakhåll — kritisk skada', en: 'Ambush — critical damage' },
  },
  {
    id: 'cleric',
    name: { sv: 'Klerk', en: 'Cleric' },
    blurb: {
      sv: 'Helar och välsignar. Håller gruppen vid liv.',
      en: 'Heals and blesses. Keeps the party alive.',
    },
    might: 1,
    arcana: 2,
    cunning: 1,
    ability: { sv: 'Helande ljus — återställ HP', en: 'Healing light — restore HP' },
  },
]

export function getClass(id: PlayerClass | null): ClassDef | null {
  if (!id) return null
  return CLASSES.find((c) => c.id === id) ?? null
}

export function partyStats(classIds: (PlayerClass | null)[]) {
  let might = 0
  let arcana = 0
  let cunning = 0
  for (const id of classIds) {
    const c = getClass(id)
    if (!c) continue
    might += c.might
    arcana += c.arcana
    cunning += c.cunning
  }
  return { might, arcana, cunning }
}
