import type { EffectManifest } from '@/core/effects'
import { EDGES_PARAM } from './shared'

export const wave: EffectManifest = {
  id: 'wave',
  name: 'Ondas',
  category: 'Distorsión',
  kind: 'pixel',
  params: [
    { name: 'amplitude', label: 'Amplitud', type: 'number', default: 20, min: 0, max: 300, step: 0.2, unit: 'px', decimals: 1 },
    { name: 'wavelength', label: 'Longitud', type: 'number', default: 200, min: 4, max: 4000, step: 1, unit: 'px', decimals: 0 },
    { name: 'speed', label: 'Velocidad', type: 'number', default: 1, min: -20, max: 20, step: 0.01, unit: 'Hz', decimals: 2 },
    { name: 'angle', label: 'Dirección', type: 'number', default: 90, min: -360, max: 360, step: 0.5, unit: '°', decimals: 0 },
    EDGES_PARAM
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 px = toPx(uv);
  float a = radians(p_angle);
  vec2 dir = vec2(cos(a), sin(a));
  float ph = (dot(px, dir) / p_wavelength + uTime * p_speed) * 6.2831853;
  vec2 off = vec2(-dir.y, dir.x) * sin(ph) * p_amplitude;
  return sampleEdge(fromPx(px + off));
}`
}

export default [wave]
