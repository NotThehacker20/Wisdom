/** Picos (mín/máx) para dibujar formas de onda a cualquier zoom. */
export interface Peaks {
  /** Picos por segundo. */
  rate: number
  min: Float32Array
  max: Float32Array
  duration: number
}

export const PEAKS_PER_SECOND = 200

export function computePeaks(samples: Float32Array, sampleRate: number, rate = PEAKS_PER_SECOND): Peaks {
  const per = Math.max(1, Math.round(sampleRate / rate))
  const n = Math.ceil(samples.length / per)
  const min = new Float32Array(n)
  const max = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let lo = 0
    let hi = 0
    const end = Math.min(samples.length, (i + 1) * per)
    for (let j = i * per; j < end; j++) {
      const v = samples[j]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    min[i] = lo
    max[i] = hi
  }
  return { rate: sampleRate / per, min, max, duration: samples.length / sampleRate }
}

/** Reduce los picos de [t0, t1) (s) a `columns` columnas. */
export function peaksRange(p: Peaks, t0: number, t1: number, columns: number): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(columns)
  const max = new Float32Array(columns)
  const span = (t1 - t0) / columns
  for (let c = 0; c < columns; c++) {
    const a = Math.max(0, Math.floor((t0 + c * span) * p.rate))
    const b = Math.min(p.min.length, Math.max(a + 1, Math.ceil((t0 + (c + 1) * span) * p.rate)))
    let lo = 0
    let hi = 0
    for (let i = a; i < b; i++) {
      if (p.min[i] < lo) lo = p.min[i]
      if (p.max[i] > hi) hi = p.max[i]
    }
    min[c] = lo
    max[c] = hi
  }
  return { min, max }
}

/** Mezcla a mono (media de canales). */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice()
  const n = channels[0].length
  const out = new Float32Array(n)
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i]
  const k = 1 / channels.length
  for (let i = 0; i < n; i++) out[i] *= k
  return out
}
