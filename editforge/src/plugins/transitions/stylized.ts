import type { TransitionManifest } from '@/core/transitions'

export const spin: TransitionManifest = {
  id: 'spin',
  name: 'Spin',
  params: [
    { name: 'angle', label: 'Giro', type: 'number', default: 360, min: -1080, max: 1080, step: 1, unit: '°', decimals: 0 },
    { name: 'zoom', label: 'Zoom', type: 'number', default: 0.4, min: 0, max: 2, step: 0.01, decimals: 2 },
    { name: 'blur', label: 'Desenfoque', type: 'number', default: 1, min: 0, max: 3, step: 0.01, decimals: 2 }
  ],
  ease: 'easeInOutExpo',
  duration: 0.5,
  glsl: /* glsl */ `
vec4 rot(sampler2D s, vec2 uv, float ang, float scale) {
  vec2 q = toPx(uv) / scale;
  float c = cos(ang), si = sin(ang);
  return sampleMirror(s, fromPx(mat2(c, -si, si, c) * q));
}
vec4 transition(vec2 uv, float p) {
  float k = sin(3.14159 * p);
  float total = radians(p_angle);
  float scale = 1.0 + k * p_zoom;
  float spread = k * 0.08 * p_blur * sign(total);
  bool toB = p >= 0.5;
  float ang = toB ? total * (p - 1.0) : total * p;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 20; i++) {
    float f = (float(i) / 19.0 - 0.5) * spread * 6.2831;
    acc += toB ? rot(uTo, uv, ang + f, scale) : rot(uFrom, uv, ang + f, scale);
  }
  return acc / 20.0;
}`
}

export const glitch: TransitionManifest = {
  id: 'glitch',
  name: 'Glitch',
  params: [
    { name: 'amount', label: 'Cantidad', type: 'number', default: 1, min: 0, max: 2, step: 0.01, decimals: 2 },
    { name: 'block', label: 'Bloque', type: 'number', default: 40, min: 4, max: 400, step: 1, unit: 'px', decimals: 0 }
  ],
  ease: 'linear',
  duration: 0.4,
  glsl: /* glsl */ `
vec4 transition(vec2 uv, float p) {
  float k = sin(3.14159 * p) * p_amount;
  vec2 px = toPx(uv);
  float tt = floor(uTime * 24.0);
  float row = floor(px.y / p_block);
  float r = hash12(vec2(row, tt));
  float shift = (hash12(vec2(row * 3.1, tt + 7.0)) - 0.5) * p_block * 10.0 * k * step(0.5, r);
  vec2 q = fromPx(px + vec2(shift, 0.0));
  // Cada fila cambia a B en un momento distinto.
  bool useB = hash12(vec2(row * 1.3, 11.0)) < p;
  vec2 d = fromPx(vec2(30.0 * k, 0.0)) - fromPx(vec2(0.0));
  vec4 c = useB ? getTo(q) : getFrom(q);
  float rr = (useB ? getTo(q + d) : getFrom(q + d)).r;
  float bb = (useB ? getTo(q - d) : getFrom(q - d)).b;
  return vec4(rr, c.g, bb, c.a);
}`
}

