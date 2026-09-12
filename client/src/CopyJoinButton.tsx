import { useState } from 'react'
import { t } from './i18n'
import type { Lang } from './types'

export function CopyJoinButton({ url, lang }: { url: string; lang: Lang }) {
  const ui = t(lang)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" className="btn ghost copy-link-btn" onClick={() => void copy()}>
      {copied ? ui.linkCopied : ui.copyLink}
    </button>
  )
}
