import { describe, expect, it } from 'vitest'
import { evalProp } from '@/core/anim'
import { layerBaseSize } from '@/core/layerTransform'
import { createProject } from '@/core/project'
import { clipKeyTimes, clipPropPaths, getProp, setPropValue } from '@/core/props'
import {
  animatorState, createTextClip, glyphStates, insertTextClip, layoutText, setTextAnimation, setTextMeasurer, textAnimating, textBaseSize,
  textPadding, unitCount, unitIndex, unitProgress, defaultTextStyle
} from '@/core/text'
import { setTextAnim, setTextContent, setTextStyle } from '@/core/textOps'
import { splitClip } from '@/core/timeline'
import type { Clip, Project } from '@/core/types'

// Medidor determinista: cada carácter mide 0,5 em salvo «i» (0,25 em); «AV» tiene kerning −0,1 em.
setTextMeasurer((text, font) => {
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)![1])
  let w = 0
  for (const ch of text) w += ch === 'i' ? 0.25 : 0.5
  return (w - (text.includes('AV') ? 0.1 : 0)) * size
})

const style = { ...defaultTextStyle(), size: 100, lineHeight: 1.2 }

describe('maquetación', () => {
  it('coloca los caracteres con kerning, tracking y centrado', () => {
    const l = layoutText('AVi', style, 0)
    expect(l.glyphs.map((g) => +g.w.toFixed(3))).toEqual([50, 40, 25]) // V absorbe el kerning
    expect(l.width).toBeCloseTo(115, 6)
    expect(l.glyphs[0].x).toBeCloseTo(-57.5, 6) // centrado
    const t = layoutText('AVi', style, 10)
    expect(t.width).toBeCloseTo(135, 6)
    expect(t.glyphs[2].x - t.glyphs[1].x).toBeCloseTo(50, 6)
  })
  it('varias líneas, alineación, palabras y líneas', () => {
    const l = layoutText('ab cd\nefg', { ...style, align: 'left' }, 0)
    expect([l.lineCount, l.wordCount, l.charCount]).toEqual([2, 3, 8])
    expect(l.height).toBeCloseTo(240, 6)
    expect(l.glyphs.filter((g) => g.li === 1).map((g) => g.wi)).toEqual([2, 2, 2])
    expect(l.glyphs[5].x).toBeCloseTo(-125, 6) // alineado a la izquierda del bloque (ancho 250)
    expect(l.glyphs[5].y - l.glyphs[0].y).toBeCloseTo(120, 6)
  })
  it('el tamaño de la capa incluye el margen de contorno/sombra/glow y del recorrido', () => {
    const c = createTextClip(0, 'Hola')
    const [w, h] = textBaseSize(c)
    const pad = textPadding(c.text!.style)
    expect(w).toBeCloseTo(layoutText('Hola', c.text!.style, 0).width + 2 * pad, 6)
    expect(h).toBeGreaterThan(c.text!.style.size)
    expect(layerBaseSize(createProject(), c)).toEqual([w, h])
  })
})

