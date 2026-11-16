/**
 * Detección de golpes (onsets), tempo y beats. TS puro (se ejecuta en un Web Worker).
 *  1. Envolvente de onsets: flujo espectral (FFT 1024, salto 512) por bandas
 *     logarítmicas (cada banda pesa lo mismo, con algo más de peso en los
 *     graves: así un bombo cuenta tanto como un golpe de ruido de banda ancha),
 *     en escala logarítmica y solo con los aumentos de energía.
 *  2. Onsets: picos del envolvente sobre un umbral adaptativo (mediana local).
 *  3. Tempo: autocorrelación del envolvente entre 60 y 200 BPM, con una
 *     preferencia suave por ~120 BPM para evitar errores de octava.
 *  4. Beats: programación dinámica (Ellis 2007): maximiza la energía de
 *     onset en los beats penalizando que el intervalo se aleje del periodo.
 */
import { FFT } from './fft'

export interface BeatAnalysis {
  bpm: number
  /** Tiempos de beat (s, en el medio). */
  beats: number[]
  /** Golpes/transitorios fuertes (s). */
  onsets: number[]
}

const N = 1024
const HOP = 512

/** Diezma a ~22 kHz promediando (suficiente para ritmo y el doble de rápido). */
function decimate(samples: Float32Array, sampleRate: number): { x: Float32Array; sr: number } {
  const k = Math.max(1, Math.floor(sampleRate / 22050))
  if (k === 1) return { x: samples, sr: sampleRate }
  const n = Math.floor(samples.length / k)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let j = 0; j < k; j++) s += samples[i * k + j]
    x[i] = s / k
  }
  return { x, sr: sampleRate / k }
}

export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float32Array; frameRate: number } {
  const { x, sr } = decimate(samples, sampleRate)
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1)
  const env = new Float32Array(frames)
  const fft = new FFT(N)
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
  // Bandas logarítmicas entre 30 Hz y ~11 kHz.
  const bins = N / 2
  const binHz = sr / N
  const NB = 24
  const edges: number[] = []
  for (let k = 0; k <= NB; k++) edges.push(Math.min(bins, Math.max(1, Math.round((30 * Math.pow(11000 / 30, k / NB)) / binHz))))
  const bands: Array<[number, number]> = []
  for (let k = 0; k < NB; k++) {
    const a = edges[k]
    const b = Math.max(a + 1, edges[k + 1])
    if (a < bins && (!bands.length || a >= bands[bands.length - 1][1])) bands.push([a, Math.min(bins, b)])
  }
  // Más peso a los graves (bombo, bajo): de ×2.5 en la banda más baja a ×1 en la más alta.
  const weight = bands.map((_, k) => 1 + 1.5 * (1 - k / Math.max(1, bands.length - 1)))
  let prev = new Float32Array(bands.length)
  let cur = new Float32Array(bands.length)
  for (let f = 0; f < frames; f++) {
    const off = f * HOP
    for (let i = 0; i < N; i++) {
      re[i] = x[off + i] * win[i]
      im[i] = 0
    }
    fft.transform(re, im)
    let flux = 0
    for (let k = 0; k < bands.length; k++) {
      const [a, b] = bands[k]
      let e = 0
      for (let i = a; i < b; i++) e += re[i] * re[i] + im[i] * im[i]
      const mag = Math.log1p(1000 * Math.sqrt(e / (b - a)))
      cur[k] = mag
      const d = mag - prev[k]
      if (d > 0) flux += d * weight[k]
    }
    env[f] = f === 0 ? 0 : flux
    ;[prev, cur] = [cur, prev]
  }
  // Normalizar a desviación típica 1 y quitar la media.
  let mean = 0
  for (const v of env) mean += v
  mean /= Math.max(1, env.length)
  let sd = 0
  for (const v of env) sd += (v - mean) ** 2
  sd = Math.sqrt(sd / Math.max(1, env.length)) || 1
  for (let i = 0; i < env.length; i++) env[i] = Math.max(0, (env[i] - mean) / sd)
  return { env, frameRate: sr / HOP }
}

/** Picos del envolvente por encima de la mediana local + delta, separados al menos `minGap` s. */
export function pickOnsets(env: Float32Array, frameRate: number, delta = 0.6, minGap = 0.07): number[] {
  const w = Math.max(3, Math.round(frameRate * 0.25))
  const out: number[] = []
  let last = -Infinity
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue
    const a = Math.max(0, i - w)
    const b = Math.min(env.length, i + w + 1)
    const win = Array.from(env.subarray(a, b)).sort((p, q) => p - q)
    const med = win[win.length >> 1]
    const t = i / frameRate
    if (env[i] > med + delta && t - last >= minGap) {
      out.push(t)
      last = t
    }
  }
  return out
}

