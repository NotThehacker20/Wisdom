import type { EffectManifest } from '@/core/effects'
import { gaussianBlur } from './shared'

export const gaussian: EffectManifest = {
  id: 'blur',
  name: 'Desenfoque gaussiano',
  category: 'Desenfoque',
  kind: 'pixel',
  params: [{ name: 'radius', label: 'Radio', type: 'number', default: 10, min: 0, max: 300, step: 0.2, unit: 'px', decimals: 1 }],
  render: (api, input, output, p) => gaussianBlur(api, input, output, p.radius * api.pxScale)
}

export const radialBlur: EffectManifest = {
  id: 'radialBlur',
  name: 'Desenfoque radial / zoom',
  category: 'Desenfoque',
  kind: 'pixel',
  params: [
    { name: 'mode', label: 'Tipo', type: 'enum', default: 0, options: ['Zoom', 'Giro'] },
    { name: 'amount', label: 'Cantidad', type: 'number', default: 15, min: 0, max: 100, step: 0.2, decimals: 1 },
    { name: 'centerX', label: 'Centro X', type: 'number', default: 0, min: -5000, max: 5000, step: 1, unit: 'px', decimals: 0 },
    { name: 'centerY', label: 'Centro Y', type: 'number', default: 0, min: -5000, max: 5000, step: 1, unit: 'px', decimals: 0 }
  ],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 c = vec2(p_centerX, p_centerY);
  vec2 d = toPx(uv) - c;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 32; i++) {
    float f = float(i) / 31.0 - 0.5;
    vec2 q;
    if (p_mode < 0.5) {
      q = c + d * (1.0 - f * p_amount / 50.0);
    } else {
      float a = f * radians(p_amount);
      q = c + mat2(cos(a), sin(a), -sin(a), cos(a)) * d;
    }
    acc += sampleEdge(fromPx(q));
  }
  return acc / 32.0;
}`
}

export const sharpen: EffectManifest = {
  id: 'sharpen',
  name: 'Enfocar',
  category: 'Desenfoque',
  kind: 'pixel',
  params: [{ name: 'amount', label: 'Cantidad', type: 'number', default: 0.8, min: 0, max: 5, step: 0.01, decimals: 2 }],
  glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture(uTex, uv);
  vec4 n = texture(uTex, uv + vec2(uTexel.x, 0.0)) + texture(uTex, uv - vec2(uTexel.x, 0.0))
         + texture(uTex, uv + vec2(0.0, uTexel.y)) + texture(uTex, uv - vec2(0.0, uTexel.y));
  vec4 o = c + (c - n * 0.25) * p_amount;
  return vec4(clamp(o.rgb, 0.0, o.a), c.a);
}`
}

export default [gaussian, radialBlur, sharpen]
