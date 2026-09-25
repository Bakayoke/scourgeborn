let ctx: AudioContext | null = null
let audioPrimed = false

export function isAudioPrimed() {
  return audioPrimed
}

export function primeAudio() {
  audioPrimed = true
  try {
    const c = getCtx()
    void c.resume()
  } catch {
    /* optional */
  }
}

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

export function sfxStreak() {
  tone(784, 0.08)
  setTimeout(() => tone(988, 0.1), 70)
  setTimeout(() => tone(1175, 0.14), 140)
}

export function sfxPipeline() {
  tone(440, 0.1, 'triangle', 0.14)
  setTimeout(() => tone(554, 0.1, 'triangle', 0.14), 80)
  setTimeout(() => tone(659, 0.1, 'triangle', 0.14), 160)
  setTimeout(() => tone(880, 0.2, 'triangle', 0.16), 240)
}

let stressOsc: OscillatorNode | null = null
let stressGain: GainNode | null = null

export function updateStressAudio(level: number) {
  try {
    const c = getCtx()
    if (level <= 0) {
      if (stressGain) {
        stressGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3)
        stressOsc?.stop(c.currentTime + 0.35)
        stressOsc = null
        stressGain = null
      }
      return
    }
    if (!stressOsc) {
      stressOsc = c.createOscillator()
      stressGain = c.createGain()
      stressOsc.type = 'sine'
      stressOsc.frequency.value = 55 + level * 40
      stressGain.gain.value = 0.001
      stressOsc.connect(stressGain)
      stressGain.connect(c.destination)
      stressOsc.start()
    }
    stressOsc.frequency.setTargetAtTime(55 + level * 55, c.currentTime, 0.2)
    const vol = 0.02 + level * 0.05
    stressGain!.gain.setTargetAtTime(vol, c.currentTime, 0.2)
  } catch {
    /* audio optional */
  }
}
