/** Draw a shareable ending card and return a PNG blob. */
export async function renderEndingCard(opts: {
  title: string
  ending: string
  players: string[]
  code: string
  modeLabel: string
}): Promise<Blob | null> {
  const w = 1080
  const h = 1350
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#0c1410')
  grad.addColorStop(0.45, '#1a2e20')
  grad.addColorStop(1, '#3d2210')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = 'rgba(224,122,58,0.18)'
  ctx.beginPath()
  ctx.arc(900, 180, 260, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(106,155,114,0.15)'
  ctx.beginPath()
  ctx.arc(120, 1100, 280, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f0a060'
  ctx.font = '700 78px Georgia, "Cormorant Garamond", serif'
  ctx.fillText('Party Paths', 72, 140)

  ctx.fillStyle = 'rgba(232,239,230,0.7)'
  ctx.font = '600 34px "Source Sans 3", sans-serif'
  ctx.fillText(opts.modeLabel.slice(0, 40), 72, 210)

  ctx.fillStyle = '#e8efe6'
  ctx.font = '700 56px Georgia, serif'
  wrapText(ctx, opts.title.slice(0, 60), 72, 320, w - 144, 64)

  ctx.fillStyle = '#ffe0b8'
  ctx.font = '600 36px "Source Sans 3", sans-serif'
  wrapText(ctx, opts.ending.slice(0, 160), 72, 480, w - 144, 48)

  let y = 720
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  roundRect(ctx, 72, y - 60, w - 144, 60 + opts.players.slice(0, 6).length * 70, 16)
  ctx.fill()

  ctx.fillStyle = '#8fc896'
  ctx.font = '700 28px "Source Sans 3", sans-serif'
  ctx.fillText('Party', 100, y)
  y += 50
  for (const name of opts.players.slice(0, 6)) {
    ctx.fillStyle = '#e8efe6'
    ctx.font = '600 34px "Source Sans 3", sans-serif'
    ctx.fillText(name.slice(0, 24), 100, y)
    y += 70
  }

  ctx.fillStyle = 'rgba(232,239,230,0.75)'
  ctx.font = '600 30px "Source Sans 3", sans-serif'
  ctx.fillText(`Kod ${opts.code}`, 72, h - 120)

  ctx.fillStyle = '#e07a3a'
  ctx.font = '700 36px Georgia, serif'
  ctx.fillText('partypaths.com', 72, h - 70)

  return await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png')
  })
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ')
  let line = ''
  let cy = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy)
      line = word
      cy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, cy)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
