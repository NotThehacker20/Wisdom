import { crossfadeGain, fadeGain, projectAudioPlans, type AudioPlan } from '@/core/audio/mix'
import type { Project } from '@/core/types'

/**
 * Programa la mezcla de audio del proyecto desde el tiempo de timeline `t0`,
 * que sonará en el instante `when` del contexto. Sirve para un AudioContext
 * (reproducción) y para un OfflineAudioContext (exportación, fase 10).
 *
 * Cadena por clip: fuente → fundidos → crossfade → volumen → destino.
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
    const buffer = getBuffer(clip.assetId!)
    if (!buffer || plan.to <= t0) continue
    let startT = Math.max(t0, plan.from)
    let offset = clip.in + (startT - clip.start)
    if (offset < 0) {
      // B empieza antes de su entrada pero el medio no tiene material previo.
      startT -= offset
      offset = 0
    }
    if (startT >= plan.to || offset >= buffer.duration) continue
    const dur = Math.min(plan.to - startT, buffer.duration - offset)
    if (dur <= 0) continue
    const at = (t: number) => when + (t - t0)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    const gFade = ctx.createGain()
    const gX = ctx.createGain()
    const gVol = ctx.createGain()
    gVol.gain.value = clip.volume
    src.connect(gFade).connect(gX).connect(gVol).connect(dest)
    automate(gFade.gain, (t) => fadeGain(plan, t), [plan.fadeIn, plan.fadeOut], startT, startT + dur, at)
    automate(gX.gain, (t) => crossfadeGain(plan, t), [plan.xIn, plan.xOut], startT, startT + dur, at)
    src.start(at(startT), offset, dur)
    nodes.push(src)
  }
  return nodes
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
