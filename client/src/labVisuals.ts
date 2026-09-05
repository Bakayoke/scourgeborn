import type { ItemId, Lang, Station } from './types'

export type ItemVisual = {
  color: string
  glow: string
  icon: string
  shortSv: string
  shortEn: string
}

export const ITEM_VISUALS: Record<ItemId, ItemVisual> = {
  red_rna: { color: '#ff2d55', glow: '#ff2d5588', icon: '●', shortSv: 'RÖD', shortEn: 'RED' },
  blue_rna: { color: '#00d4ff', glow: '#00d4ff88', icon: '●', shortSv: 'BLÅ', shortEn: 'BLUE' },
  green_rna: { color: '#39ff14', glow: '#39ff1488', icon: '●', shortSv: 'GRÖN', shortEn: 'GREEN' },
  yellow_rna: { color: '#ffe600', glow: '#ffe60088', icon: '●', shortSv: 'GUL', shortEn: 'YELLOW' },
  purple_rna: { color: '#bf5fff', glow: '#bf5fff88', icon: '●', shortSv: 'LILA', shortEn: 'PURPLE' },
  heated_purple_rna: { color: '#ff4500', glow: '#ff450088', icon: '🔥', shortSv: 'VARM LILA', shortEn: 'HOT PURPLE' },
  cooled_blue_rna: { color: '#00bfff', glow: '#00bfff88', icon: '❄', shortSv: 'KYLD BLÅ', shortEn: 'COLD BLUE' },
}

export const STATION_VISUALS: Record<
  Station,
  { color: string; glow: string; icon: string; shortSv: string; shortEn: string }
> = {
  extractor: { color: '#ff2d55', glow: '#ff2d5544', icon: '🧪', shortSv: 'EXTRAKTOR', shortEn: 'EXTRACTOR' },
  synthesizer: { color: '#bf5fff', glow: '#bf5fff44', icon: '⚗', shortSv: 'SYNTHESIZER', shortEn: 'SYNTHESIZER' },
  incubator: { color: '#ff4500', glow: '#ff450044', icon: '🌡', shortSv: 'INKUBATOR', shortEn: 'INCUBATOR' },
}

export const EXTRACT_OPTIONS: ItemId[] = ['red_rna', 'blue_rna', 'green_rna', 'yellow_rna']

/** Recipe steps to craft the final item (for patient cards). */
export function recipeSteps(item: ItemId): ItemId[] {
  switch (item) {
    case 'red_rna':
      return ['red_rna']
    case 'blue_rna':
      return ['blue_rna']
    case 'green_rna':
      return ['green_rna']
    case 'yellow_rna':
      return ['yellow_rna']
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
  if (item === 'red_rna' || item === 'blue_rna' || item === 'green_rna' || item === 'yellow_rna') {
    return 'extractor'
  }
  if (item === 'purple_rna') return 'synthesizer'
  if (item === 'heated_purple_rna' || item === 'cooled_blue_rna') return 'incubator'
  return null
}
