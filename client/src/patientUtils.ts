import { t } from './i18n'
import type { ItemId, Lang, Patient } from './types'

export function patientDisplayItem(p: Patient): ItemId {
  if (p.kind === 'mutant' && p.mutantStage === 0 && p.decoyVaccine) return p.decoyVaccine
  return p.requiredVaccine
}

export function patientAcceptsItem(p: Patient, item: ItemId): boolean {
  if (p.kind === 'mutant' && p.mutantStage === 0 && p.decoyVaccine === item) return true
  if (p.requiredVaccine === item && (p.kind !== 'mutant' || p.mutantStage === 1)) return true
  return false
}

export function patientKindLabel(p: Patient, lang: Lang): string | null {
  const ui = t(lang)
  if (p.kind === 'twin') return ui.patientTwin
  if (p.kind === 'vip') return ui.patientVip
  if (p.kind === 'mutant') return p.mutantStage === 0 ? ui.mutantDecoy : ui.mutantReal
  return null
}

export function specialPatientTip(p: Patient, lang: Lang): string | null {
  const ui = t(lang)
  if (p.kind === 'twin') return ui.tipTwin
  if (p.kind === 'vip') return ui.tipVip
  if (p.kind === 'mutant') {
    return p.mutantStage === 0 ? ui.tipMutant : ui.tipMutantReady
  }
  return null
}
