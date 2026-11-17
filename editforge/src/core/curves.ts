/**
 * Curvas de color: una curva maestra (RGB) y una por canal. Cada curva es una
 * lista de puntos (x, y) en [0, 1] que se interpola con un spline cúbico
 * monótono (Fritsch–Carlson): pasa por los puntos sin «rebotes», como las
 * curvas de Photoshop/Resolve. El resultado se hornea en una tabla de 256
 * entradas por canal: salida_c = canal_c(maestra(x)).
 */
export type CurvePoint = [number, number]
export type CurveChannel = 'm' | 'r' | 'g' | 'b'
export type Curves = Record<CurveChannel, CurvePoint[]>

export const CURVE_CHANNELS: CurveChannel[] = ['m', 'r', 'g', 'b']
export const IDENTITY_CURVE: CurvePoint[] = [
  [0, 0],
  [1, 1]
]
export const DEFAULT_CURVES: Curves = { m: IDENTITY_CURVE, r: IDENTITY_CURVE, g: IDENTITY_CURVE, b: IDENTITY_CURVE }
export const DEFAULT_CURVES_STRING = JSON.stringify(DEFAULT_CURVES)

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Ordena, limita a [0,1] y quita puntos con la misma x (se queda el último). */
export function normalizeCurve(pts: CurvePoint[]): CurvePoint[] {
  const sorted = pts
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([x, y]) => [clamp01(x), clamp01(y)] as CurvePoint)
    .sort((a, b) => a[0] - b[0])
  const out: CurvePoint[] = []
  for (const p of sorted) {
    if (out.length && Math.abs(out[out.length - 1][0] - p[0]) < 1e-6) out[out.length - 1] = p
    else out.push(p)
  }
  return out.length ? out : IDENTITY_CURVE.map((p) => [...p] as CurvePoint)
}

export function parseCurves(s: string | undefined): Curves {
  try {
    const raw = JSON.parse(s || '') as Partial<Curves>
    const out = {} as Curves
    for (const c of CURVE_CHANNELS) out[c] = normalizeCurve(Array.isArray(raw?.[c]) ? raw[c]! : IDENTITY_CURVE)
    return out
  } catch {
    return { ...DEFAULT_CURVES }
  }
}

export const isIdentityCurve = (pts: CurvePoint[]): boolean => pts.every(([x, y]) => Math.abs(x - y) < 1e-4)

/** Pendientes de Fritsch–Carlson (spline cúbico de Hermite monótono). */
function tangents(pts: CurvePoint[]): number[] {
  const n = pts.length
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / Math.max(1e-9, pts[i + 1][0] - pts[i][0]))
  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  return m
}

/** Evalúa la curva en x (fuera de los extremos se mantiene plana). */
export function evalCurve(pts: CurvePoint[], x: number, m: number[] = tangents(pts)): number {
  const n = pts.length
  if (n === 1) return pts[0][1]
  if (x <= pts[0][0]) return pts[0][1]
  if (x >= pts[n - 1][0]) return pts[n - 1][1]
  let i = 0
  while (i < n - 2 && x > pts[i + 1][0]) i++
  const [x0, y0] = pts[i]
  const [x1, y1] = pts[i + 1]
  const h = x1 - x0
  const t = (x - x0) / h
  const t2 = t * t
  const t3 = t2 * t
  return clamp01((2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1])
}

/** Muestrea una curva en `size` valores de 0 a 1. */
export function sampleCurve(pts: CurvePoint[], size = 256): Float32Array {
  const m = pts.length > 1 ? tangents(pts) : []
  const out = new Float32Array(size)
  for (let i = 0; i < size; i++) out[i] = evalCurve(pts, i / (size - 1), m)
  return out
}

/** Tabla RGBA8 de 256 entradas: canal_c(maestra(x)); alfa = 255. */
export function buildCurvesTable(c: Curves, size = 256): Uint8Array {
  const master = sampleCurve(c.m, size)
  const lookup = (tab: Float32Array, v: number) => {
    const f = v * (size - 1)
    const i = Math.min(size - 2, Math.floor(f))
    return tab[i] + (tab[i + 1] - tab[i]) * (f - i)
  }
  const chans = [sampleCurve(c.r, size), sampleCurve(c.g, size), sampleCurve(c.b, size)]
  const out = new Uint8Array(size * 4)
  for (let i = 0; i < size; i++) {
    const mv = master[i]
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(clamp01(lookup(chans[k], mv)) * 255)
    out[i * 4 + 3] = 255
  }
  return out
}

/** Presets de curva maestra habituales. */
export const CURVE_PRESETS: Array<{ name: string; curves: Partial<Curves> }> = [
  { name: 'Contraste suave (S)', curves: { m: [[0, 0], [0.25, 0.2], [0.75, 0.8], [1, 1]] } },
  { name: 'Contraste fuerte', curves: { m: [[0, 0], [0.25, 0.13], [0.75, 0.87], [1, 1]] } },
  { name: 'Negros lavados (fade)', curves: { m: [[0, 0.12], [0.5, 0.52], [1, 0.95]] } },
  { name: 'Invertir', curves: { m: [[0, 1], [1, 0]] } },
  { name: 'Teal & orange', curves: { r: [[0, 0], [0.3, 0.26], [0.7, 0.76], [1, 1]], b: [[0, 0.06], [0.3, 0.34], [0.7, 0.66], [1, 0.94]] } }
]
