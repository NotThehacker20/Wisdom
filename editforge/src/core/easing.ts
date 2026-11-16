import type { EasingPreset } from './types'

/**
 * Bézier cúbica normalizada (P0=(0,0), P3=(1,1)), como CSS cubic-bezier.
 * Devuelve y(u) resolviendo x(s)=u con Newton y bisección de respaldo.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  // x debe ser monótona: las tangentes de tiempo se limitan a [0, 1].
  x1 = Math.min(1, Math.max(0, x1))
  x2 = Math.min(1, Math.max(0, x2))
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s
  const dsx = (s: number) => (3 * ax * s + 2 * bx) * s + cx
  let s = u
  for (let i = 0; i < 8; i++) {
    const err = sx(s) - u
    if (Math.abs(err) < 1e-7) return ((ay * s + by) * s + cy) * s
    const d = dsx(s)
    if (Math.abs(d) < 1e-6) break
    s -= err / d
  }
  let lo = 0
  let hi = 1
  s = u
  for (let i = 0; i < 40; i++) {
    const x = sx(s)
    if (Math.abs(x - u) < 1e-7) break
    if (x < u) lo = s
    else hi = s
    s = (lo + hi) / 2
  }
  return ((ay * s + by) * s + cy) * s
}

/** Curvas analíticas (easings.net). Todas cumplen f(0)=0 y f(1)=1. */
export const PRESET_FUNCTIONS: Record<EasingPreset, (u: number) => number> = {
  easeInOutExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2),
  easeOutBack: (u) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)
  },
  elastic: (u) => {
    if (u <= 0) return 0
    if (u >= 1) return 1
    return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  },
  bounce: (u) => {
    const n1 = 7.5625
    const d1 = 2.75
    if (u < 1 / d1) return n1 * u * u
    if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75
    if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375
    return n1 * (u -= 2.625 / d1) * u + 0.984375
  }
}

/** Presets que se aplican como tangentes bézier editables. */
export const BEZIER_PRESETS = {
  linear: { outX: 1 / 3, outY: 1 / 3, inX: 2 / 3, inY: 2 / 3 },
  easeIn: { outX: 0.42, outY: 0, inX: 1, inY: 1 },
  easeOut: { outX: 0, outY: 0, inX: 0.58, inY: 1 },
  easeInOut: { outX: 0.42, outY: 0, inX: 0.58, inY: 1 }
} as const

export type BezierPresetName = keyof typeof BEZIER_PRESETS

/** Todos los presets que ofrece la interfaz, en orden. */
export const EASING_MENU: Array<{ id: BezierPresetName | EasingPreset | 'hold'; label: string }> = [
  { id: 'linear', label: 'Lineal' },
  { id: 'easeIn', label: 'Ease in' },
  { id: 'easeOut', label: 'Ease out' },
  { id: 'easeInOut', label: 'Ease in/out' },
  { id: 'easeInOutExpo', label: 'InOut Expo' },
  { id: 'easeOutBack', label: 'Out Back' },
  { id: 'elastic', label: 'Elástico' },
  { id: 'bounce', label: 'Rebote' },
  { id: 'hold', label: 'Hold' }
]