describe('animación por unidades', () => {
  it('reparte el progreso entre unidades según el solapamiento', () => {
    expect([0, 1, 2].map((i) => unitProgress(0.5, i, 3, 0))).toEqual([1, expect.closeTo(0.5, 6), 0])
    expect(unitProgress(0, 0, 3, 0)).toBe(0)
    expect(unitProgress(1, 2, 3, 0.5)).toBe(1)
    expect(unitProgress(0.5, 0, 1, 0)).toBe(0.5)
    // Con solapamiento alto, todas avanzan casi a la vez.
    const near = [0, 1, 2, 3].map((i) => unitProgress(0.5, i, 4, 0.95))
    expect(Math.max(...near) - Math.min(...near)).toBeLessThan(0.3)
  })
  it('cada animador va de oculto/desplazado a su sitio', () => {
    for (const type of ['typewriter', 'fade', 'pop', 'slide', 'spin', 'drop'] as const) {
      const end = animatorState(type, 1)
      expect(end.opacity).toBeCloseTo(1, 6)
      expect([end.dx, end.dy, end.rotation].map((v) => Math.abs(v))).toEqual([0, 0, 0].map(() => expect.closeTo(0, 6)))
      expect(end.scale).toBeCloseTo(1, 6)
      expect(animatorState(type, 0).opacity).toBe(0)
    }
    expect(animatorState('pop', 0.6).scale).toBeGreaterThan(1) // sobrepasa (rebote)
    expect(animatorState('slide', 0.2, 'up').dy).toBeGreaterThan(0) // viene de abajo
    expect(animatorState('typewriter', 0.01).opacity).toBe(1)
  })
  it('máquina de escribir: aparecen los caracteres en orden según el progreso (keyframes)', () => {
    let c = createTextClip(0, 'Hola')
    c = setTextAnimation(c, 'in', { type: 'typewriter', unit: 'char', overlap: 0 }, 1, 30)
    const l = layoutText('Hola', c.text!.style, 0)
    const visible = (t: number) => glyphStates(c.text!, l, t).filter((s) => s.opacity > 0).length
    expect(visible(0)).toBe(0)
    expect(visible(0.3)).toBe(2)
    expect(visible(0.6)).toBe(3)
    expect(visible(1)).toBe(4)
    expect(textAnimating(c.text!, 0.5)).toBe(true)
    expect(textAnimating(c.text!, 1.5)).toBe(false)
  })
  it('salida al final del clip por palabras', () => {
    let c = createTextClip(0, 'uno dos tres', 3)
    c = setTextAnimation(c, 'out', { type: 'fade', unit: 'word', overlap: 0 }, 0.6, 30)
    const l = layoutText(c.text!.content, c.text!.style, 0)
    expect(unitCount(l, 'word')).toBe(3)
    const op = (t: number) => glyphStates(c.text!, l, t).map((s) => +s.opacity.toFixed(2))
    expect(op(2)).toEqual(Array(12).fill(1))
    const mid = op(2.7) // a mitad de la salida: «uno» ya se fue, «tres» sigue
    expect(mid[0]).toBe(0)
    expect(mid[11]).toBe(1)
    expect(op(3).every((v) => v === 0)).toBe(true)
    expect(unitIndex(l.glyphs[4], 'word')).toBe(1)
  })
})

describe('integración', () => {
  it('insertar texto en el cabezal crea una pista arriba', () => {
    const r = insertTextClip(createProject(), 1.5, 'Hola')
    const c = r.project.tracks[0].clips[0]
    expect([c.kind, c.start, c.text?.content]).toEqual(['text', 1.5, 'Hola'])
  })
  it('entrada/salida y espaciado son propiedades animables (graph editor, timeline)', () => {
    let p: Project = createProject()
    const r = insertTextClip(p, 0, 'Hola')
    p = setTextAnim(r.project, r.clipId, 'in', { type: 'pop', unit: 'char', overlap: 0.7 }, 0.5)
    const c = (q: Project) => q.tracks[0].clips[0] as Clip
    expect(clipPropPaths(c(p))).toEqual(expect.arrayContaining(['text.in', 'text.tracking']))
    expect(clipKeyTimes(c(p))).toEqual([0, 0.5])
    p = setPropValue(p, r.clipId, 'text.tracking', 0, 20)
    expect(getProp(c(p), 'text.tracking')!.value).toBe(20)
    const split = splitClip(p, r.clipId, 0.3)
    const right = split.project.tracks[0].clips[1]
    expect(evalProp(right.text!.progressIn, 0)).toBeCloseTo(60, 3) // los keyframes siguen al contenido
  })
  it('contenido y estilo', () => {
    let p: Project = createProject()
    const r = insertTextClip(p, 0)
    p = setTextContent(r.project, r.clipId, 'Nuevo\ntexto')
    p = setTextStyle(p, r.clipId, { size: 80, stroke: { enabled: true } })
    const c = p.tracks[0].clips[0]
    expect([c.name, c.text!.style.size, c.text!.style.stroke.enabled, c.text!.style.stroke.width]).toEqual(['Nuevo', 80, true, 6])
  })
})
