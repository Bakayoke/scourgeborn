import type { Lang, PublicRoom } from './types'
import { t } from './i18n'

export async function shareFinaleCard(room: PublicRoom, lang: Lang): Promise<boolean> {
  const ui = t(lang)
  const victory = room.status === 'victory'
  const canvas = document.createElement('canvas')
  canvas.width = 720
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  ctx.fillStyle = victory ? '#0d2818' : '#2a0f0f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = victory ? '#6ee7a0' : '#f87171'
  ctx.font = 'bold 36px system-ui, sans-serif'
  ctx.fillText(victory ? ui.victoryTitle : ui.gameOver, 40, 60)

  ctx.fillStyle = '#e2e8f0'
  ctx.font = '22px system-ui, sans-serif'
  ctx.fillText(`${ui.score}: ${room.score} · ${ui.finaleWave}: ${room.wave}`, 40, 110)
  ctx.fillText(`${ui.misses}: ${room.misses}/${room.maxMisses}`, 40, 145)
  ctx.fillText(`${ui.finaleDuration}: ${room.gameDurationSec}s`, 40, 180)

  if (room.bestStreak > 0) {
    ctx.fillText(`${ui.bestStreak}: ×${room.bestStreak}`, 40, 215)
  }

  if (room.seriesEnabled) {
    ctx.fillText(`${ui.seriesLabel}: ${room.seriesWins}/${room.seriesTarget}`, 40, 250)
  }

  if (room.raceFinished) {
    const raceText =
      room.raceFinished === 'won'
        ? `${ui.raceWon} ${room.racePartner?.code ?? ''}`
        : `${ui.raceLost} ${room.racePartner?.code ?? ''}`
    ctx.fillText(raceText, 40, 285)
  }

  const sorted = [...room.players]
    .filter((p) => !p.spectator)
    .sort((a, b) => (b.cures ?? 0) - (a.cures ?? 0))
    .slice(0, 4)
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(ui.highlights, 40, 330)
  sorted.forEach((p, i) => {
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(`${p.name} — ${p.cures ?? 0} ${ui.cures}`, 40, 360 + i * 28)
  })

  ctx.fillStyle = '#64748b'
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillText(`scourgeborn.com · ${room.code}`, 40, 450)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return false

  const file = new File([blob], `scourgeborn-${room.code}.png`, { type: 'image/png' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: ui.brand })
    return true
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scourgeborn-${room.code}.png`
  a.click()
  URL.revokeObjectURL(url)
  return true
}
