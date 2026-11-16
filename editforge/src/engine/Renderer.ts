import { fitContain, layerMatrix, resolveTransform } from '@/core/layerTransform'
import { chain, scaling, translation, rotation as rot, type Mat3 } from '@/core/mat3'
import { clipAt, sourceTime } from '@/core/project'
import type { Clip, MediaAsset, Project } from '@/core/types'
import { createProgram, createQuad, createTexture, type Program } from './gl'
import type { MediaPool } from './MediaPool'
import type { DecodedFrame } from './media/FrameSource'
import { LAYER_FS, LAYER_VS } from './shaders/layer'

export interface RenderOptions {
  playing: boolean
}

interface Layer {
  clip: Clip
  asset: MediaAsset
  localT: number
  frame: DecodedFrame | null
}

export interface RenderStats {
  layers: number
  ms: number
}

/**
 * Motor de render WebGL2. `render(project, t)` dibuja el fotograma t
 * a partir únicamente del proyecto (JSON) y del pool de medios.
 * El mismo motor se usará en la exportación (fase 10).
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext
  private layerProg: Program
  private quad: WebGLVertexArrayObject
  private textures = new Map<string, WebGLTexture>()
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
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  setSize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
  }

  /** Capas visibles en t, de abajo a arriba. */
  static collectLayers(project: Project, t: number): Array<Omit<Layer, 'frame'>> {
    const out: Array<Omit<Layer, 'frame'>> = []
    for (let i = project.tracks.length - 1; i >= 0; i--) {
      const track = project.tracks[i]
      if (track.kind !== 'video' || track.hidden) continue
      const clip = clipAt(track, t)
      if (!clip || !clip.assetId) continue
      const asset = project.assets[clip.assetId]
      if (!asset || !asset.hasVideo) continue
      out.push({ clip, asset, localT: t - clip.start })
    }
    return out
  }

  async render(project: Project, t: number, pool: MediaPool, opts: RenderOptions): Promise<void> {
    const t0 = performance.now()
    const layers: Layer[] = await Promise.all(
      Renderer.collectLayers(project, t).map(async (l) => ({
        ...l,
        frame: await pool.getFrame(l.clip, l.asset, sourceTime(l.clip, t), opts)
      }))
    )
    this.draw(project, layers)
    this.lastStats = { layers: layers.length, ms: performance.now() - t0 }
  }

  private draw(project: Project, layers: Layer[]): void {
    const gl = this.gl
    const { width: W, height: H, background } = project.settings
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(background[0], background[1], background[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const prog = this.layerProg
    gl.useProgram(prog.program)
    gl.bindVertexArray(this.quad)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(prog.uniforms.uTex, 0)

    // Píxeles de proyecto (origen en el centro, y hacia abajo) → clip space.
    const projection = scaling(2 / W, -2 / H)

    for (const layer of layers) {
      const f = layer.frame
      if (!f) continue
      const r = resolveTransform(layer.clip, layer.localT)
      if (r.opacity <= 0) continue

      const quarter = Math.round(f.rotation / 90) % 4
      const dispW = quarter % 2 ? f.height : f.width
      const dispH = quarter % 2 ? f.width : f.height
      const [bw, bh] = fitContain(dispW, dispH, W, H)
      const mvp = chain(projection, layerMatrix(r), scaling(bw, bh))

      let tex = this.textures.get(layer.clip.id)
      if (!tex) {
        tex = createTexture(gl)
        this.textures.set(layer.clip.id, tex)
      }
      gl.bindTexture(gl.TEXTURE_2D, tex)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f.source)
      } catch (e) {
        console.warn('[EditForge] no se pudo subir el fotograma', e)
        continue
      }

      gl.uniformMatrix3fv(prog.uniforms.uMvp, false, mvp)
      gl.uniformMatrix3fv(prog.uniforms.uUv, false, uvRotation(quarter))
      gl.uniform1f(prog.uniforms.uOpacity, r.opacity)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    gl.bindVertexArray(null)
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
