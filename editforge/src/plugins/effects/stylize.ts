import type { EffectManifest } from '@/core/effects'
import { gaussianBlur } from './shared'

export const rgbSplit: EffectManifest = {
  id: 'rgbSplit',
  name: 'RGB split',
  category: 'Estilizar',
  description: 'Aberración cromática: separa los canales rojo y azul.',
  kind: 'pixel',
  params: [
    { name: 'amount', label: 'Separación', type: 'number', default: 8, min: 0, max: 200, step: 0.1, unit: 'px', decimals: 1 },
    { name: 'angle', label: 'Ángulo', type: 'number', default: 0, min: -360, max: 360, step: 0.5, unit: '°', decimals: 0 }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  float a = radians(p_angle);
  vec2 d = fromPx(vec2(cos(a), sin(a)) * p_amount) - fromPx(vec2(0.0));
  vec4 r = sampleEdge(uv + d);
  vec4 g = texture(uTex, uv);
  vec4 b = sampleEdge(uv - d);
  return vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
}`
}

const BRIGHT_GLSL = /* glsl */ `
uniform float uThreshold;
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  float k = smoothstep(uThreshold, uThreshold + 0.15, luma(c.rgb));
  return c * k;
}`

const GLOW_MIX_GLSL = /* glsl */ `
uniform sampler2D uGlow;
uniform float uIntensity;
uniform vec3 uTint;
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  vec4 g = texture(uGlow, uv) * uIntensity;
  vec3 col = c.rgb + g.rgb * uTint;
  float a = clamp(max(c.a, g.a), 0.0, 1.0);
  return vec4(min(col, vec3(a)), a);
}`

export const glow: EffectManifest = {
  id: 'glow',
  name: 'Glow',
  category: 'Estilizar',
  kind: 'pixel',
  params: [
    { name: 'threshold', label: 'Umbral', type: 'number', default: 0.6, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'radius', label: 'Radio', type: 'number', default: 30, min: 0, max: 300, step: 0.2, unit: 'px', decimals: 1 },
    { name: 'intensity', label: 'Intensidad', type: 'number', default: 1.2, min: 0, max: 8, step: 0.01, decimals: 2 },
    { name: 'tint', label: 'Color', type: 'color', default: '#ffffff' }
  ],
  presets: [
    { name: 'Suave', values: { threshold: 0.5, radius: 40, intensity: 0.8 } },
    { name: 'Neón', values: { threshold: 0.3, radius: 25, intensity: 2.5 } },
    { name: 'Sueño', values: { threshold: 0.15, radius: 80, intensity: 1 } }
  ],
  render: (api, input, output, p) => {
    const w = Math.max(1, Math.round(api.width / 2))
    const h = Math.max(1, Math.round(api.height / 2))
    const bright = api.temp(w, h)
    api.pass(BRIGHT_GLSL, { uTex: input }, bright, { uThreshold: p.threshold })
    const blurred = api.temp(w, h)
    // El brillo se desenfoca a media resolución (radio en píxeles de esa textura).
    gaussianBlur(api, bright, blurred, (p.radius * api.pxScale) / 2, [w, h])
    api.pass(GLOW_MIX_GLSL, { uTex: input, uGlow: blurred }, output, { uIntensity: p.intensity, uTint: hexToRgb(p.$strings?.tint ?? '#ffffff') })
  }
}

export const flash: EffectManifest = {
  id: 'flash',
  name: 'Flash',
  category: 'Estilizar',
  description: 'Destello: anima la intensidad (o usa el preset) para un golpe de luz.',
  kind: 'pixel',
  params: [
    { name: 'intensity', label: 'Intensidad', type: 'number', default: 0.8, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'color', label: 'Color', type: 'color', default: '#ffffff' }
  ],
  presets: [
    { name: 'Destello rápido', values: { intensity: [[0, 1], [0.25, 0, 'easeOut']] } },
    { name: 'Destello largo', values: { intensity: [[0, 1], [0.8, 0, 'easeInOut']] } }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  return mix(c, vec4(p_color * c.a, c.a), p_intensity);
}`
}

