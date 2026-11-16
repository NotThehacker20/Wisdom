/**
 * Texto: datos por defecto, maquetación y animación por unidades (puro).
 *
 * La medición de texto se inyecta (`setTextMeasurer`): en la app la hace un
 * canvas; sin medidor (tests) se usa una estimación. Con la maquetación el
 * núcleo conoce el tamaño real del bloque (gizmo, encaje, hit-test).
 */
import { evalProp } from './anim'
import { uid } from './id'
import { defaultTransform } from './project'
import { frameRound, insertClip } from './timeline'
import type { AnimProp, Clip, Keyframe, Project, TextAnim, TextAnimatorType, TextData, TextStyle, TextUnit } from './types'

export function defaultTextStyle(): TextStyle {
  return {
    font: 'Arial',
    weight: 800,
    italic: false,
    size: 120,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.15,
    stroke: { enabled: false, color: '#000000', width: 6 },
    shadow: { enabled: true, color: '#000000', blur: 18, x: 0, y: 6, opacity: 0.6 },
    glow: { enabled: false, color: '#22d3c5', radius: 30, strength: 1 },
    box: { enabled: false, color: '#000000', padding: 24, radius: 16, opacity: 0.6 }
  }
}

export function defaultTextData(content = 'Tu texto'): TextData {
  return { content, style: defaultTextStyle(), tracking: { value: 0 }, progressIn: { value: 100 }, progressOut: { value: 0 } }
}

export function createTextClip(start: number, content = 'Tu texto', duration = 3): Clip {
  return {
    id: uid('clp_'),
    kind: 'text',
    name: content.split('\n')[0].slice(0, 40) || 'Texto',
    start,
    duration,
    in: 0,
    transform: defaultTransform(),
    volume: 1,
    text: defaultTextData(content)
  }
}

/** Texto nuevo en el cabezal, en una pista nueva encima de todo. */
export function insertTextClip(p: Project, t: number, content?: string): { project: Project; clipId: string } {
  return insertClip(p, createTextClip(frameRound(t, p.settings.fps), content), null)
}

// ───────────────────────────── maquetación ─────────────────────────────

export type TextMeasurer = (text: string, font: string) => number
let measurer: TextMeasurer | null = null

/** La app registra un medidor basado en canvas; sin él se estima (≈ 0,58 em por carácter). */
export function setTextMeasurer(m: TextMeasurer | null): void {
  measurer = m
  measureCache.clear()
}

export function fontCss(s: TextStyle): string {
  const family = /^[\w-]+$/.test(s.font) ? s.font : `"${s.font.replace(/"/g, '')}"`
  return `${s.italic ? 'italic ' : ''}${s.weight} ${s.size}px ${family}, sans-serif`
}

const measure = (text: string, style: TextStyle): number => (measurer ? measurer(text, fontCss(style)) : text.length * style.size * 0.58)

export interface GlyphBox {
  char: string
  /** Posición (izquierda, línea base) relativa al centro del bloque, en px de proyecto. */
  x: number
  y: number
  w: number
  /** Índices de carácter (sin saltos de línea), palabra y línea. */
  ci: number
  wi: number
  li: number
}

export interface TextLayout {
  glyphs: GlyphBox[]
  width: number
  height: number
  lineCount: number
  wordCount: number
  charCount: number
}

interface MeasuredLine {
  chars: string[]
  /** Posición de cada carácter sin tracking y su ancho (con kerning). */
  xs: number[]
  ws: number[]
}
const measureCache = new Map<string, MeasuredLine[]>()

function measureLines(content: string, style: TextStyle): MeasuredLine[] {
  const key = `${content}\u0000${fontCss(style)}\u0000${measurer ? 1 : 0}`
  const hit = measureCache.get(key)
  if (hit) return hit
  const lines = content.split('\n').map((line) => {
    const chars = [...line]
    const xs: number[] = []
    const ws: number[] = []
    let before = 0
    for (let i = 0; i < chars.length; i++) {
      // Ancho del prefijo: incluye el kerning entre pares.
      const prefix = measure(chars.slice(0, i + 1).join(''), style)
      xs.push(before)
      ws.push(prefix - before)
      before = prefix
    }
    return { chars, xs, ws }
  })
  if (measureCache.size > 300) measureCache.clear()
  measureCache.set(key, lines)
  return lines
}

/**
 * Coloca cada carácter. Las coordenadas son relativas al centro del bloque
 * (y hacia abajo); la línea base va a ~0,85 del interlineado. La medición se
 * cachea; el tracking (animable) se aplica después, sin volver a medir.
 */
