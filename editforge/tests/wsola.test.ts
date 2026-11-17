import { describe, expect, it } from 'vitest'
import { timeStretch } from '@/core/audio/wsola'

const SR = 44100
const sine = (f: number, secs: number, amp = 0.5) => {
  const a = new Float32Array(Math.round(SR * secs))
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * f * i) / SR)
  return a
}
/** Frecuencia por cruces por cero ascendentes (ignorando los bordes). */
const freq = (a: Float32Array) => {
  const from = Math.floor(a.length * 0.1)
  const to = Math.floor(a.length * 0.9)
  let n = 0
  let first = -1
  let last = -1
  for (let i = from + 1; i < to; i++) {
    if (a[i - 1] < 0 && a[i] >= 0) {
      if (first < 0) first = i
      last = i
      n++
    }
  }
  return ((n - 1) * SR) / (last - first)
}
const rms = (a: Float32Array) => {
  let s = 0
  const from = Math.floor(a.length * 0.1)
  const to = Math.floor(a.length * 0.9)
  for (let i = from; i < to; i++) s += a[i] * a[i]
  return Math.sqrt(s / (to - from))
}

describe('WSOLA time-stretch', () => {
  it('a 2× dura la mitad y mantiene los 440 Hz', () => {
    const [out] = timeStretch([sine(440, 2)], SR, 2)
    expect(out.length).toBe(SR)
    expect(freq(out)).toBeGreaterThan(440 * 0.99)
    expect(freq(out)).toBeLessThan(440 * 1.01)
    expect(rms(out)).toBeCloseTo(0.5 / Math.SQRT2, 1)
  })

  it('a 0.5× dura el doble y mantiene el tono', () => {
    const [out] = timeStretch([sine(440, 1)], SR, 0.5)
    expect(out.length).toBe(SR * 2)
    expect(Math.abs(freq(out) - 440)).toBeLessThan(440 * 0.01)
    expect(rms(out)).toBeCloseTo(0.5 / Math.SQRT2, 1)
  })

  it('sin discontinuidades fuertes (la ventana encaja en fase)', () => {
    const [out] = timeStretch([sine(220, 1.5)], SR, 1.37)
    let maxJump = 0
    for (let i = Math.floor(out.length * 0.05); i < out.length * 0.95; i++) maxJump = Math.max(maxJump, Math.abs(out[i] - out[i - 1]))
    // Un seno de 220 Hz con amplitud 0.5 cambia como mucho 2π·220·0.5/44100 ≈ 0.016 por muestra.
    expect(maxJump).toBeLessThan(0.03)
  })

  it('estéreo: ambos canales con la misma longitud y rate 1 es identidad', () => {
    const l = sine(300, 0.5)
    const r = sine(500, 0.5)
    const out = timeStretch([l, r], SR, 1.5)
    expect(out).toHaveLength(2)
    expect(out[0].length).toBe(out[1].length)
    expect(Math.abs(freq(out[1]) - 500)).toBeLessThan(5)
    const same = timeStretch([l], SR, 1)[0]
    expect(same).toEqual(l)
  })
})
