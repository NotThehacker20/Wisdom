import { evalEffectParams, type EffectContext, type EffectManifest, type EffectRenderAPI } from '@/core/effects'
import type { TransitionManifest } from '@/core/transitions'
import type { EffectInstance, TransitionInstance } from '@/core/types'
import { createProgram, type Program } from '../gl'
import type { LutCache, LutTexture } from './lut'
import type { RenderTarget, TargetPool } from './targets'

export const PASS_VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  gl_Position = vec4(aPos * 2.0, 0.0, 1.0);
  vUv = aPos + 0.5;
}`

/**
 * Cabecera común de todos los shaders de efecto. Convenciones:
 *  - vUv/uv en 0..1 con y hacia arriba (texturas de render GL).
 *  - toPx/fromPx convierten a píxeles de proyecto centrados con y hacia abajo,
 *    así los parámetros en px significan lo mismo a cualquier calidad.
 *  - sampleEdge respeta uEdge: 0 transparente, 1 espejo, 2 mosaico, 3 borde.
 */
const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uTexel;
uniform vec2 uSize;
uniform float uPxScale;
uniform float uTime;
uniform float uEdge;

vec2 toPx(vec2 uv) { return (uv - 0.5) * uSize * vec2(1.0, -1.0); }
vec2 fromPx(vec2 p) { return p / (uSize * vec2(1.0, -1.0)) + 0.5; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
vec4 sampleMirror(sampler2D s, vec2 uv) { return texture(s, 1.0 - abs(1.0 - mod(uv, 2.0))); }
vec4 sampleEdge(vec2 uv) {
  if (uEdge < 0.5) {
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
    return texture(uTex, uv);
  }
  if (uEdge < 1.5) uv = 1.0 - abs(1.0 - mod(uv, 2.0));
  else if (uEdge < 2.5) uv = fract(uv);
  return texture(uTex, uv);
}
`

/** Cabecera adicional de las transiciones: A (uFrom) → B (uTo) con progreso uProgress. */
const TRANSITION_HEADER = /* glsl */ `
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
vec4 getFrom(vec2 uv) { return sampleMirror(uFrom, uv); }
vec4 getTo(vec2 uv) { return sampleMirror(uTo, uv); }
`

type Input = RenderTarget | LutTexture | WebGLTexture
type Manifestish = { id: string; params: EffectManifest['params'] }

/** Compila y ejecuta los shaders de los efectos (manifiestos) sobre render targets. */
export class EffectRuntime {
  private programs = new Map<string, Program>()

  constructor(
    private gl: WebGL2RenderingContext,
    private quad: WebGLVertexArrayObject,
    private pool: TargetPool,
    private luts: LutCache
  ) {}

  private program(m: Manifestish | null, glsl: string, transition = false): Program {
    const key = `${transition ? 'T' : 'E'}${m?.id ?? ''}\u0000${glsl}`
    let p = this.programs.get(key)
    if (!p) {
      const decls = (m?.params ?? [])
        .map((d) => (d.type === 'color' ? `uniform vec3 p_${d.name};` : d.type === 'file' ? '' : `uniform float p_${d.name};`))
        .join('\n')
      const src = transition
        ? `${HEADER}${TRANSITION_HEADER}\n${decls}\n${glsl}\nvoid main() { outColor = transition(vUv, uProgress); }`
        : `${HEADER}\n${decls}\n${glsl}\nvoid main() { outColor = effect(vUv); }`
      p = createProgram(this.gl, PASS_VS, src)
      this.programs.set(key, p)
    }
    return p
  }

