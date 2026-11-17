/**
 * Caché de fotogramas renderizados en la GPU (texturas RGB8: el canvas es opaco), con límite de
 * memoria y expulsión LRU. Se invalida entera cuando cambia el proyecto (es
 * inmutable: un objeto nuevo = un cambio), la calidad o el tamaño.
 */
export class FrameCache {
  private entries = new Map<string, WebGLTexture>()
  private bytesPer = 0
  private gen = ''
  hits = 0
  misses = 0

  constructor(private gl: WebGL2RenderingContext, public maxBytes = 512 * 1024 * 1024) {}

  /** Prepara la caché para una «generación» (proyecto + calidad + tamaño); si cambia, se vacía. */
  setGeneration(gen: string, w: number, h: number): void {
    if (gen === this.gen && this.bytesPer === w * h * 4) return
    this.clear()
    this.gen = gen
    this.bytesPer = w * h * 4 // la GPU suele alinear RGB8 a 4 bytes por píxel
  }

  get(frame: number): WebGLTexture | undefined {
    const key = String(frame)
    const tex = this.entries.get(key)
    if (tex) {
      // LRU: lo movemos al final.
      this.entries.delete(key)
      this.entries.set(key, tex)
      this.hits++
    } else this.misses++
    return tex
  }

  /** Copia el framebuffer de lectura actual (w×h) a una textura de la caché. */
  store(frame: number, w: number, h: number): void {
    const gl = this.gl
    const key = String(frame)
    if (this.entries.has(key) || this.bytesPer <= 0 || this.maxBytes < this.bytesPer) return
    while ((this.entries.size + 1) * this.bytesPer > this.maxBytes) {
      const oldest = this.entries.keys().next().value as string
      gl.deleteTexture(this.entries.get(oldest)!)
      this.entries.delete(oldest)
    }
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // RGB8: se puede copiar tanto de un framebuffer RGB (canvas con alpha: false) como RGBA.
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGB8, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h)
    this.entries.set(key, tex)
  }

  get size(): number {
    return this.entries.size
  }

  get megabytes(): number {
    return (this.entries.size * this.bytesPer) / (1024 * 1024)
  }

  clear(): void {
    for (const t of this.entries.values()) this.gl.deleteTexture(t)
    this.entries.clear()
  }
}