export const shake: TransitionManifest = {
  id: 'shake',
  name: 'Shake',
  description: 'Temblor fuerte con golpe de zoom en el corte.',
  params: [
    { name: 'amplitude', label: 'Amplitud', type: 'number', default: 50, min: 0, max: 400, step: 0.5, unit: 'px', decimals: 0 },
    { name: 'frequency', label: 'Frecuencia', type: 'number', default: 22, min: 1, max: 60, step: 0.1, unit: 'Hz', decimals: 1 },
    { name: 'zoom', label: 'Golpe de zoom', type: 'number', default: 0.12, min: 0, max: 1, step: 0.005, decimals: 3 }
  ],
  ease: 'linear',
  duration: 0.4,
  glsl: /* glsl */ `
vec2 shakeOff(float ft) {
  vec2 n = vec2(noise2(vec2(ft, 3.7)) + 0.5 * noise2(vec2(ft * 2.1, 5.3)), noise2(vec2(ft, 9.1)) + 0.5 * noise2(vec2(ft * 2.1, 1.9)));
  return (n / 1.5 - 0.5) * 4.0;
}
vec4 transition(vec2 uv, float p) {
  float k = sin(3.14159 * p);
  float ft = uTime * p_frequency;
  vec2 off = shakeOff(ft) * p_amplitude * k;
  float sc = 1.0 + p_zoom * k;
  vec2 q = fromPx((toPx(uv) + off) / sc);
  vec2 q2 = fromPx((toPx(uv) + shakeOff(ft - 0.35) * p_amplitude * k) / sc);
  float m = smoothstep(0.4, 0.6, p);
  return mix(mix(getFrom(q), getTo(q), m), mix(getFrom(q2), getTo(q2), m), 0.5);
}`
}

export const rgbSplit: TransitionManifest = {
  id: 'rgbSplit',
  name: 'RGB split',
  params: [
    { name: 'amount', label: 'Separación', type: 'number', default: 60, min: 0, max: 400, step: 0.5, unit: 'px', decimals: 0 },
    { name: 'angle', label: 'Ángulo', type: 'number', default: 0, min: -360, max: 360, step: 0.5, unit: '°', decimals: 0 }
  ],
  ease: 'easeInOut',
  duration: 0.4,
  glsl: /* glsl */ `
vec4 mixAt(vec2 q, float m) { return mix(getFrom(q), getTo(q), m); }
vec4 transition(vec2 uv, float p) {
  float k = sin(3.14159 * p);
  float a = radians(p_angle);
  vec2 d = fromPx(vec2(cos(a), sin(a)) * p_amount * k) - fromPx(vec2(0.0));
  float m = smoothstep(0.3, 0.7, p);
  vec4 c = mixAt(uv, m);
  return vec4(mixAt(uv + d, m).r, c.g, mixAt(uv - d, m).b, c.a);
}`
}

export const inkWipe: TransitionManifest = {
  id: 'inkWipe',
  name: 'Tinta / máscara',
  description: 'Máscara orgánica de tinta, barrido lineal o círculo.',
  params: [
    { name: 'mode', label: 'Forma', type: 'enum', default: 0, options: ['Tinta', 'Barrido', 'Círculo'] },
    { name: 'softness', label: 'Suavidad', type: 'number', default: 0.12, min: 0.005, max: 1, step: 0.005, decimals: 3 },
    { name: 'angle', label: 'Ángulo', type: 'number', default: 0, min: -360, max: 360, step: 0.5, unit: '°', decimals: 0 },
    { name: 'scale', label: 'Escala tinta', type: 'number', default: 4, min: 0.5, max: 20, step: 0.05, decimals: 2 }
  ],
  ease: 'easeInOut',
  duration: 0.8,
  glsl: /* glsl */ `
float fbm(vec2 q) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise2(q); q = q * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec4 transition(vec2 uv, float p) {
  vec2 px = toPx(uv);
  float v;
  if (p_mode < 0.5) {
    float r = length(px) / (0.5 * length(uSize));
    v = r * 0.65 + fbm(px / min(uSize.x, uSize.y) * p_scale) * 0.6;
  } else if (p_mode < 1.5) {
    float a = radians(p_angle);
    vec2 dir = vec2(cos(a), sin(a));
    float ext = 0.5 * (abs(dir.x) * uSize.x + abs(dir.y) * uSize.y);
    v = dot(px, dir) / ext * 0.5 + 0.5;
  } else {
    v = length(px) / (0.5 * length(uSize));
  }
  float s = p_softness;
  float top = (p_mode < 0.5 ? 1.25 : 1.0) + s;
  float m = smoothstep(v, v + s, p * top);
  return mix(getFrom(uv), getTo(uv), m);
}`
}

export default [spin, glitch, shake, rgbSplit, inkWipe]
