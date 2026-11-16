import { activeEffects, resolveTraits, type LayerTraits } from '@/core/effects'
import { fitContain, indexClips, layerGeometry, restQuadMatrix, worldMatrix, type ClipIndex } from '@/core/layerTransform'
import { chain, invert, multiply, rotation as rot, scaling, translation, type Mat3 } from '@/core/mat3'
import { clipAt, sourceTime } from '@/core/project'
import { clampedSourceTime, easeProgress, getTransition, transitionAt } from '@/core/transitions'
import type { Clip, MediaAsset, Project, TransitionInstance } from '@/core/types'
import { createProgram, createQuad, createTexture, type Program } from './gl'
import { EffectRuntime, runTransition } from './gpu/EffectRuntime'
import { LutCache } from './gpu/lut'
import { TargetPool, type RenderTarget } from './gpu/targets'
import type { MediaPool } from './MediaPool'
import type { DecodedFrame } from './media/FrameSource'
import { LAYER_FS, LAYER_VS } from './shaders/layer'

export interface RenderOptions {
  playing: boolean
  /** Componer siempre en una textura (exportación: se lee con `output`). */
  offscreen?: boolean
}

interface Layer {
  clip: Clip
  asset?: MediaAsset
  localT: number
  frame: DecodedFrame | null
  /** Tiempo en el medio (limitado al material disponible durante las transiciones). */
  srcT?: number
  /** Si la capa es la mezcla de una transición: la capa B y los datos de la transición. */
  transition?: { b: Layer; trans: TransitionInstance; progress: number; localTime: number }
}

/** Elemento de render sin fotogramas (lo que devuelve collectLayers). */
export type LayerItem = Omit<Layer, 'frame' | 'transition'> & {
  transition?: { b: Omit<Layer, 'frame' | 'transition'>; trans: TransitionInstance; progress: number; localTime: number }
}

export interface RenderStats {
  layers: number
  ms: number
}

// Pases internos (misma convención que los efectos).
const COPY = /* glsl */ `vec4 effect(vec2 uv) { return texture(uTex, uv); }`
/** Normaliza la fuente (orientación de imagen + rotación de metadatos) a una textura de capa. */
const NORMALIZE = /* glsl */ `
uniform mat3 uUvM;
vec4 effect(vec2 uv) { return texture(uTex, (uUvM * vec3(uv.x, 1.0 - uv.y, 1.0)).xy); }`
/** Mezcla del resultado de una capa de ajuste con lo que había debajo según su opacidad. */
const ADJ_MIX = /* glsl */ `
uniform sampler2D uFx;
uniform float uOpacity;
vec4 effect(vec2 uv) { return mix(texture(uTex, uv), texture(uFx, uv), uOpacity); }`
/** Efectos de transformación sobre la composición (capa de ajuste con shake/zoom). */
const ADJ_TRANSFORM = /* glsl */ `
uniform mat3 uInv; // píxeles de proyecto destino → origen
vec4 effect(vec2 uv) { return sampleEdge(fromPx((uInv * vec3(toPx(uv), 1.0)).xy)); }`

const WRAP = (gl: WebGL2RenderingContext, edge: number) => (edge === 1 ? gl.MIRRORED_REPEAT : edge === 2 ? gl.REPEAT : gl.CLAMP_TO_EDGE)

