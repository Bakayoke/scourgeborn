import type { Lang } from '../types.js'
import { WORDS_EN } from './en.js'
import { WORDS_SV } from './sv.js'

export function wordPack(lang: Lang): string[] {
  return lang === 'en' ? WORDS_EN : WORDS_SV
}

export function freeWordPack(lang: Lang): string[] {
  return wordPack(lang).slice(0, 60)
}
