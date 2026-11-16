/** Texturas de render (FBO + textura) reutilizables. */
export interface RenderTarget {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

export class TargetPool {
  private free = new Map<string, RenderTarget[]>()
  private readonly internalFormat: number
  private readonly type: number

  /**
   * @param hdr  texturas de media precisión flotante (requiere EXT_color_buffer_float).
   *             Por defecto RGBA8: bastante más rápido y compatible; en edits no se aprecian bandas.
   */
  constructor(private gl: WebGL2RenderingContext, hdr = false) {
    const half = hdr && !!gl.getExtension('EXT_color_buffer_float')
    this.internalFormat = half ? gl.RGBA16F : gl.RGBA8
    this.type = half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE
  }

  get(w: number, h: number): RenderTarget {
    w = Math.max(1, Math.min(8192, Math.round(w)))
    h = Math.max(1, Math.min(8192, Math.round(h)))
    const key = `${w}x${h}`
    const list = this.free.get(key)
    const reused = list?.pop()
    if (reused) return reused
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, w, h, 0, gl.RGBA, this.type, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { fbo, tex, w, h }
  }

  release(t: RenderTarget): void {
    const key = `${t.w}x${t.h}`
    const list = this.free.get(key) ?? []
    list.push(t)
    this.free.set(key, list)
  }

  dispose(): void {
    for (const list of this.free.values()) {
      for (const t of list) {
        this.gl.deleteFramebuffer(t.fbo)
        this.gl.deleteTexture(t.tex)
      }
    }
    this.free.clear()
  }
}
