import type { EffectRuntime } from './EffectRuntime'
import type { RenderTarget, TargetPool } from './targets'

/**
 * Flujo óptico sencillo para cámara lenta (interpolación de fotogramas):
 *  1. Luminancia de A y B a 1/4 de resolución.
 *  2. Flujo A→B en la rejilla de A y B→A en la de B: correspondencia de
 *     bloques (±6 texels, parche 3×3) con preferencia por el movimiento
 *     pequeño. En zonas lisas gana el desplazamiento 0 (sin ambigüedad).
 *  3. Proyección al instante α: cada píxel p prueba el vector que llega desde
 *     A (punto fijo f = fA(p − f·α)) y el que llega desde B
 *     (f = −fB(p + f·(1−α))) y se queda con el que mejor casa A(p − f·α) con
 *     B(p + f·(1−α)). Así un objeto que se mueve sobre un fondo liso aparece
 *     entero a mitad de camino.
 *  4. Deformación y mezcla de A y B con ese vector.
 * «Sencillo»: sin pirámide multiescala (movimientos de hasta ~24 px por
 * fotograma a resolución completa) ni tratamiento de oclusiones.
 */
const LUMA = /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv + uTexel * vec2(-0.75, -0.75)) + texture(uTex, uv + uTexel * vec2(0.75, -0.75))
         + texture(uTex, uv + uTexel * vec2(-0.75, 0.75)) + texture(uTex, uv + uTexel * vec2(0.75, 0.75));
  return vec4(vec3(luma(c.rgb * 0.25)), 1.0);
}`

/** Flujo de uP (rejilla) hacia uQ. */
const SEARCH = /* glsl */ `
uniform sampler2D uP;
uniform sampler2D uQ;
uniform vec2 uST;
float patchCost(vec2 uv, vec2 d) {
  float s = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * uST * 1.5;
      s += abs(texture(uP, uv + o).r - texture(uQ, uv + o + d).r);
    }
  return s;
}
vec4 effect(vec2 uv) {
  float best = 1e9;
  vec2 bd = vec2(0.0);
  for (int y = -6; y <= 6; y++)
    for (int x = -6; x <= 6; x++) {
      vec2 d = vec2(float(x), float(y));
      float s = patchCost(uv, d * uST) + 0.004 * dot(d, d);
      if (s < best) { best = s; bd = d; }
    }
  return vec4(bd / 12.0 + 0.5, 0.0, 1.0);
}`

/** Proyección del flujo al instante intermedio uMix. */
const PROJECT = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uFA;
uniform sampler2D uFB;
uniform vec2 uST;
uniform vec2 uFSize; // (uSize ya existe en la cabecera común)
uniform float uMix;
vec2 fetchF(sampler2D f, vec2 uv) {
  vec2 q = (floor(uv * uFSize) + 0.5) / uFSize;
  return (texture(f, q).rg - 0.5) * 12.0 * uST;
}
float cost(vec2 uv, vec2 f) {
  float s = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * uST * 1.5;
      s += abs(texture(uA, uv + o - f * uMix).r - texture(uB, uv + o + f * (1.0 - uMix)).r);
    }
  return s;
}
vec4 effect(vec2 uv) {
  vec2 fa = fetchF(uFA, uv);
  vec2 fb = -fetchF(uFB, uv);
  for (int i = 0; i < 4; i++) {
    fa = fetchF(uFA, uv - fa * uMix);
    fb = -fetchF(uFB, uv + fb * (1.0 - uMix));
  }
  vec2 f = cost(uv, fa) <= cost(uv, fb) ? fa : fb;
  return vec4(f / uST / 12.0 + 0.5, 0.0, 1.0); // texels de 1/4, codificados como en SEARCH
}`

const WARP = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uFlow;
uniform vec2 uST;
uniform float uMix;
uniform vec2 uFlowSize;
vec4 effect(vec2 uv) {
  // Vecino más cercano: interpolar vectores en los bordes de un objeto en movimiento lo emborrona.
  vec2 fuv = (floor(uv * uFlowSize) + 0.5) / uFlowSize;
  vec2 f = (texture(uFlow, fuv).rg - 0.5) * 12.0 * uST;
  vec4 a = texture(uA, uv - f * uMix);
  vec4 b = texture(uB, uv + f * (1.0 - uMix));
  return mix(a, b, uMix);
}`

export function flowInterpolate(rt: EffectRuntime, pool: TargetPool, a: RenderTarget, b: RenderTarget, out: RenderTarget, frac: number): void {
  const common = { time: 0, size: [a.w, a.h] as [number, number], pxScale: 1, edge: 3 }
  const sw = Math.max(4, Math.round(a.w / 4))
  const sh = Math.max(4, Math.round(a.h / 4))
  const la = pool.get(sw, sh)
  const lb = pool.get(sw, sh)
  const fa = pool.get(sw, sh)
  const fb = pool.get(sw, sh)
  const flow = pool.get(sw, sh)
  try {
    rt.runPass(null, LUMA, { uTex: a }, la, common)
    rt.runPass(null, LUMA, { uTex: b }, lb, common)
    const st = [1 / sw, 1 / sh]
    rt.runPass(null, SEARCH, { uP: la, uQ: lb }, fa, common, {}, { uST: st })
    rt.runPass(null, SEARCH, { uP: lb, uQ: la }, fb, common, {}, { uST: st })
    rt.runPass(null, PROJECT, { uA: la, uB: lb, uFA: fa, uFB: fb }, flow, common, {}, { uST: st, uFSize: [sw, sh], uMix: frac })
    rt.runPass(null, WARP, { uA: a, uB: b, uFlow: flow }, out, common, {}, { uST: st, uMix: frac, uFlowSize: [sw, sh] })
  } finally {
    for (const t of [la, lb, fa, fb, flow]) pool.release(t)
  }
}
