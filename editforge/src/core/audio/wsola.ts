/**
 * Time-stretch WSOLA (Waveform Similarity Overlap-Add): cambia la duración del
 * audio sin cambiar el tono. Se cortan ventanas Hann con 50 % de solape; cada
 * ventana se toma cerca de su posición ideal (k · Ha) desplazándola hasta
 * ±tolerancia para que encaje con la continuación natural de la anterior
 * (máxima correlación), lo que evita los «golpes» de fase del OLA simple.
 *
 * `rate` es la velocidad: 2 → la mitad de duración, 0.5 → el doble.
 * La búsqueda se hace sobre una mezcla mono diezmada (rápida) y el mismo
 * desplazamiento se aplica a todos los canales (mantiene la imagen estéreo).
 */
export interface WsolaOptions {
  /** Tamaño de ventana en segundos (≈ 40 ms va bien para voz y música). */
  window?: number
  /** Tolerancia de búsqueda en segundos. */
  tolerance?: number
}

export function timeStretch(channels: Float32Array[], sampleRate: number, rate: number, opts: WsolaOptions = {}): Float32Array[] {
  const inLen = channels[0]?.length ?? 0
  if (!inLen || Math.abs(rate - 1) < 1e-6) return channels.map((c) => c.slice())
  const N = Math.max(64, Math.round((opts.window ?? 0.04) * sampleRate) & ~1)
  const Hs = N / 2
  const Ha = Hs * rate
  const tol = Math.max(8, Math.round((opts.tolerance ?? 0.01) * sampleRate))
  const outLen = Math.max(1, Math.round(inLen / rate))

  // Ventana Hann periódica: con salto N/2 las ventanas suman exactamente 1.
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)

  // Mono diezmado ×4 para la búsqueda de similitud.
  const D = 4
  const monoLen = Math.ceil(inLen / D)
  const mono = new Float32Array(monoLen)
  for (let i = 0; i < monoLen; i++) {
    let s = 0
    for (const c of channels) for (let k = 0; k < D; k++) s += c[i * D + k] ?? 0
    mono[i] = s
  }
  const at = (i: number) => (i >= 0 && i < monoLen ? mono[i] : 0)

  const out = channels.map(() => new Float32Array(outLen + N))
  let prev = 0 // inicio (en la entrada) de la ventana anterior elegida
  const frames = Math.ceil(outLen / Hs) + 1
  for (let k = 0; k < frames; k++) {
    const ideal = Math.round(k * Ha)
    let pos = ideal
    if (k > 0) {
      // Plantilla: la continuación natural de la ventana anterior (prev + Hs), en su mitad solapada.
      const nat = prev + Hs
      const lo = Math.max(0, ideal - tol)
      const hi = Math.min(inLen - 1, ideal + tol)
      const len = Math.max(1, Math.floor(Hs / D))
      const tStart = Math.floor(nat / D)
      let best = -Infinity
      let bestPos = ideal
      let tEnergy = 0
      for (let i = 0; i < len; i++) tEnergy += at(tStart + i) ** 2
      for (let c = Math.floor(lo / D); c <= Math.floor(hi / D); c++) {
        let dot = 0
        let e = 0
        for (let i = 0; i < len; i++) {
          const v = at(c + i)
          dot += v * at(tStart + i)
          e += v * v
        }
        const score = tEnergy > 0 && e > 0 ? dot / Math.sqrt(e * tEnergy) : -Math.abs(c * D - ideal)
        if (score > best) {
          best = score
          bestPos = c * D
        }
      }
      pos = bestPos
    }
    const o = k * Hs
    for (let ch = 0; ch < channels.length; ch++) {
      const src = channels[ch]
      const dst = out[ch]
      for (let i = 0; i < N; i++) {
        const j = pos + i
        if (j >= inLen || o + i >= dst.length) break
        // La primera ventana no tiene a quién solaparse: su mitad inicial va sin rampa.
        dst[o + i] += src[j] * (k === 0 && i < Hs ? 1 : win[i])
      }
    }
    prev = pos
  }
  return out.map((c) => c.subarray(0, outLen).slice())
}