/**
 * Motor de render WebGL2. `render(project, t)` dibuja el fotograma t a partir
 * únicamente del proyecto (JSON) y del pool de medios. Composición por capas
 * en una textura (FBO): cada capa pasa por su cadena de efectos y se dibuja
 * con su transformación de mundo; las capas de ajuste procesan todo lo que
 * hay debajo. La exportación (fase 10) usará este mismo motor.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext
  private layerProg: Program
  private quad: WebGLVertexArrayObject
  private textures = new Map<string, WebGLTexture>()
  private pool: TargetPool
  /** Texturas de acumulación del motion blur: media precisión flotante si la GPU lo permite. */
  private accPool: TargetPool
  readonly luts: LutCache
  private fx: EffectRuntime
  private comp: RenderTarget | null = null
  /** «Target» que representa el framebuffer del canvas (fbo null). */
  private screen = { fbo: null, tex: null, w: 1, h: 1 } as unknown as RenderTarget
  lastStats: RenderStats = { layers: 0, ms: 0 }

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('WebGL2 no está disponible en este equipo')
    this.gl = gl
    this.layerProg = createProgram(gl, LAYER_VS, LAYER_FS)
    this.quad = createQuad(gl)
    this.pool = new TargetPool(gl)
    this.accPool = new TargetPool(gl, true)
    this.luts = new LutCache(gl)
    this.fx = new EffectRuntime(gl, this.quad, this.pool, this.luts)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  setSize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
  }

  /**
   * Capas visibles en t, de abajo a arriba: medios, capas de ajuste y, dentro de
   * la ventana de una transición, un único elemento con A y B.
   */
  static collectLayers(project: Project, t: number): LayerItem[] {
    const out: LayerItem[] = []
    const fps = project.settings.fps
    const media = (clip: Clip): LayerItem | null => {
      if (!clip.assetId) return null
      const asset = project.assets[clip.assetId]
      if (!asset || !asset.hasVideo || asset.missing) return null
      return { clip, asset, localT: t - clip.start, srcT: clampedSourceTime(clip, t, asset.duration, fps) }
    }
    for (let i = project.tracks.length - 1; i >= 0; i--) {
      const track = project.tracks[i]
      if (track.kind !== 'video' || track.hidden) continue
      const tr = transitionAt(track, t)
      if (tr) {
        const a = media(tr.a)
        const b = media(tr.b)
        if (a && b) {
          const u = (t - tr.start) / (tr.end - tr.start)
          out.push({ ...a, transition: { b, trans: tr.trans, progress: easeProgress(tr.trans.ease, u), localTime: t - tr.start } })
          continue
        }
      }
      const clip = clipAt(track, t)
      if (!clip) continue
      if (clip.kind === 'adjustment') {
        if (activeEffects(clip).length) out.push({ clip, localT: t - clip.start })
        continue
      }
      const m = media(clip)
      if (m) out.push(m)
    }
    return out
  }

  async render(project: Project, t: number, pool: MediaPool, opts: RenderOptions): Promise<void> {
    const t0 = performance.now()
    const frameOf = (l: Omit<Layer, 'frame' | 'transition'>) =>
      l.asset ? pool.getFrame(l.clip, l.asset, l.srcT ?? sourceTime(l.clip, t), opts) : Promise.resolve(null)
    const layers: Layer[] = await Promise.all(
      Renderer.collectLayers(project, t).map(async (l) => {
        const [frame, bFrame] = await Promise.all([frameOf(l), l.transition ? frameOf(l.transition.b) : null])
        const layer: Layer = { ...l, frame, transition: undefined }
        if (l.transition) layer.transition = { ...l.transition, b: { ...l.transition.b, frame: bFrame } }
        return layer
      })
    )
    this.draw(project, layers, t, !!opts.offscreen)
    this.lastStats = { layers: layers.length, ms: performance.now() - t0 }
  }

  /** Textura con la composición del último fotograma renderizado con `offscreen` (exportación). */
  get output(): RenderTarget | null {
    return this.comp === this.screen ? null : this.comp
  }

  private draw(project: Project, layers: Layer[], t: number, offscreen: boolean): void {
    const gl = this.gl
    const { width: W, height: H, background } = project.settings
    const cw = this.canvas.width
    const ch = this.canvas.height
    const q = cw / W // píxeles de render por píxel de proyecto
    if (this.comp && (this.comp.w !== cw || this.comp.h !== ch || this.comp === this.screen)) {
      if (this.comp !== this.screen) this.pool.release(this.comp)
      this.comp = null
    }
    // Las capas de ajuste necesitan leer lo que hay debajo: entonces componemos en una textura.
    // Si no, dibujamos directamente en el canvas (un pase de copia menos a resolución completa).
    const needsTexture = offscreen || layers.some((l) => l.clip.kind === 'adjustment')
    // (las transiciones se componen en texturas propias y se dibujan encima: no necesitan la composición en textura)
    this.screen.w = cw
    this.screen.h = ch
    this.comp = needsTexture ? (this.comp ?? this.pool.get(cw, ch)) : this.screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.comp.fbo)
    gl.viewport(0, 0, cw, ch)
    gl.clearColor(background[0], background[1], background[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const index = indexClips(project)
    const parentOf = (c: Clip) => (c.parentId ? index.get(c.parentId) : undefined)
    for (const layer of layers) {
      if (layer.clip.kind === 'adjustment') this.drawAdjustment(project, layer, q, index)
      else if (layer.transition) this.drawTransition(project, layer, q, t, index, parentOf)
      else if (layer.frame) this.drawLayer(project, layer, layer.frame, q, t, index, resolveTraits(layer.clip, t, parentOf), this.comp)
    }

    // Presentación en el canvas.
    if (this.comp !== this.screen) {
      this.fx.runPass(null, COPY, { uTex: this.comp }, null, { time: 0, size: [W, H], pxScale: q, edge: 3, outW: cw, outH: ch })
    }
  }

  private uploadSource(clip: Clip, f: DecodedFrame): WebGLTexture | null {
    const gl = this.gl
    let tex = this.textures.get(clip.id)
    if (!tex) {
      tex = createTexture(gl)
      this.textures.set(clip.id, tex)
    }
    gl.bindTexture(gl.TEXTURE_2D, tex)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f.source)
    } catch (e) {
      console.warn('[EditForge] no se pudo subir el fotograma', e)
      return null
    }
    return tex
  }

  /** Transición: A y B se renderizan por separado (con sus transformaciones y efectos) y el shader los mezcla. */
  private drawTransition(project: Project, layer: Layer, q: number, t: number, index: ClipIndex, parentOf: (c: Clip) => Clip | undefined): void {
    const tr = layer.transition!
    const m = getTransition(tr.trans.type)
    const comp = this.comp!
    const { width: W, height: H } = project.settings
    const from = this.pool.get(comp.w, comp.h)
    const to = this.pool.get(comp.w, comp.h)
    const gl = this.gl
    for (const target of [from, to]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      gl.viewport(0, 0, target.w, target.h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    if (layer.frame) this.drawLayer(project, layer, layer.frame, q, t, index, resolveTraits(layer.clip, t, parentOf), from)
    if (tr.b.frame) this.drawLayer(project, tr.b, tr.b.frame, q, t, index, resolveTraits(tr.b.clip, t, parentOf), to)
    if (m) {
      runTransition(this.fx, m, tr.trans, from, to, comp, tr.progress, tr.localTime, [W, H], q)
    } else {
      this.fx.runPass(null, COPY, { uTex: tr.progress < 0.5 ? from : to }, comp, { time: 0, size: [W, H], pxScale: q, edge: 3, outW: comp.w, outH: comp.h }, {}, {}, false, true)
    }
    this.pool.release(from)
    this.pool.release(to)
  }

  private drawLayer(project: Project, layer: Layer, f: DecodedFrame, q: number, t: number, index: ClipIndex, traits: LayerTraits, target: RenderTarget): void {
    const gl = this.gl
    const { width: W, height: H } = project.settings
    const quarter = Math.round(f.rotation / 90) % 4
    // Tamaño base a partir de los metadatos del medio (igual que el gizmo); el del fotograma es solo respaldo.
    const base: [number, number] | undefined =
      layer.asset?.width && layer.asset.height ? undefined : fitContain(quarter % 2 ? f.height : f.width, quarter % 2 ? f.width : f.height, W, H)
    const geo = layerGeometry(project, layer.clip, layer.localT, base, index)
    const opacity = geo.resolved.opacity
    if (opacity <= 0) return
    const src = this.uploadSource(layer.clip, f)
    if (!src) return

    // ── cadena de efectos de píxel en el espacio de la capa ──
    const pixelFx = activeEffects(layer.clip, 'pixel')
    let tex: WebGLTexture = src
    let uv: Mat3 = uvRotation(quarter)
    let layerRT: RenderTarget | null = null
    if (pixelFx.length) {
      const lw = Math.min(4096, Math.max(1, Math.round(geo.baseW * q)))
      const lh = Math.min(4096, Math.max(1, Math.round(geo.baseH * q)))
      let cur = this.pool.get(lw, lh)
      this.fx.runPass(null, NORMALIZE, { uTex: src }, cur, { time: 0, size: [geo.baseW, geo.baseH], pxScale: q, edge: 3 }, {}, { uUvM: Array.from(uvRotation(quarter)) })
      for (const { fx, m } of pixelFx) {
        const next = this.pool.get(lw, lh)
        try {
          this.fx.apply(fx, m, cur, next, { t: layer.localT, fps: project.settings.fps }, [geo.baseW, geo.baseH], q)
          this.pool.release(cur)
          cur = next
        } catch (e) {
          console.warn(`[EditForge] error en el efecto ${m.name}`, e)
          this.pool.release(next)
        }
      }
      layerRT = cur
      tex = cur.tex
      uv = chain(translation(0, 1), scaling(1, -1)) // texturas de render: y hacia arriba
    }

    // ── dibujo sobre la composición ──
    const wrap = WRAP(gl, traits.edge || (traits.tiles > 1 ? traits.tileMode : 0))
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
    let expand = 1
    let clip: Mat3 | null = null
    if (traits.edge) {
      // Quad lo bastante grande para cubrir el lienzo con la imagen repetida.
      const sw = Math.hypot(geo.matrix[0], geo.matrix[1])
      const sh = Math.hypot(geo.matrix[3], geo.matrix[4])
      expand = Math.min(41, 2 * Math.ceil(Math.hypot(W, H) / Math.max(1, Math.min(sw, sh))) + 1)
      if (traits.edgeClip === 'rest') clip = invert(restQuadMatrix(project, layer.clip, layer.localT, [geo.baseW, geo.baseH], index))
    }
    // Píxeles de proyecto (y hacia abajo) → clip space: la parte de arriba de la imagen queda
    // arriba en la textura GL de la composición, que luego se copia tal cual al canvas.
    const proj = scaling(2 / W, -2 / H)
    const draw = (model: Mat3, alpha: number, target: RenderTarget, additive: boolean) => {
      this.drawQuad(target, tex, proj, model, uv, alpha, expand, traits.tiles, clip, additive)
    }

    const mb = traits.motionBlur
    const fps = project.settings.fps
    const n = mb ? Math.max(2, Math.min(32, mb.samples)) : 0
    const sizeM = scaling(geo.baseW, geo.baseH)
    const samples = mb && mb.shutter > 0
      ? Array.from({ length: n }, (_, i) => multiply(worldMatrix(project, layer.clip, t + (i / (n - 1) - 0.5) * (mb.shutter / fps), index), sizeM))
      : []
    // Si la transformación no cambia dentro del obturador no hay nada que desenfocar.
    const moving = samples.some((m) => m.some((v, k) => Math.abs(v - samples[0][k]) > 1e-3))
    if (moving) {
      // Motion blur: acumulamos la capa en sub-fotogramas dentro del obturador (incluye padres y efectos).
      const acc = this.accPool.get(target.w, target.h)
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fbo)
      gl.viewport(0, 0, acc.w, acc.h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      for (const m of samples) draw(m, opacity / n, acc, true)
      // Acumulación (textura GL) sobre la composición (textura GL): copia directa, sin invertir.
      this.drawQuad(target, acc.tex, scaling(2, 2), chain(), chain(), 1, 1, 1, null, false, true)
      this.accPool.release(acc)
    } else {
      draw(geo.matrix, opacity, target, false)
    }
    if (layerRT) {
      // Las texturas del pool vuelven con wrap «clamp» (lo esperan los efectos).
      gl.bindTexture(gl.TEXTURE_2D, layerRT.tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.pool.release(layerRT)
    }
  }

  /** Dibuja un quad texturizado sobre `target`. */
  private drawQuad(
    target: RenderTarget,
    tex: WebGLTexture,
    proj: Mat3,
    model: Mat3,
    uv: Mat3,
    opacity: number,
    expand: number,
    tiles: number,
    clip: Mat3 | null,
    additive: boolean,
    fullscreen = false
  ): void {
    const gl = this.gl
    const prog = this.layerProg
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.w, target.h)
    gl.enable(gl.BLEND)
    if (additive) gl.blendFunc(gl.ONE, gl.ONE)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(prog.program)
    gl.bindVertexArray(this.quad)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(prog.uniforms.uTex, 0)
    gl.uniformMatrix3fv(prog.uniforms.uProj, false, proj)
    gl.uniformMatrix3fv(prog.uniforms.uModel, false, fullscreen ? scaling(1, 1) : model)
    gl.uniformMatrix3fv(prog.uniforms.uUv, false, uv)
    gl.uniform1f(prog.uniforms.uExpand, expand)
    gl.uniform1f(prog.uniforms.uTiles, tiles)
    gl.uniform1f(prog.uniforms.uOpacity, opacity)
    gl.uniform1f(prog.uniforms.uUseClip, clip ? 1 : 0)
    gl.uniformMatrix3fv(prog.uniforms.uClip, false, clip ?? chain())
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    gl.disable(gl.BLEND)
  }

  /** Capa de ajuste: aplica sus efectos a todo lo que hay debajo. */
  private drawAdjustment(project: Project, layer: Layer, q: number, index: ClipIndex): void {
    const comp = this.comp!
    const { width: W, height: H } = project.settings
    const geo = layerGeometry(project, layer.clip, layer.localT, [W, H], index)
    const opacity = geo.resolved.opacity
    if (opacity <= 0) return
    const size: [number, number] = [W, H]
    const temps: RenderTarget[] = []
    let cur: RenderTarget = comp

    // Shake/zoom en una capa de ajuste: transformamos la composición.
    const hasTransform = activeEffects(layer.clip, 'transform').length > 0
    if (hasTransform) {
      const traits = resolveTraits(layer.clip, layer.clip.start + layer.localT, (c) => (c.parentId ? index.get(c.parentId) : undefined))
      const out = this.pool.get(comp.w, comp.h)
      temps.push(out)
      // Matriz respecto a la capa en reposo (su transformación propia sin efectos no mueve la composición).
      const rest = worldMatrix(project, layer.clip, layer.clip.start + layer.localT, index, false)
      const fxM = multiply(geo.local, invert(rest))
      this.fx.runPass(null, ADJ_TRANSFORM, { uTex: cur }, out, { time: layer.localT, size, pxScale: q, edge: traits.edge }, {}, { uInv: Array.from(invert(fxM)) })
      cur = out
    }
    for (const { fx, m } of activeEffects(layer.clip, 'pixel')) {
      const out = this.pool.get(comp.w, comp.h)
      temps.push(out)
      try {
        this.fx.apply(fx, m, cur, out, { t: layer.localT, fps: project.settings.fps }, size, q)
        cur = out
      } catch (e) {
        console.warn(`[EditForge] error en el efecto ${m.name}`, e)
      }
    }
    if (cur === comp) return
    const mixed = this.pool.get(comp.w, comp.h)
    this.fx.runPass(null, ADJ_MIX, { uTex: comp, uFx: cur }, mixed, { time: 0, size, pxScale: q, edge: 3 }, {}, { uOpacity: opacity })
    temps.forEach((t) => this.pool.release(t))
    this.pool.release(comp)
    this.comp = mixed
  }

  /** Avisa cuando termina de cargarse un LUT (para volver a pintar). */
  set onAsyncResource(fn: () => void) {
    this.luts.onLoaded = fn
  }

  /** Libera texturas de clips que ya no existen. */
  gc(project: Project): void {
    const alive = new Set<string>()
    for (const tr of project.tracks) for (const c of tr.clips) alive.add(c.id)
    for (const [id, tex] of this.textures) {
      if (!alive.has(id)) {
        this.gl.deleteTexture(tex)
        this.textures.delete(id)
      }
    }
  }

  dispose(): void {
    for (const tex of this.textures.values()) this.gl.deleteTexture(tex)
    this.textures.clear()
    if (this.comp && this.comp !== this.screen) this.pool.release(this.comp)
    this.comp = null
    this.pool.dispose()
    this.accPool.dispose()
  }
}

/**
 * uv de visualización → uv de textura para una rotación de metadatos de
 * quarter·90° en sentido horario (vídeos verticales de móvil).
 */
export function uvRotation(quarter: number): Mat3 {
  if (quarter === 0) return chain()
  // Giramos alrededor de (0.5, 0.5) en sentido contrario al de visualización.
  return chain(translation(0.5, 0.5), rot((-quarter * Math.PI) / 2), translation(-0.5, -0.5))
}
