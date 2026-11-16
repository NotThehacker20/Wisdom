import { cubicBezier, PRESET_FUNCTIONS } from './easing'
import type { AnimProp, Keyframe } from './types'

/** Tangentes por defecto de un tramo bézier «custom» (ease in/out suave). */
export const DEFAULT_OUT = { x: 0.33, y: 0 }
export const DEFAULT_IN = { x: 0.67, y: 1 }

/** Progreso normalizado (0..1, puede salirse con back/elastic) del tramo k0→k1 en u∈[0,1]. */
export function segmentProgress(k0: Keyframe, k1: Keyframe, u: number): number {
  switch (k0.interp) {
    case 'hold':
      return 0
    case 'linear':
      return u
    case 'bezier': {
      const ease = k0.ease ?? 'custom'
      if (ease !== 'custom') return PRESET_FUNCTIONS[ease](u)
      return cubicBezier(k0.outX ?? DEFAULT_OUT.x, k0.outY ?? DEFAULT_OUT.y, k1.inX ?? DEFAULT_IN.x, k1.inY ?? DEFAULT_IN.y, u)
    }
  }
}

/** Valor de una lista de keyframes (ordenada por t) en el tiempo t. */
export function evalKeyframes(kfs: Keyframe[], t: number): number {
  const n = kfs.length
  if (t <= kfs[0].t) return kfs[0].v
  if (t >= kfs[n - 1].t) return kfs[n - 1].v
  // Búsqueda binaria del tramo.
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (kfs[mid].t <= t) lo = mid
    else hi = mid
  }
  const k0 = kfs[lo]
  const k1 = kfs[hi]
  const span = k1.t - k0.t
  if (span <= 0) return k1.v
  const e = segmentProgress(k0, k1, (t - k0.t) / span)
  return k0.v + (k1.v - k0.v) * e
}

/** Evalúa una propiedad animable en un tiempo local de clip. */
export function evalProp(p: AnimProp, localT: number): number {
  const kfs = p.keyframes
  if (!kfs || kfs.length === 0) return p.value
  return evalKeyframes(kfs, localT)
}

export const isAnimated = (p: AnimProp): boolean => !!p.keyframes && p.keyframes.length > 0

/** Tolerancia para considerar que un keyframe está «en» un tiempo (medio fotograma a 120 fps). */
export const KEY_EPS = 1 / 240

export function keyframeAt(p: AnimProp, t: number): Keyframe | undefined {
  return p.keyframes?.find((k) => Math.abs(k.t - t) < KEY_EPS)
}

export function nextKeyTime(p: AnimProp, t: number, dir: 1 | -1): number | undefined {
  const ks = p.keyframes ?? []
  if (dir > 0) return ks.find((k) => k.t > t + KEY_EPS)?.t
  for (let i = ks.length - 1; i >= 0; i--) if (ks[i].t < t - KEY_EPS) return ks[i].t
  return undefined
}