  /**
   * Ejecuta un pase. `common` son los uniforms del contexto (tiempo, tamaño…)
   * y `params` los parámetros evaluados del efecto.
   */
  runPass(
    m: Manifestish | null,
    glsl: string,
    inputs: Record<string, Input>,
    output: RenderTarget | null,
    common: { time: number; size: [number, number]; pxScale: number; edge: number; outW?: number; outH?: number },
    params: Record<string, number | number[]> = {},
    extra: Record<string, number | number[]> = {},
    transition = false,
    /** Mezclar el resultado (alfa premultiplicado) sobre lo que ya hay en la salida. */
    blend = false
  ): void {
    const gl = this.gl
    const prog = this.program(m, glsl, transition)
    const w = output ? output.w : (common.outW ?? 1)
    const h = output ? output.h : (common.outH ?? 1)
    gl.bindFramebuffer(gl.FRAMEBUFFER, output ? output.fbo : null)
    gl.viewport(0, 0, w, h)
    if (blend) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    } else gl.disable(gl.BLEND)
    gl.useProgram(prog.program)
    let unit = 0
    let texel: [number, number] = [1 / w, 1 / h]
    for (const [name, inp] of Object.entries(inputs)) {
      const loc = prog.uniforms[name]
      if (loc === undefined || loc === null) continue
      gl.activeTexture(gl.TEXTURE0 + unit)
      if ((inp as LutTexture).target === 'lut') gl.bindTexture(gl.TEXTURE_3D, (inp as LutTexture).tex)
      else if ((inp as RenderTarget).fbo) {
        const rt = inp as RenderTarget
        gl.bindTexture(gl.TEXTURE_2D, rt.tex)
        if (name === 'uTex') texel = [1 / rt.w, 1 / rt.h]
      } else gl.bindTexture(gl.TEXTURE_2D, inp as WebGLTexture)
      gl.uniform1i(loc, unit)
      unit++
    }
    const u = prog.uniforms
    gl.uniform2f(u.uResolution, w, h)
    gl.uniform2f(u.uTexel, texel[0], texel[1])
    gl.uniform2f(u.uSize, common.size[0], common.size[1])
    gl.uniform1f(u.uPxScale, common.pxScale)
    gl.uniform1f(u.uTime, common.time)
    gl.uniform1f(u.uEdge, common.edge)
    const setU = (name: string, v: number | number[]) => {
      const loc = u[name]
      if (!loc) return
      if (typeof v === 'number') gl.uniform1f(loc, v)
      else if (v.length === 2) gl.uniform2fv(loc, v)
      else if (v.length === 3) gl.uniform3fv(loc, v)
      else if (v.length === 4) gl.uniform4fv(loc, v)
      else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v)
    }
    for (const [k, v] of Object.entries(params)) setU(`p_${k}`, v)
    for (const [k, v] of Object.entries(extra)) setU(k, v)
    gl.bindVertexArray(this.quad)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
  }

  /** Aplica un efecto de píxel de `input` a `output` (mismo tamaño). */
  apply(fx: EffectInstance, m: EffectManifest, input: RenderTarget, output: RenderTarget, ctx: EffectContext, size: [number, number], pxScale: number): void {
    const p = evalEffectParams(fx, ctx.t)
    const params: Record<string, number | number[]> = {}
    for (const d of m.params) {
      if (d.type === 'color') params[d.name] = hexToRgb(p.$strings?.[d.name] ?? String(d.default))
      else if (d.type !== 'file') params[d.name] = p[d.name]
    }
    const edge = 'edges' in p ? Math.round(p.edges) : 3
    const common = { time: ctx.t, size, pxScale, edge }
    if (m.glsl) {
      this.runPass(m, m.glsl, { uTex: input }, output, common, params)
      return
    }
    const temps: RenderTarget[] = []
    const api: EffectRenderAPI = {
      width: output.w,
      height: output.h,
      pxScale,
      temp: (w = output.w, h = output.h) => {
        const t = this.pool.get(w, h)
        temps.push(t)
        return t
      },
      pass: (glsl, inputs, out, uniforms) => this.runPass(m, glsl, inputs as Record<string, Input>, out as RenderTarget, { ...common, edge: 3 }, params, uniforms),
      lut: (path) => this.luts.get(path)
    }
    try {
      m.render!(api, input, output, p, ctx)
    } finally {
      temps.forEach((t) => this.pool.release(t))
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const mm = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!mm) return [1, 1, 1]
  const n = parseInt(mm[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Ejecuta una transición: mezcla `from` (A) y `to` (B) en `output` con progreso `progress` (ya con curva). */
export function runTransition(
  rt: EffectRuntime,
  m: TransitionManifest,
  trans: TransitionInstance,
  from: RenderTarget,
  to: RenderTarget,
  output: RenderTarget,
  progress: number,
  localTime: number,
  size: [number, number],
  pxScale: number
): void {
  const params: Record<string, number | number[]> = {}
  for (const d of m.params) {
    if (d.type === 'color') params[d.name] = hexToRgb(trans.strings?.[d.name] ?? String(d.default))
    else if (d.type !== 'file') params[d.name] = trans.params[d.name] ?? Number(d.default)
  }
  // Se mezcla directamente sobre la composición: sin textura intermedia ni pase de copia.
  rt.runPass(m, m.glsl ?? '', { uFrom: from, uTo: to }, output, { time: localTime, size, pxScale, edge: 1, outW: output.w, outH: output.h }, params, { uProgress: progress }, true, true)
}
