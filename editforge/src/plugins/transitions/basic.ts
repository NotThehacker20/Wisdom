import type { TransitionManifest } from '@/core/transitions'

const DIRECTION = { name: 'direction', label: 'Dirección', type: 'enum' as const, default: 0, options: ['Izquierda', 'Derecha', 'Arriba', 'Abajo'] }
/** Vector de desplazamiento en uv (y hacia arriba en las texturas GL). */
const DIR_GLSL = /* glsl */ `
vec2 dirVec(float d) {
  if (d < 0.5) return vec2(1.0, 0.0);   // el contenido sale por la izquierda
  if (d < 1.5) return vec2(-1.0, 0.0);
  if (d < 2.5) return vec2(0.0, -1.0);  // sale por arriba
  return vec2(0.0, 1.0);
}`

export const crossfade: TransitionManifest = {
  id: 'crossfade',
  name: 'Disolver',
  params: [],
  ease: 'linear',
  glsl: /* glsl */ `vec4 transition(vec2 uv, float p) { return mix(getFrom(uv), getTo(uv), p); }`
}

const ZOOM_GLSL = (out: boolean) => /* glsl */ `
vec4 zblur(sampler2D s, vec2 uv, float scale, float blur) {
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float f = float(i) / 15.0;
    float sc = scale * (1.0 + blur * f * 0.25);
    acc += sampleMirror(s, 0.5 + (uv - 0.5) / sc);
  }
  return acc / 16.0;
}
vec4 transition(vec2 uv, float p) {
  float k = p < 0.5 ? p * 2.0 : (1.0 - p) * 2.0;
  float s = ${out ? '1.0 / (1.0 + k * p_strength)' : '1.0 + k * p_strength'};
  float b = k * p_blur;
  return mix(zblur(uFrom, uv, s, b), zblur(uTo, uv, s, b), smoothstep(0.45, 0.55, p));
}`

const ZOOM_PARAMS = [
  { name: 'strength', label: 'Intensidad', type: 'number' as const, default: 1, min: 0.1, max: 4, step: 0.01, decimals: 2 },
  { name: 'blur', label: 'Desenfoque', type: 'number' as const, default: 0.7, min: 0, max: 2, step: 0.01, decimals: 2 }
]

export const zoomIn: TransitionManifest = { id: 'zoomIn', name: 'Zoom in', params: ZOOM_PARAMS, ease: 'easeInOutExpo', duration: 0.4, glsl: ZOOM_GLSL(false) }
export const zoomOut: TransitionManifest = { id: 'zoomOut', name: 'Zoom out', params: ZOOM_PARAMS, ease: 'easeInOutExpo', duration: 0.4, glsl: ZOOM_GLSL(true) }

export const whipPan: TransitionManifest = {
  id: 'whipPan',
  name: 'Whip pan',
  description: 'Barrido rápido con desenfoque de movimiento.',
  params: [DIRECTION, { name: 'blur', label: 'Desenfoque', type: 'number', default: 1, min: 0, max: 3, step: 0.01, decimals: 2 }],
  ease: 'easeInOutExpo',
  duration: 0.35,
  glsl: /* glsl */ `${DIR_GLSL}
vec4 strip(vec2 uv, vec2 dir, float p) {
  vec2 qa = uv + dir * p;
  float ax = dot(qa, abs(dir));
  if (ax >= 0.0 && ax <= 1.0) return getFrom(qa);
  return getTo(uv + dir * (p - 1.0));
}
vec4 transition(vec2 uv, float p) {
  vec2 dir = dirVec(p_direction);
  float spread = sin(3.14159 * p) * 0.12 * p_blur;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 24; i++) {
    float f = float(i) / 23.0 - 0.5;
    acc += strip(uv, dir, clamp(p + f * spread, 0.0, 1.0));
  }
  return acc / 24.0;
}`
}

export const slide: TransitionManifest = {
  id: 'slide',
  name: 'Slide',
  params: [DIRECTION, { name: 'mode', label: 'Modo', type: 'enum', default: 0, options: ['Empujar', 'Cubrir'] }],
  ease: 'easeInOut',
  glsl: /* glsl */ `${DIR_GLSL}
vec4 transition(vec2 uv, float p) {
  vec2 dir = dirVec(p_direction);
  vec2 qb = uv + dir * (p - 1.0);
  float bx = dot(qb, abs(dir));
  if (bx >= 0.0 && bx <= 1.0) return getTo(qb);
  return p_mode < 0.5 ? getFrom(uv + dir * p) : getFrom(uv);
}`
}

export const flash: TransitionManifest = {
  id: 'flash',
  name: 'Flash',
  description: 'Destello de color en el corte.',
  params: [
    { name: 'color', label: 'Color', type: 'color', default: '#ffffff' },
    { name: 'hold', label: 'Mantener', type: 'number', default: 0.15, min: 0, max: 0.8, step: 0.005, decimals: 2 }
  ],
  ease: 'linear',
  duration: 0.4,
  glsl: /* glsl */ `
vec4 transition(vec2 uv, float p) {
  vec4 c = vec4(p_color, 1.0);
  float h = p_hold * 0.5;
  if (p < 0.5 - h) return mix(getFrom(uv), c, smoothstep(0.0, 0.5 - h, p));
  if (p > 0.5 + h) return mix(c, getTo(uv), smoothstep(0.5 + h, 1.0, p));
  return c;
}`
}

export const lumaFade: TransitionManifest = {
  id: 'lumaFade',
  name: 'Luma fade',
  description: 'Las zonas oscuras pasan primero (o las claras, invertido).',
  params: [
    { name: 'softness', label: 'Suavidad', type: 'number', default: 0.2, min: 0.01, max: 1, step: 0.005, decimals: 2 },
    { name: 'invert', label: 'Invertir', type: 'bool', default: 0 }
  ],
  ease: 'linear',
  duration: 0.8,
  glsl: /* glsl */ `
vec4 transition(vec2 uv, float p) {
  vec4 a = getFrom(uv);
  vec4 b = getTo(uv);
  float l = luma(a.rgb / max(a.a, 1e-4));
  if (p_invert > 0.5) l = 1.0 - l;
  float s = p_softness;
  float m = smoothstep(l, l + s, p * (1.0 + s));
  return mix(a, b, m);
}`
}

export default [crossfade, zoomIn, zoomOut, whipPan, slide, flash, lumaFade]
