/**
 * Velocidad y speed ramps: mapeo tiempo de clip → tiempo de origen.
 *
 *   F(t) = ∫₀ᵗ velocidad(τ)/100 dτ            (segundos de medio consumidos)
 *   origen(t) = in + F(t)                      (normal)
 *   origen(t) = in + F(D) − F(t)               (al revés; D = duración del clip)
 *
 * Con velocidad constante F es lineal; con keyframes se integra numéricamente
 * (tabla acumulada cacheada por propiedad) y se invierte por búsqueda binaria.
 * Fuera de [0, D] se extrapola con la velocidad del borde (transiciones).
 */
import { evalProp } from './anim'
import type { AnimProp, Clip } from './types'

export const SPEED_MIN = 1
export const SPEED_MAX = 1000
const STEP = 1 / 240

interface Table {
  /** F en múltiplos de STEP desde 0. */
  F: Float64Array
  len: number
}
const tables = new WeakMap<AnimProp, Table>()

const v = (p: AnimProp, t: number) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, evalProp(p, t))) / 100

/** Velocidad (factor, 1 = normal) en el tiempo local t. */
export function speedAt(clip: Clip, t: number): number {
  return clip.speed ? v(clip.speed, t) : 1
}

export const isRamp = (c: Clip): boolean => !!c.speed?.keyframes?.length
export const hasSpeedChange = (c: Clip): boolean => !!c.reverse || isRamp(c) || (!!c.speed && c.speed.value !== 100)

function table(p: AnimProp, upTo: number): Table {
  let tb = tables.get(p)
  const need = Math.ceil(upTo / STEP) + 2
  if (!tb || tb.len < need) {
    const len = Math.max(need, (tb?.len ?? 0) * 2, 256)
    const F = new Float64Array(len)
    let prev = v(p, 0)
    for (let i = 1; i < len; i++) {
      const cur = v(p, i * STEP)
      F[i] = F[i - 1] + ((prev + cur) / 2) * STEP // trapecios
      prev = cur
    }
    tb = { F, len }
    tables.set(p, tb)
  }
  return tb
}

/** F(t): segundos de medio consumidos desde el inicio del clip hasta su tiempo local t. */
export function integral(clip: Clip, t: number): number {
  const p = clip.speed
  if (!p) return t
  if (!p.keyframes?.length) return t * v(p, 0)
  if (t <= 0) return t * v(p, 0)
  const tb = table(p, t)
  const x = t / STEP
  const i = Math.floor(x)
  const f = x - i
  return tb.F[i] + (tb.F[i + 1] - tb.F[i]) * f
}

/** F⁻¹(s): tiempo local en el que se han consumido s segundos de medio. */
export function inverseIntegral(clip: Clip, s: number): number {
  const p = clip.speed
  if (!p) return s
  if (!p.keyframes?.length || s <= 0) return s / v(p, 0)
  let lo = 0
  let hi = Math.max(STEP, s / (SPEED_MAX / 100))
  while (integral(clip, hi) < s) hi *= 2
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (integral(clip, mid) < s) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Segundos de medio que cubre el clip entero. */
export const sourceSpan = (c: Clip): number => integral(c, c.duration)

/** Tiempo de origen (en el medio) para un tiempo local del clip. */
export function clipSourceTime(c: Clip, localT: number): number {
  return c.reverse ? c.in + sourceSpan(c) - integral(c, localT) : c.in + integral(c, localT)
}

/** Tiempo local del clip en el que se muestra el instante `src` del medio. */
export function localTimeForSource(c: Clip, src: number): number {
  return c.reverse ? inverseIntegral(c, c.in + sourceSpan(c) - src) : inverseIntegral(c, src - c.in)
}

/** Rango de tiempo local en el que el clip tiene material (origen dentro de [0, duración del medio]). */
export function availableLocalRange(c: Clip, mediaDuration: number): [number, number] {
  if (!isFinite(mediaDuration)) return [-Infinity, Infinity]
  const a = localTimeForSource(c, c.reverse ? mediaDuration : 0)
  const b = localTimeForSource(c, c.reverse ? 0 : mediaDuration)
  return [Math.min(a, b), Math.max(a, b)]
}

const shiftProp = (p: AnimProp, dt: number): AnimProp => (p.keyframes ? { ...p, keyframes: p.keyframes.map((k) => ({ ...k, t: k.t + dt })) } : p)

/**
 * Quita `d` segundos del principio del clip (d < 0 lo alarga) sin cambiar lo
 * que se ve en el resto: en normal avanza `in`; al revés `in` no cambia.
 * (Los keyframes de transformación/efectos los desplaza la timeline.)
 */
export function trimHeadSpeed(c: Clip, d: number): Clip {
  const next: Clip = { ...c, start: c.start + d, duration: c.duration - d, in: c.reverse ? c.in : c.in + integral(c, d) }
  if (c.speed) next.speed = shiftProp(c.speed, -d)
  return next
}

/** Cambia la duración por el final sin alterar lo que se ve: al revés hay que mover `in`. */
export function trimTailSpeed(c: Clip, duration: number): Clip {
  if (!c.reverse) return { ...c, duration }
  return { ...c, duration, in: c.in + integral(c, c.duration) - integral(c, duration) }
}

/** ¿El clip pide material que no existe en el medio? */
export function sourceOutOfRange(c: Clip, mediaDuration: number, eps = 1e-3): boolean {
  if (!isFinite(mediaDuration)) return false
  return c.in < -eps || c.in + sourceSpan(c) > mediaDuration + eps
}

// ───────────────────────────── presets de curva ─────────────────────────────

export interface SpeedPreset {
  id: string
  name: string
  /** Puntos (u ∈ [0,1] de la duración, velocidad %). */
  points: Array<[number, number]>
}

export const SPEED_PRESETS: SpeedPreset[] = [
  { id: 'montage', name: 'Montaje', points: [[0, 100], [0.35, 300], [0.65, 300], [1, 100]] },
  { id: 'hero', name: 'Héroe', points: [[0, 300], [0.4, 30], [0.6, 30], [1, 300]] },
  { id: 'bullet', name: 'Bala', points: [[0, 200], [0.45, 15], [0.55, 15], [1, 200]] },
  { id: 'jump', name: 'Salto', points: [[0, 100], [0.4, 100], [0.5, 500], [0.6, 100], [1, 100]] },
  { id: 'flashIn', name: 'Flash in', points: [[0, 500], [0.3, 100], [1, 100]] },
  { id: 'flashOut', name: 'Flash out', points: [[0, 100], [0.7, 100], [1, 500]] },
  { id: 'rampUp', name: 'Rampa lenta → rápida', points: [[0, 25], [1, 300]] },
  { id: 'rampDown', name: 'Rampa rápida → lenta', points: [[0, 300], [1, 25]] }
]
