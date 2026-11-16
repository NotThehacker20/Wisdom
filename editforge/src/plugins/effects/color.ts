import type { EffectManifest } from '@/core/effects'
import { COPY_GLSL } from './shared'

export const colorCorrection: EffectManifest = {
  id: 'color',
  name: 'Corrección de color',
  category: 'Color',
  kind: 'pixel',
  params: [
    { name: 'exposure', label: 'Exposición', type: 'number', default: 0, min: -5, max: 5, step: 0.01, unit: 'EV', decimals: 2 },
    { name: 'contrast', label: 'Contraste', type: 'number', default: 0, min: -100, max: 100, step: 0.5, decimals: 0 },
    { name: 'saturation', label: 'Saturación', type: 'number', default: 0, min: -100, max: 100, step: 0.5, decimals: 0 },
    { name: 'temperature', label: 'Temperatura', type: 'number', default: 0, min: -100, max: 100, step: 0.5, decimals: 0 },
    { name: 'tint', label: 'Matiz', type: 'number', default: 0, min: -100, max: 100, step: 0.5, decimals: 0 },
    { name: 'gamma', label: 'Gamma', type: 'number', default: 1, min: 0.2, max: 3, step: 0.01, decimals: 2 }
  ],
  presets: [
    { name: 'Cálido', values: { temperature: 35, saturation: 10, contrast: 8 } },
    { name: 'Frío', values: { temperature: -35, tint: 5, contrast: 10 } },
    { name: 'Blanco y negro', values: { saturation: -100, contrast: 20 } },
    { name: 'Punch', values: { contrast: 25, saturation: 30, exposure: 0.1 } }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  if (c.a <= 0.0) return c;
  vec3 col = c.rgb / c.a;
  col *= exp2(p_exposure);
  col *= vec3(1.0 + p_temperature * 0.002, 1.0 - p_tint * 0.002, 1.0 - p_temperature * 0.002);
  col = pow(max(col, 0.0), vec3(1.0 / p_gamma));
  col = (col - 0.5) * (1.0 + p_contrast / 100.0) + 0.5;
  col = mix(vec3(luma(col)), col, 1.0 + p_saturation / 100.0);
  return vec4(clamp(col, 0.0, 1.0) * c.a, c.a);
}`
}

const LUT_GLSL = /* glsl */ `
uniform highp sampler3D uLut;
uniform float uLutSize;
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  if (c.a <= 0.0) return c;
  vec3 col = clamp(c.rgb / c.a, 0.0, 1.0);
  vec3 coord = (col * (uLutSize - 1.0) + 0.5) / uLutSize;
  vec3 g = texture(uLut, coord).rgb;
  return vec4(mix(col, g, p_intensity / 100.0) * c.a, c.a);
}`

export const lut: EffectManifest = {
  id: 'lut',
  name: 'LUT (.cube)',
  category: 'Color',
  kind: 'pixel',
  params: [
    { name: 'file', label: 'Archivo .cube', type: 'file', default: '', extensions: ['cube'] },
    { name: 'intensity', label: 'Intensidad', type: 'number', default: 100, min: 0, max: 100, step: 0.5, unit: '%', decimals: 0 }
  ],
  render: (api, input, output, p) => {
    const path = p.$strings?.file ?? ''
    const tex = path ? (api.lut(path) as { size: number } | null) : null
    if (!tex) {
      api.pass(COPY_GLSL, { uTex: input }, output)
      return
    }
    api.pass(LUT_GLSL, { uTex: input, uLut: tex }, output, { uLutSize: tex.size })
  }
}

export const vignette: EffectManifest = {
  id: 'vignette',
  name: 'Viñeta',
  category: 'Color',
  kind: 'pixel',
  params: [
    { name: 'amount', label: 'Cantidad', type: 'number', default: 0.6, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'size', label: 'Tamaño', type: 'number', default: 0.9, min: 0, max: 2, step: 0.005, decimals: 2 },
    { name: 'softness', label: 'Suavidad', type: 'number', default: 0.6, min: 0, max: 1.5, step: 0.005, decimals: 2 },
    { name: 'roundness', label: 'Redondez', type: 'number', default: 1, min: 0, max: 1, step: 0.005, decimals: 2 }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= mix(1.0, uSize.x / uSize.y, p_roundness);
  float d = length(p) / mix(1.0, max(1.0, uSize.x / uSize.y), p_roundness);
  float v = 1.0 - smoothstep(p_size - p_softness * 0.5, p_size + p_softness * 0.5, d);
  return vec4(c.rgb * mix(1.0, v, p_amount), c.a);
}`
}

export default [colorCorrection, lut, vignette]
