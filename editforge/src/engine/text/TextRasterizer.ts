import { evalProp } from '@/core/anim'
import { fontCss, glyphStates, layoutText, setTextMeasurer, textBaseSize, type GlyphState } from '@/core/text'
import type { Clip, TextStyle } from '@/core/types'
import type { DecodedFrame } from '../media/FrameSource'

/**
 * Registra el medidor de texto real (canvas) para la maquetación del núcleo.
 * Se hace al crear el primer rasterizador, no al importar el módulo: así el
 * motor se puede importar en entornos sin DOM (tests, worker de exportación).
 */
let measurerReady = false
function ensureMeasurer(): void {
  if (measurerReady) return
  measurerReady = true
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
  setTextMeasurer((text, font) => {
    ctx.font = font
    return ctx.measureText(text).width
  })
}

function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0xffffff
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

interface Entry {
  canvas: OffscreenCanvas | HTMLCanvasElement
  key: string
}

/**
 * Rasteriza clips de texto con Canvas 2D a la resolución de render. El
 * resultado es la «imagen» de la capa: después pasa por transformación,
 * efectos, motion blur y transiciones como cualquier otra.
 * Si nada cambia (texto quieto), reutiliza el último raster.
 */
export class TextRasterizer {
  private cache = new Map<string, Entry>()

  constructor() {
    ensureMeasurer()
  }

  get(clip: Clip, localT: number, q: number): DecodedFrame | null {
    const d = clip.text
    if (!d) return null
    const st = d.style
    const tracking = evalProp(d.tracking, localT)
    const layout = layoutText(d.content, st, tracking)
    const states = glyphStates(d, layout, localT)
    const [bw, bh] = textBaseSize(clip)
    const scale = Math.min(q, 4096 / Math.max(bw, bh))
    const cw = Math.max(1, Math.round(bw * scale))
    const ch = Math.max(1, Math.round(bh * scale))
    const pin = d.animIn ? evalProp(d.progressIn, localT) : 100
    const cursor = d.animIn?.type === 'typewriter' && pin > 0 && pin < 100 && Math.floor(localT * 2.5) % 2 === 0
    const key = JSON.stringify([d.content, st, tracking, cw, ch, cursor, states.map((s) => [+s.opacity.toFixed(3), +s.dx.toFixed(4), +s.dy.toFixed(4), +s.scale.toFixed(4), +s.rotation.toFixed(2)])])
    let e = this.cache.get(clip.id)
    if (!e) {
      e = { canvas: typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch }), key: '' }
      this.cache.set(clip.id, e)
    }
    if (e.key !== key) {
      this.draw(e.canvas, cw, ch, scale, st, layout.glyphs, states, layout.width, layout.height, cursor)
      e.key = key
    }
    return { source: e.canvas as TexImageSource, width: cw, height: ch, rotation: 0, stable: true }
  }

  private draw(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    cw: number,
    ch: number,
    q: number,
    st: TextStyle,
    glyphs: ReturnType<typeof layoutText>['glyphs'],
    states: GlyphState[],
    blockW: number,
    blockH: number,
    cursor: boolean
  ): void {
    if (canvas.width !== cw) canvas.width = cw
    if (canvas.height !== ch) canvas.height = ch
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cw, ch)
    // Píxeles de proyecto con el origen en el centro del bloque.
    ctx.setTransform(q, 0, 0, q, cw / 2, ch / 2)
    const size = st.size

    if (st.box.enabled) {
      const p = st.box.padding
      ctx.fillStyle = rgba(st.box.color, st.box.opacity)
      ctx.beginPath()
      ctx.roundRect(-blockW / 2 - p, -blockH / 2 - p, blockW + 2 * p, blockH + 2 * p, st.box.radius)
      ctx.fill()
    }

    ctx.font = fontCss(st)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2

    const each = (fn: (g: (typeof glyphs)[number]) => void) => {
      glyphs.forEach((g, i) => {
        const s = states[i]
        if (s.opacity <= 0.002 || /\s/.test(g.char)) return
        ctx.save()
        ctx.globalAlpha = Math.min(1, s.opacity)
        // Cada glifo se transforma alrededor de su centro aproximado.
        const cx = g.x + g.w / 2 + s.dx * size
        const cy = g.y - size * 0.35 + s.dy * size
        ctx.translate(cx, cy)
        if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180)
        if (s.scale !== 1) ctx.scale(s.scale, s.scale)
        ctx.translate(-g.w / 2, size * 0.35)
        fn(g)
        ctx.restore()
      })
    }
    const noShadow = () => {
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }

    // 1) Glow: el color del glow con su desenfoque (la sombra de canvas no escala con la transformación: ×q).
    if (st.glow.enabled && st.glow.strength > 0) {
      ctx.shadowColor = st.glow.color
      ctx.shadowBlur = st.glow.radius * q
      ctx.fillStyle = st.glow.color
      const passes = Math.max(1, Math.round(st.glow.strength * 2))
      for (let i = 0; i < passes; i++) each((g) => ctx.fillText(g.char, 0, 0))
      noShadow()
    }
    // 2) Sombra + contorno (el contorno va por fuera: se dibuja con el doble de grosor bajo el relleno).
    const shadow = () => {
      if (!st.shadow.enabled) return noShadow()
      ctx.shadowColor = rgba(st.shadow.color, st.shadow.opacity)
      ctx.shadowBlur = st.shadow.blur * q
      ctx.shadowOffsetX = st.shadow.x * q
      ctx.shadowOffsetY = st.shadow.y * q
    }
    if (st.stroke.enabled && st.stroke.width > 0) {
      shadow()
      ctx.strokeStyle = st.stroke.color
      ctx.lineWidth = st.stroke.width * 2
      each((g) => ctx.strokeText(g.char, 0, 0))
      noShadow()
    } else shadow()
    // 3) Relleno.
    ctx.fillStyle = st.color
    each((g) => ctx.fillText(g.char, 0, 0))
    noShadow()

    // Cursor de la máquina de escribir.
    if (cursor) {
      const visible = glyphs.filter((_, i) => states[i].opacity > 0)
      const last = visible[visible.length - 1] ?? glyphs[0]
      if (last) {
        ctx.globalAlpha = 1
        ctx.fillStyle = st.color
        const x = visible.length ? last.x + last.w + size * 0.05 : last.x
        ctx.fillRect(x, last.y - size * 0.8, Math.max(2, size * 0.06), size * 0.95)
      }
    }
  }

  gc(alive: Set<string>): void {
    for (const id of this.cache.keys()) if (!alive.has(id)) this.cache.delete(id)
  }
}
