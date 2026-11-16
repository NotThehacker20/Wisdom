import type { EffectRenderAPI, ParamDef } from '@/core/effects'

/** Parámetro común: qué hacer con lo que queda fuera de la imagen al desplazarla. */
export const EDGES_PARAM: ParamDef = {
  name: 'edges',
  label: 'Bordes',
  type: 'enum',
  default: 1,
  options: ['Ninguno', 'Espejo', 'Mosaico']
}

export const COPY_GLSL = /* glsl */ `vec4 effect(vec2 uv) { return texture(uTex, uv); }`

/** Desenfoque gaussiano separable de 1 dimensión (uDir = (1,0) o (0,1)). */
export const BLUR1D_GLSL = /* glsl */ `
uniform vec2 uDir;
uniform float uRadius;
vec4 effect(vec2 uv) {
  float sigma = max(uRadius * 0.5, 0.5);
  float stepPx = max(1.0, uRadius / 12.0);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -12; i <= 12; i++) {
    float x = float(i) * stepPx;
    float w = exp(-0.5 * x * x / (sigma * sigma));
    acc += sampleEdge(uv + uDir * uTexel * x) * w;
    wsum += w;
  }
  return acc / wsum;
}`

/**
 * Desenfoque gaussiano de radio `radius` (en píxeles de destino). Para radios
 * grandes reduce la resolución antes de desenfocar (más rápido y sin bandas).
 */
export function gaussianBlur(api: EffectRenderAPI, input: unknown, output: unknown, radius: number, size: [number, number] = [api.width, api.height]): void {
  if (radius < 0.5) {
    api.pass(COPY_GLSL, { uTex: input }, output)
    return
  }
  const k = Math.max(1, Math.floor(radius / 12))
  const w = Math.max(1, Math.round(size[0] / k))
  const h = Math.max(1, Math.round(size[1] / k))
  let src = input
  if (k > 1) {
    src = api.temp(w, h)
    api.pass(COPY_GLSL, { uTex: input }, src)
  }
  const a = api.temp(w, h)
  const b = k > 1 ? api.temp(w, h) : output
  api.pass(BLUR1D_GLSL, { uTex: src }, a, { uDir: [1, 0], uRadius: radius / k })
  api.pass(BLUR1D_GLSL, { uTex: a }, b, { uDir: [0, 1], uRadius: radius / k })
  if (k > 1) api.pass(COPY_GLSL, { uTex: b }, output)
}
