import { useState } from 'react'
import { t } from './i18n'
import { isAudioPrimed, primeAudio } from './sfx'
import type { Lang } from './types'

export function SoundGate({ lang, active }: { lang: Lang; active: boolean }) {
  const ui = t(lang)
  const [hidden, setHidden] = useState(isAudioPrimed())

  if (!active || hidden || isAudioPrimed()) return null

  return (
    <div className="sound-gate flash-in">
      <p>{ui.soundGateHint}</p>
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          primeAudio()
          setHidden(true)
        }}
      >
        {ui.soundGateBtn}
      </button>
    </div>
  )
}
