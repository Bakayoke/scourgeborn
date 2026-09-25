import type { CSSProperties } from 'react'
import { t } from './i18n'
import { ITEM_VISUALS, itemShort } from './labVisuals'
import { RecipeStrip } from './RecipeStrip'
import { patientDisplayItem, patientKindLabel, specialPatientTip } from './patientUtils'
import type { ItemId, Lang, Patient, PublicRoom } from './types'

function ItemBadge({ item, lang, size = 'md' }: { item: ItemId; lang: Lang; size?: 'sm' | 'md' | 'lg' }) {
  const v = ITEM_VISUALS[item]
  return (
    <span
      className={`item-badge ${size}`}
      style={{ '--item-color': v.color, '--item-glow': v.glow } as CSSProperties}
    >
      <span className="item-icon">{v.icon}</span>
      <span className="item-short">{itemShort(item, lang)}</span>
    </span>
  )
}

export function PatientCardBody({ p, lang }: { p: Patient; lang: Lang }) {
  const ui = t(lang)
  const displayItem = patientDisplayItem(p)
  const kind = patientKindLabel(p, lang)
  const tip = specialPatientTip(p, lang)
  return (
    <>
      {kind && <span className="patient-kind-badge">{kind}</span>}
      <ItemBadge item={displayItem} lang={lang} size="lg" />
      <span className="patient-needs-label">{ui.patientNeeds}</span>
      <RecipeStrip item={displayItem} lang={lang} />
      {tip && <p className="patient-special-tip">{tip}</p>}
      {p.kind === 'mutant' && p.mutantStage === 0 && (
        <div className="mutant-next">
          <span className="mutant-next-label">{ui.mutantThenNeeds}</span>
          <RecipeStrip item={p.requiredVaccine} lang={lang} />
        </div>
      )}
    </>
  )
}

export function SpecialPatientBanner({ patients, lang }: { patients: PublicRoom['patients']; lang: Lang }) {
  const special = patients.find((p) => p.kind && p.kind !== 'normal')
  if (!special) return null
  const tip = specialPatientTip(special, lang)
  if (!tip) return null
  return <p className="special-patient-banner flash-in">{tip}</p>
}
