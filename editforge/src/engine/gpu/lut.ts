import { mediaUrl } from '../media/mediaUrl'

export interface LutTexture {
  tex: WebGLTexture
  size: number
  target: 'lut'
}

/** Lee un LUT 3D en formato .cube (Adobe/Resolve). Orden: R varía más rápido, luego G, luego B. */
export function parseCube(text: string): { size: number; data: Float32Array; min: number[]; max: number[] } {
  let size = 0
  let min = [0, 0, 0]
  let max = [1, 1, 1]
  const values: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const key = parts[0].toUpperCase()
    if (key === 'LUT_3D_SIZE') size = parseInt(parts[1], 10)
    else if (key === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number)
    else if (key === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number)
    else if (key === 'TITLE' || key === 'LUT_1D_SIZE' || /^[A-Z_]+$/.test(key)) {
      if (key === 'LUT_1D_SIZE') throw new Error('Solo se admiten LUT 3D')
    } else if (parts.length >= 3) values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]))
  }
  if (!size) throw new Error('El .cube no indica LUT_3D_SIZE')
  if (values.length < size * size * size * 3) throw new Error('El .cube está incompleto')
  return { size, data: new Float32Array(values.slice(0, size * size * size * 3)), min, max }
}

/** Caché de LUTs subidos a texturas 3D (se cargan en segundo plano; mientras tanto el efecto no hace nada). */
export class LutCache {
  private cache = new Map<string, LutTexture | 'loading' | 'error'>()
  onLoaded?: () => void

  constructor(private gl: WebGL2RenderingContext) {}

  /** Hay LUTs cargándose (el render aún no es definitivo). */
  get pending(): boolean {
    for (const v of this.cache.values()) if (v === 'loading') return true
    return false
  }

  get(path: string): LutTexture | null {
    const c = this.cache.get(path)
    if (c && c !== 'loading' && c !== 'error') return c
    if (!c) void this.load(path)
    return null
  }

  private async load(path: string): Promise<void> {
    this.cache.set(path, 'loading')
    try {
      const text = await (await fetch(mediaUrl(path))).text()
      const { size, data, min, max } = parseCube(text)
      const bytes = new Uint8Array(size * size * size * 4)
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        for (let c = 0; c < 3; c++) bytes[j + c] = Math.round(Math.min(1, Math.max(0, (data[i + c] - min[c]) / (max[c] - min[c] || 1))) * 255)
        bytes[j + 3] = 255
      }
      const gl = this.gl
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_3D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR)
      for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE)
      this.cache.set(path, { tex, size, target: 'lut' })
      this.onLoaded?.()
    } catch (e) {
      console.warn('[EditForge] LUT no válido', path, e)
      this.cache.set(path, 'error')
    }
  }
}
