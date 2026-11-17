import { crossfadeGain, fadeGain, projectAudioPlans, type AudioPlan } from '@/core/audio/mix'
import { availableLocalRange, clipSourceTime, isRamp, speedAt } from '@/core/speed'
import type { Project } from '@/core/types'
import { timeStretch } from '@/core/audio/wsola'

/**
 * Programa la mezcla de audio del proyecto desde el tiempo de timeline `t0`,
 * que sonará en el instante `when` del contexto. Sirve para un AudioContext
 * (reproducción) y para un OfflineAudioContext (exportación, fase 10).
 *
 * Cadena por clip: fuente → fundidos → crossfade → volumen → destino.
 * La velocidad se aplica con playbackRate (automatizado en las rampas) y el
 * inverso con una copia invertida del buffer.
 */
export function scheduleAudio(
  ctx: BaseAudioContext,
  dest: AudioNode,
  project: Project,
  getBuffer: (assetId: string) => AudioBuffer | null | undefined,
  t0: number,
  when: number
): AudioBufferSourceNode[] {
  const nodes: AudioBufferSourceNode[] = []
  for (const plan of projectAudioPlans(project)) {
    const clip = plan.clip
    const buffer0 = getBuffer(clip.assetId!)
    if (!buffer0 || plan.to <= t0) continue
    // Solo suena donde el medio tiene material (con velocidad, rampas e inverso).
    const [availA, availB] = availableLocalRange(clip, buffer0.duration)
    const startT = Math.max(t0, plan.from, clip.start + availA)
    const endT = Math.min(plan.to, clip.start + availB)
    if (endT - startT < 1e-3) continue
    const srcA = clipSourceTime(clip, startT - clip.start)
    const srcB = clipSourceTime(clip, endT - clip.start)
    const buffer1 = clip.reverse ? reversed(ctx, buffer0) : buffer0
    // Mantener tono: con velocidad constante, buffer estirado (WSOLA) a velocidad 1.
    const rate = speedAt(clip, 0)
    const stretch = clip.preservePitch && !isRamp(clip) && Math.abs(rate - 1) > 1e-3 ? rate : 1
    const buffer = stretch !== 1 ? stretched(ctx, buffer1, stretch) : buffer1
    const offset = Math.min(buffer.duration, Math.max(0, (clip.reverse ? buffer1.duration - srcA : srcA) / stretch))
    const bufDur = Math.abs(srcB - srcA) / stretch
    const dur = endT - startT
    const at = (t: number) => when + (t - t0)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    // Velocidad: playbackRate constante o automatizado (rampas). El tono cambia, como en una cinta.
    if (isRamp(clip)) {
      const n = Math.max(2, Math.min(2000, Math.ceil(dur * 60)))
      const curve = new Float32Array(n)
      for (let i = 0; i < n; i++) curve[i] = speedAt(clip, startT + (dur * i) / (n - 1) - clip.start)
      src.playbackRate.setValueCurveAtTime(curve, at(startT), dur)
    } else if (clip.speed && stretch === 1) src.playbackRate.value = rate
    const gFade = ctx.createGain()
    const gX = ctx.createGain()
    const gVol = ctx.createGain()
    gVol.gain.value = clip.volume
    src.connect(gFade).connect(gX).connect(gVol).connect(dest)
    automate(gFade.gain, (t) => fadeGain(plan, t), [plan.fadeIn, plan.fadeOut], startT, startT + dur, at)
    automate(gX.gain, (t) => crossfadeGain(plan, t), [plan.xIn, plan.xOut], startT, startT + dur, at)
    src.start(at(startT), offset, bufDur)
    nodes.push(src)
  }
  return nodes
}

/** Versión estirada (mismo tono) de un buffer a la velocidad `rate`, cacheada. */
const stretchCache = new WeakMap<AudioBuffer, Map<number, AudioBuffer>>()
function stretched(ctx: BaseAudioContext, b: AudioBuffer, rate: number): AudioBuffer {
  let m = stretchCache.get(b)
  if (!m) stretchCache.set(b, (m = new Map()))
  const key = Math.round(rate * 1e4) / 1e4
  let r = m.get(key)
  if (!r) {
    const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c))
    const out = timeStretch(chans, b.sampleRate, key)
    r = ctx.createBuffer(b.numberOfChannels, out[0].length, b.sampleRate)
    for (let c = 0; c < out.length; c++) r.copyToChannel(out[c] as Float32Array<ArrayBuffer>, c)
    m.set(key, r)
  }
  return r
}

/** Copia invertida de un buffer (para clips al revés), cacheada. */
const reversedCache = new WeakMap<AudioBuffer, AudioBuffer>()
function reversed(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  let r = reversedCache.get(b)
  if (!r) {
    r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate)
    for (let c = 0; c < b.numberOfChannels; c++) {
      const src = b.getChannelData(c)
      const dst = r.getChannelData(c)
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i]
    }
    reversedCache.set(b, r)
  }
  return r
}

/**
 * Automatiza un parámetro con la función `fn` dentro de las ventanas dadas
 * (fusionando solapes) usando curvas muestreadas; fuera de ellas el valor es
 * constante (el de fn).
 */
function automate(
  param: AudioParam,
  fn: (t: number) => number,
  windows: Array<[number, number] | undefined>,
  from: number,
  to: number,
  at: (t: number) => number
): void {
  const ws = windows
    .filter((w): w is [number, number] => !!w && w[1] > from && w[0] < to)
    .map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
    .sort((x, y) => x[0] - y[0])
  const merged: Array<[number, number]> = []
  for (const w of ws) {
    const last = merged[merged.length - 1]
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1])
    else merged.push([...w])
  }
  if (!merged.length || merged[0][0] > from + 1e-6) param.setValueAtTime(fn(from), at(from))
  let cursor = from
  for (const [a, b] of merged) {
    if (b - a < 1e-4) continue
    if (a > cursor + 1e-6) param.setValueAtTime(fn(a), at(a))
    const n = Math.max(8, Math.min(256, Math.ceil((b - a) * 120)))
    const curve = new Float32Array(n)
    for (let i = 0; i < n; i++) curve[i] = fn(a + ((b - a) * i) / (n - 1))
    param.setValueCurveAtTime(curve, at(a), b - a)
    cursor = b
    // Tras la curva, el valor queda fijo en su último punto (fn(b)).
  }
}

export type { AudioPlan }