export const pixelate: EffectManifest = {
  id: 'pixelate',
  name: 'Pixelar',
  category: 'Estilizar',
  kind: 'pixel',
  params: [{ name: 'size', label: 'Tamaño', type: 'number', default: 16, min: 1, max: 300, step: 0.2, unit: 'px', decimals: 0 }],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 cell = max(p_size * uPxScale, 1.0) / uResolution;
  return texture(uTex, (floor(uv / cell) + 0.5) * cell);
}`
}

export const grain: EffectManifest = {
  id: 'grain',
  name: 'Ruido / grano',
  category: 'Estilizar',
  kind: 'pixel',
  params: [
    { name: 'amount', label: 'Cantidad', type: 'number', default: 0.12, min: 0, max: 1, step: 0.002, decimals: 3 },
    { name: 'size', label: 'Tamaño', type: 'number', default: 1.5, min: 0.5, max: 8, step: 0.01, unit: 'px', decimals: 1 },
    { name: 'speed', label: 'Velocidad', type: 'number', default: 24, min: 0, max: 60, step: 0.1, unit: 'fps', decimals: 0 }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  vec2 cell = floor(uv * uResolution / max(p_size * uPxScale, 1.0));
  float n = hash12(cell + floor(uTime * p_speed) * 17.31) - 0.5;
  return vec4(clamp(c.rgb + n * p_amount * c.a, 0.0, c.a), c.a);
}`
}

export const glitch: EffectManifest = {
  id: 'glitch',
  name: 'Glitch',
  category: 'Estilizar',
  kind: 'pixel',
  params: [
    { name: 'amount', label: 'Cantidad', type: 'number', default: 0.35, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'block', label: 'Bloque', type: 'number', default: 24, min: 2, max: 400, step: 0.5, unit: 'px', decimals: 0 },
    { name: 'speed', label: 'Velocidad', type: 'number', default: 12, min: 0, max: 60, step: 0.1, unit: 'Hz', decimals: 1 },
    { name: 'rgb', label: 'RGB', type: 'number', default: 12, min: 0, max: 200, step: 0.1, unit: 'px', decimals: 1 },
    { name: 'seed', label: 'Semilla', type: 'number', default: 1, min: 0, max: 999, step: 1, decimals: 0 }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 px = toPx(uv);
  float tt = floor(uTime * p_speed) + p_seed * 13.0;
  float row = floor(px.y / max(p_block, 1.0));
  float on = step(1.0 - p_amount, hash12(vec2(row, tt)));
  float shift = (hash12(vec2(row * 1.7, tt * 3.1)) - 0.5) * p_block * 8.0 * on;
  vec2 q = fromPx(px + vec2(shift, 0.0));
  vec2 d = fromPx(vec2(p_rgb * (on + 0.15) * p_amount, 0.0)) - fromPx(vec2(0.0));
  vec4 cr = sampleEdge(q + d);
  vec4 cg = sampleEdge(q);
  vec4 cb = sampleEdge(q - d);
  return vec4(cr.r, cg.g, cb.b, max(cg.a, max(cr.a, cb.a)));
}`
}

export const vhs: EffectManifest = {
  id: 'vhs',
  name: 'VHS',
  category: 'Estilizar',
  kind: 'pixel',
  params: [
    { name: 'amount', label: 'Cantidad', type: 'number', default: 0.7, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'scanlines', label: 'Líneas', type: 'number', default: 0.35, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'noise', label: 'Ruido', type: 'number', default: 0.2, min: 0, max: 1, step: 0.005, decimals: 2 },
    { name: 'bleed', label: 'Sangrado de color', type: 'number', default: 6, min: 0, max: 60, step: 0.1, unit: 'px', decimals: 1 }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 px = toPx(uv);
  float wob = (noise2(vec2(px.y * 0.02, uTime * 4.0)) - 0.5) * 6.0 * p_amount;
  float bar = smoothstep(0.0, 0.04, abs(fract(uv.y * 0.5 + uTime * 0.15) - 0.5) - 0.42);
  px.x += wob + (1.0 - bar) * 14.0 * p_amount;
  vec2 q = fromPx(px);
  vec2 d = fromPx(vec2(p_bleed * p_amount, 0.0)) - fromPx(vec2(0.0));
  vec4 c = sampleEdge(q);
  vec3 col = vec3(sampleEdge(q + d).r, c.g, sampleEdge(q - d).b);
  float s = 0.5 + 0.5 * sin(px.y * 3.14159 * 0.5 * uPxScale);
  col *= 1.0 - p_scanlines * 0.35 * s;
  col += (hash12(px + uTime * 91.7) - 0.5) * p_noise * 0.5;
  col = mix(col, col * vec3(1.05, 0.97, 1.08), p_amount);
  return vec4(clamp(col, 0.0, c.a), c.a);
}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [1, 1, 1]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export default [rgbSplit, glow, flash, pixelate, grain, glitch, vhs]
