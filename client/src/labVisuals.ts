import type { ItemId, Lang, Station } from './types'

export type ItemVisual = {
  color: string
  icon: string
  shortSv: string
  shortEn: string
}

export const ITEM_VISUALS: Record<ItemId, ItemVisual> = {
  red_rna: { color: '#e0456a', icon: '●', shortSv: 'RÖD', shortEn: 'RED' },
  blue_rna: { color: '#4fd1c5', icon: '●', shortSv: 'BLÅ', shortEn: 'BLUE' },
  purple_rna: { color: '#9d7cff', icon: '●', shortSv: 'LILA', shortEn: 'PURPLE' },
  heated_purple_rna: { color: '#ff6b35', icon: '🔥', shortSv: 'VARM LILA', shortEn: 'HOT PURPLE' },
  cooled_blue_rna: { color: '#6ecff6', icon: '❄', shortSv: 'KYLD BLÅ', shortEn: 'COLD BLUE' },
}

export const STATION_VISUALS: Record<
  Station,
  { color: string; icon: string; shortSv: string; shortEn: string }
> = {
  extractor: { color: '#e0456a', icon: '🧪', shortSv: 'EXTRAKTOR', shortEn: 'EXTRACTOR' },
  synthesizer: { color: '#9d7cff', icon: '⚗', shortSv: 'SYNTHESIZER', shortEn: 'SYNTHESIZER' },
  incubator: { color: '#ff6b35', icon: '🌡', shortSv: 'INKUBATOR', shortEn: 'INCUBATOR' },
}

/** Recipe steps to craft the final item (for patient cards). */
export function recipeSteps(item: ItemId): ItemId[] {
  switch (item) {
    case 'red_rna':
      return ['red_rna']
    case 'blue_rna':
      return ['blue_rna']
    case 'purple_rna':
      return ['red_rna', 'blue_rna', 'purple_rna']
    case 'heated_purple_rna':
      return ['red_rna', 'blue_rna', 'purple_rna', 'heated_purple_rna']
    case 'cooled_blue_rna':
      return ['blue_rna', 'cooled_blue_rna']
    default:
      return [item]
  }
}

export function itemShort(id: ItemId, lang: Lang) {
  const v = ITEM_VISUALS[id]
  return lang === 'en' ? v.shortEn : v.shortSv
}

export function stationShort(station: Station, lang: Lang) {
  const v = STATION_VISUALS[station]
  return lang === 'en' ? v.shortEn : v.shortSv
}

export function stationForItem(item: ItemId): Station | null {
  if (item === 'red_rna' || item === 'blue_rna') return 'extractor'
  if (item === 'purple_rna') return 'synthesizer'
  if (item === 'heated_purple_rna' || item === 'cooled_blue_rna') return 'incubator'
  return null
}
