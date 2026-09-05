let ctx: AudioContext | null = null

function getCtx() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  try {
    const c = getCtx()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + dur)
  } catch {
    /* audio optional */
  }
}

export function sfxCure() {
  tone(523, 0.12)
  setTimeout(() => tone(659, 0.15), 80)
  setTimeout(() => tone(784, 0.2), 160)
}

export function sfxMiss() {
  tone(180, 0.35, 'sawtooth', 0.12)
  setTimeout(() => tone(120, 0.4, 'sawtooth', 0.1), 100)
}

export function sfxSpawn() {
  tone(880, 0.08, 'triangle', 0.1)
}

export function sfxSend() {
  tone(440, 0.06, 'triangle', 0.12)
  setTimeout(() => tone(550, 0.08, 'triangle', 0.1), 50)
}

export function sfxPing() {
  tone(660, 0.1, 'square', 0.08)
  setTimeout(() => tone(880, 0.12, 'square', 0.08), 90)
}

export function sfxWave() {
  tone(330, 0.15)
  setTimeout(() => tone(440, 0.15), 120)
  setTimeout(() => tone(554, 0.2), 240)
}
