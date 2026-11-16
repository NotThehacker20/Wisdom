/**
 * Matrices afines 2D 3x3 en orden column-major (compatible con uniformMatrix3fv).
 * [a c e]
 * [b d f]   →  [a, b, 0, c, d, 0, e, f, 1]
 * [0 0 1]
 */
export type Mat3 = Float32Array

export function identity(): Mat3 {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Float32Array(9)
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      out[col * 3 + row] =
        a[0 * 3 + row] * b[col * 3 + 0] + a[1 * 3 + row] * b[col * 3 + 1] + a[2 * 3 + row] * b[col * 3 + 2]
    }
  }
  return out
}

export function translation(x: number, y: number): Mat3 {
  return new Float32Array([1, 0, 0, 0, 1, 0, x, y, 1])
}

export function scaling(sx: number, sy: number): Mat3 {
  return new Float32Array([sx, 0, 0, 0, sy, 0, 0, 0, 1])
}

/** Rotación en radianes (con y hacia abajo, ángulo positivo = horario en pantalla). */
export function rotation(rad: number): Mat3 {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return new Float32Array([c, s, 0, -s, c, 0, 0, 0, 1])
}

/** Multiplica una lista de matrices de izquierda a derecha. */
export function chain(...ms: Mat3[]): Mat3 {
  return ms.reduce((acc, m) => multiply(acc, m), identity())
}

export function transformPoint(m: Mat3, x: number, y: number): [number, number] {
  return [m[0] * x + m[3] * y + m[6], m[1] * x + m[4] * y + m[7]]
}

export function invert(m: Mat3): Mat3 {
  const [a, b, , c, d, , e, f] = m
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) return identity()
  const id = 1 / det
  return new Float32Array([
    d * id, -b * id, 0,
    -c * id, a * id, 0,
    (c * f - d * e) * id, (b * e - a * f) * id, 1
  ])
}