export function layoutText(content: string, style: TextStyle, tracking: number): TextLayout {
  const lines = measureLines(content, style)
  const lh = style.size * style.lineHeight
  const widths = lines.map((l) => (l.chars.length ? l.xs[l.xs.length - 1] + l.ws[l.ws.length - 1] + tracking * (l.chars.length - 1) : 0))
  const blockW = Math.max(0, ...widths)
  const blockH = lines.length * lh
  const glyphs: GlyphBox[] = []
  let ci = 0
  let wi = -1
  lines.forEach((l, li) => {
    const lw = widths[li]
    const x0 = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - lw : -lw / 2
    const baseline = -blockH / 2 + li * lh + lh * 0.5 + style.size * 0.35
    let inWord = false
    l.chars.forEach((char, i) => {
      const space = /\s/.test(char)
      if (!space && !inWord) wi++
      inWord = !space
      glyphs.push({ char, x: x0 + l.xs[i] + i * tracking, y: baseline, w: l.ws[i], ci: ci++, wi: Math.max(0, wi), li })
    })
  })
  return { glyphs, width: blockW, height: blockH, lineCount: lines.length, wordCount: wi + 1, charCount: ci }
}

/** Margen alrededor del bloque: contorno, sombra, glow, caja y recorrido de las animaciones. */
export function textPadding(style: TextStyle): number {
  const s = style
  return Math.ceil(
    Math.max(
      s.stroke.enabled ? s.stroke.width : 0,
      s.shadow.enabled ? s.shadow.blur * 1.5 + Math.max(Math.abs(s.shadow.x), Math.abs(s.shadow.y)) : 0,
      s.glow.enabled ? s.glow.radius * 1.5 : 0,
      s.box.enabled ? s.box.padding : 0
    ) + s.size * 0.6
  )
}

/** Tamaño de la capa de texto (bloque + margen) en px de proyecto. */
export function textBaseSize(clip: Clip): [number, number] {
  const d = clip.text
  if (!d) return [100, 100]
  // Con el espaciado máximo que llegue a tener (puede estar animado), para que nunca se recorte.
  const maxTracking = Math.max(d.tracking.value, ...(d.tracking.keyframes ?? []).map((k) => k.v))
  const l = layoutText(d.content, d.style, maxTracking)
  const pad = textPadding(d.style)
  return [Math.max(1, l.width + pad * 2), Math.max(1, l.height + pad * 2)]
}

// ───────────────────────────── animación ─────────────────────────────

export const unitIndex = (g: GlyphBox, unit: TextUnit): number => (unit === 'char' ? g.ci : unit === 'word' ? g.wi : g.li)
export const unitCount = (l: TextLayout, unit: TextUnit): number => Math.max(1, unit === 'char' ? l.charCount : unit === 'word' ? l.wordCount : l.lineCount)

/** Progreso local (0..1) de la unidad i de n para un progreso global p (0..1) con solapamiento o. */
export function unitProgress(p: number, i: number, n: number, overlap: number): number {
  const o = Math.min(0.95, Math.max(0, overlap))
  const d = 1 / (1 + (n - 1) * (1 - o))
  const start = i * (1 - o) * d
  return Math.min(1, Math.max(0, (p - start) / d))
}

export interface GlyphState {
  opacity: number
  /** Desplazamiento en em. */
  dx: number
  dy: number
  scale: number
  /** Grados. */
  rotation: number
}

export const IDENTITY: GlyphState = { opacity: 1, dx: 0, dy: 0, scale: 1, rotation: 0 }

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3)
const easeOutBack = (u: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2)
}
const bounce = (u: number) => {
  const n1 = 7.5625
  const d1 = 2.75
  if (u < 1 / d1) return n1 * u * u
  if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75
  if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375
  return n1 * (u -= 2.625 / d1) * u + 0.984375
}

