/**
 * Ruido determinista (mismo resultado en previsualización y exportación).
 * Ruido de gradiente 1D suave, en [-1, 1] aproximadamente.
 */

function hash(n: number): number {
  // Hash entero rápido (xorshift-multiply), resultado en [0, 1).
  let x = (n | 0) ^ 0x9e3779b9
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Ruido de gradiente 1D (Perlin) en x, con semilla. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x)
  const f = x - i
  const g0 = hash(i + seed * 7919) * 2 - 1
  const g1 = hash(i + 1 + seed * 7919) * 2 - 1
  const v = g0 * f + (g1 * (f - 1) - g0 * f) * fade(f)
  return v * 2 // ~[-1, 1]
}

/** Dos octavas: movimiento más orgánico (cámara en mano, temblores). */
export function fbm1(x: number, seed = 0): number {
  return (noise1(x, seed) + 0.5 * noise1(x * 2.13 + 17.7, seed + 31)) / 1.25
}
