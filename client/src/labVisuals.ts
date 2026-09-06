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

export type RecipeToken =
  | { t: 'badge'; item: ItemId }
  | { t: 'plus' }
  | { t: 'arrow' }
  | { t: 'mix' }
  | { t: 'heat' }
  | { t: 'cool' }

/** Visual recipe tokens for patient cards (parallel inputs use +, not sequential →). */
export function recipeTokens(item: ItemId): RecipeToken[] {
  switch (item) {
    case 'purple_rna':
      return [
        { t: 'badge', item: 'red_rna' },
        { t: 'plus' },
        { t: 'badge', item: 'blue_rna' },
        { t: 'arrow' },
        { t: 'mix' },
        { t: 'arrow' },
        { t: 'badge', item: 'purple_rna' },
      ]
    case 'heated_purple_rna':
      return [
        { t: 'badge', item: 'red_rna' },
        { t: 'plus' },
        { t: 'badge', item: 'blue_rna' },
        { t: 'arrow' },
        { t: 'mix' },
        { t: 'arrow' },
        { t: 'badge', item: 'purple_rna' },
        { t: 'arrow' },
        { t: 'heat' },
        { t: 'arrow' },
        { t: 'badge', item: 'heated_purple_rna' },
      ]
    case 'cooled_blue_rna':
      return [
        { t: 'badge', item: 'blue_rna' },
        { t: 'arrow' },
        { t: 'cool' },
        { t: 'arrow' },
        { t: 'badge', item: 'cooled_blue_rna' },
      ]
    default:
      return [{ t: 'badge', item }]
  }
}

/** @deprecated Use recipeTokens for patient-card display. */
export function recipeSteps(item: ItemId): ItemId[] {
  return recipeTokens(item)
    .filter((t): t is { t: 'badge'; item: ItemId } => t.t === 'badge')
    .map((t) => t.item)
}

export function itemShort(id: ItemId, lang: Lang) {
  const v = ITEM_VISUALS[id]
  return lang === 'en' ? v.shortEn : v.shortSv
}

export function stationShort(station: Station, lang: Lang) {
  const v = STATION_VISUALS[station]
  return lang === 'en' ? v.shortEn : v.shortSv
}