/** Tempo en BPM por autocorrelación del envolvente (con preferencia logarítmica centrada en 120). */
export function estimateTempo(env: Float32Array, frameRate: number, minBpm = 60, maxBpm = 200): number {
  const minLag = Math.max(1, Math.floor((60 / maxBpm) * frameRate))
  const maxLag = Math.min(env.length - 1, Math.ceil((60 / minBpm) * frameRate))
  let best = 0
  let bestScore = -Infinity
  const scores: number[] = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag]
    s /= env.length - lag
    const bpm = (60 * frameRate) / lag
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2)
    const score = s * prior
    scores[lag] = s
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  if (!best) return 120
  // Afinado sub-fotograma por interpolación parabólica.
  const y0 = scores[best - 1] ?? scores[best]
  const y1 = scores[best]
  const y2 = scores[best + 1] ?? scores[best]
  const den = y0 - 2 * y1 + y2
  const shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0
  return (60 * frameRate) / (best + shift)
}

/** Seguimiento de beats por programación dinámica. */
export function trackBeats(env: Float32Array, frameRate: number, bpm: number, tightness = 100): number[] {
  const n = env.length
  if (!n) return []
  const period = (60 / bpm) * frameRate
  const score = new Float32Array(n)
  const back = new Int32Array(n).fill(-1)
  const lo = Math.round(period / 2)
  const hi = Math.round(period * 2)
  for (let i = 0; i < n; i++) {
    let best = 0
    let bestJ = -1
    for (let j = i - hi; j <= i - lo; j++) {
      if (j < 0) continue
      const pen = -tightness * Math.log((i - j) / period) ** 2
      const v = score[j] + pen
      if (bestJ < 0 || v > best) {
        best = v
        bestJ = j
      }
    }
    score[i] = env[i] + (bestJ >= 0 ? Math.max(0, best) : 0)
    back[i] = bestJ >= 0 && best > 0 ? bestJ : -1
  }
  // Último beat: el máximo en el último periodo.
  let end = n - 1
  for (let i = Math.max(0, n - Math.round(period)); i < n; i++) if (score[i] > score[end]) end = i
  const beats: number[] = []
  for (let i = end; i >= 0; i = back[i]) {
    beats.push(i / frameRate)
    if (back[i] < 0) break
  }
  return beats.reverse()
}

export function analyzeBeats(samples: Float32Array, sampleRate: number): BeatAnalysis {
  const { env, frameRate } = onsetEnvelope(samples, sampleRate)
  if (env.length < 8) return { bpm: 0, beats: [], onsets: [] }
  const bpm = estimateTempo(env, frameRate)
  // El flujo es máximo cuando el golpe cae en el centro de la ventana: el
  // fotograma f representa el instante f·HOP + N/2 (en muestras diezmadas).
  const lat = N / 2 / (frameRate * HOP)
  const shift = (t: number) => t + lat
  const beats = trackBeats(env, frameRate, bpm).map(shift)
  return {
    bpm: Math.round(refineBpm(beats, bpm) * 10) / 10,
    beats,
    onsets: pickOnsets(env, frameRate).map(shift)
  }
}

/**
 * BPM afinado por regresión lineal de los tiempos de beat frente a su índice
 * (la autocorrelación está cuantizada al salto de análisis). Si los beats son
 * irregulares, se queda con la estimación inicial.
 */
export function refineBpm(beats: number[], initial: number): number {
  const n = beats.length
  if (n < 8) return initial
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sx += i
    sy += beats[i]
    sxx += i * i
    sxy += i * beats[i]
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const bpm = 60 / slope
  return Math.abs(bpm - initial) / initial < 0.05 ? bpm : initial
}

/** Beats según la rejilla elegida: cada beat, cada 2, cada 4 (compás) o los golpes. */
export type BeatGrid = 'off' | 'beats' | 'half' | 'bars' | 'onsets'

export function gridTimes(a: BeatAnalysis, grid: BeatGrid): number[] {
  switch (grid) {
    case 'beats':
      return a.beats
    case 'half':
      return a.beats.filter((_, i) => i % 2 === 0)
    case 'bars':
      return a.beats.filter((_, i) => i % 4 === 0)
    case 'onsets':
      return a.onsets
    default:
      return []
  }
}