/** Estado de una unidad con progreso local u (0 = oculta / antes, 1 = en su sitio). */
export function animatorState(type: TextAnimatorType, u: number, direction: TextAnim['direction'] = 'up'): GlyphState {
  const x = Math.min(1, Math.max(0, u))
  switch (type) {
    case 'typewriter':
      return { ...IDENTITY, opacity: x > 0 ? 1 : 0 }
    case 'fade':
      return { ...IDENTITY, opacity: easeOut(x) }
    case 'pop': {
      const e = easeOutBack(x)
      return { ...IDENTITY, opacity: Math.min(1, x * 3), scale: Math.max(0, e) }
    }
    case 'slide': {
      const e = 1 - easeOut(x)
      const v = { up: [0, 0.6], down: [0, -0.6], left: [0.6, 0], right: [-0.6, 0] }[direction]
      return { ...IDENTITY, opacity: easeOut(x), dx: v[0] * e, dy: v[1] * e }
    }
    case 'spin': {
      const e = easeOut(x)
      return { ...IDENTITY, opacity: Math.min(1, x * 2), rotation: (1 - e) * -180, scale: 0.3 + 0.7 * e }
    }
    case 'drop': {
      const e = bounce(x)
      return { ...IDENTITY, opacity: Math.min(1, x * 4), dy: -(1 - e) * 1.2 }
    }
  }
}

function combine(a: GlyphState, b: GlyphState): GlyphState {
  return { opacity: a.opacity * b.opacity, dx: a.dx + b.dx, dy: a.dy + b.dy, scale: a.scale * b.scale, rotation: a.rotation + b.rotation }
}

/**
 * Estado de cada glifo en el tiempo local t: animación de entrada según su
 * progreso (0–100 %) y de salida según el suyo (la salida es la entrada al revés).
 */
export function glyphStates(d: TextData, layout: TextLayout, t: number): GlyphState[] {
  const pin = d.animIn ? evalProp(d.progressIn, t) / 100 : 1
  const pout = d.animOut ? evalProp(d.progressOut, t) / 100 : 0
  return layout.glyphs.map((g) => {
    let s = IDENTITY
    if (d.animIn && pin < 1) {
      const a = d.animIn
      s = combine(s, animatorState(a.type, unitProgress(pin, unitIndex(g, a.unit), unitCount(layout, a.unit), a.overlap), a.direction))
    }
    if (d.animOut && pout > 0) {
      const a = d.animOut
      s = combine(s, animatorState(a.type, 1 - unitProgress(pout, unitIndex(g, a.unit), unitCount(layout, a.unit), a.overlap), a.direction))
    }
    return s
  })
}

/** ¿El texto está animándose en t? (para no volver a rasterizar un texto quieto) */
export function textAnimating(d: TextData, t: number): boolean {
  const pin = d.animIn ? evalProp(d.progressIn, t) : 100
  const pout = d.animOut ? evalProp(d.progressOut, t) : 0
  return pin < 100 || pout > 0
}

// ───────────────────────────── presets ─────────────────────────────

export const TEXT_ANIMATORS: Array<{ type: TextAnimatorType; name: string; unit: TextUnit; overlap: number }> = [
  { type: 'typewriter', name: 'Máquina de escribir', unit: 'char', overlap: 0 },
  { type: 'pop', name: 'Pop', unit: 'char', overlap: 0.7 },
  { type: 'slide', name: 'Slide', unit: 'word', overlap: 0.6 },
  { type: 'fade', name: 'Fundido', unit: 'char', overlap: 0.8 },
  { type: 'spin', name: 'Giro', unit: 'char', overlap: 0.75 },
  { type: 'drop', name: 'Caída', unit: 'char', overlap: 0.75 }
]

function ramp(t0: number, t1: number): AnimProp {
  const keyframes: Keyframe[] = [
    { id: uid('kf_'), t: t0, v: 0, interp: 'linear' },
    { id: uid('kf_'), t: t1, v: 100, interp: 'linear' }
  ]
  return { value: 0, keyframes }
}

/**
 * Pone (o quita, con null) la animación de entrada o salida y crea los
 * keyframes de su progreso: la entrada de 0 a `duration`, la salida en los
 * últimos `duration` segundos del clip.
 */
export function setTextAnimation(clip: Clip, which: 'in' | 'out', anim: TextAnim | null, duration: number, fps: number): Clip {
  if (!clip.text) return clip
  const d = Math.max(1 / fps, Math.min(duration, clip.duration))
  const text: TextData = { ...clip.text }
  if (which === 'in') {
    text.animIn = anim ?? undefined
    text.progressIn = anim ? ramp(0, frameRound(d, fps)) : { value: 100 }
  } else {
    text.animOut = anim ?? undefined
    text.progressOut = anim ? ramp(frameRound(clip.duration - d, fps), clip.duration) : { value: 0 }
  }
  return { ...clip, text }
}

/** Duración de una animación (entre su primer y último keyframe). */
export function animDuration(p: AnimProp): number {
  const k = p.keyframes
  return k && k.length > 1 ? k[k.length - 1].t - k[0].t : 0
}
