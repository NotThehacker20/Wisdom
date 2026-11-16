import { describe, expect, it } from 'vitest'
import '@/plugins'
import { createClipFromAsset, createProject } from '@/core/project'
import {
  clampedSourceTime, easeProgress, findCuts, getTransition, listTransitions, maxTransitionDuration, nearestCut, registerTransition,
  removeTransition, setTransition, transitionAt, updateTransition
} from '@/core/transitions'
import { deleteClips, insertClip, moveClips, splitClip } from '@/core/timeline'
import type { Clip, MediaAsset, Project } from '@/core/types'
import { Renderer } from '@/engine/Renderer'

const asset = (id: string, duration = 10): MediaAsset => ({ id, kind: 'video', name: id, path: `/${id}`, duration, width: 1920, height: 1080, hasAudio: false, hasVideo: true })

/** Pista 0: A [0,4) con in=1 (material 1..5 de 10 s), B [4,7) con in=0. */
function setup() {
  let p: Project = { ...createProject(), assets: { A: asset('A'), B: asset('B', 3) } }
  const track = p.tracks[0].id
  const add = (c: Clip) => {
    const r = insertClip(p, c, track)
    p = r.project
    return r.clipId
  }
  const a = add({ ...createClipFromAsset(p.assets.A, 0), duration: 4, in: 1 })
  const b = add({ ...createClipFromAsset(p.assets.B, 4), duration: 3 })
  return { p, a, b }
}
const clipOf = (p: Project, id: string) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!

describe('registro y curvas', () => {
  it('registra las transiciones integradas', () => {
    const ids = listTransitions().map((m) => m.id)
    for (const id of ['crossfade', 'zoomIn', 'zoomOut', 'whipPan', 'spin', 'flash', 'glitch', 'lumaFade', 'slide', 'shake', 'rgbSplit', 'inkWipe']) {
      expect(ids).toContain(id)
    }
    expect(() => registerTransition({ id: 'x', name: 'X', params: [] })).toThrow()
  })
  it('curvas del progreso', () => {
    for (const e of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInOutExpo', 'easeOutBack']) {
      expect(easeProgress(e, 0)).toBeCloseTo(0, 5)
      expect(easeProgress(e, 1)).toBeCloseTo(1, 5)
    }
    expect(easeProgress('easeIn', 0.3)).toBeLessThan(0.3)
    expect(easeProgress('linear', 0.3)).toBe(0.3)
    expect(easeProgress('linear', 2)).toBe(1)
  })
})

describe('cortes y transiciones', () => {
  it('detecta cortes solo entre clips contiguos', () => {
    let { p, b } = setup()
    expect(findCuts(p.tracks[0]).map((c) => c.t)).toEqual([4])
    p = moveClips(p, [b], { dt: 0.5, dTrack: 0 })
    expect(findCuts(p.tracks[0])).toHaveLength(0)
  })
  it('pone una transición centrada en el corte y la ventana es [corte − d/2, corte + d/2)', () => {
    let { p, b } = setup()
    p = setTransition(p, b, 'crossfade', 1)
    const tr = clipOf(p, b).transitionIn!
    expect([tr.type, tr.duration, tr.ease]).toEqual(['crossfade', 1, 'linear'])
    expect(transitionAt(p.tracks[0], 3.4)).toBeUndefined()
    expect(transitionAt(p.tracks[0], 3.5)?.b.id).toBe(b)
    expect(transitionAt(p.tracks[0], 4.49)?.b.id).toBe(b)
    expect(transitionAt(p.tracks[0], 4.5)).toBeUndefined()
  })
  it('no permite transiciones donde no hay corte ni en pistas bloqueadas', () => {
    let { p, a, b } = setup()
    expect(setTransition(p, a, 'crossfade')).toBe(p) // A no tiene clip anterior
    p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, locked: true } : t)) }
    expect(setTransition(p, b, 'crossfade')).toBe(p)
  })
  it('limita la duración a los clips vecinos y la ajusta a fotogramas', () => {
    let { p, b } = setup()
    expect(maxTransitionDuration(p.tracks[0], b)).toBe(6) // 2·min(4, 3)
    p = setTransition(p, b, 'zoomIn', 20)
    expect(clipOf(p, b).transitionIn!.duration).toBe(6)
    p = updateTransition(p, b, { duration: 0.51 })
    expect(clipOf(p, b).transitionIn!.duration * 30).toBeCloseTo(15, 6) // 0,51 s → 15 fotogramas
    p = updateTransition(p, b, { ease: 'easeIn', params: { strength: 2 } })
    expect(clipOf(p, b).transitionIn!.params).toMatchObject({ strength: 2, blur: 0.7 })
  })
  it('cambiar el tipo conserva duración y curva; quitar la elimina', () => {
    let { p, b } = setup()
    p = setTransition(p, b, 'crossfade', 1.2)
    p = updateTransition(p, b, { ease: 'easeOut' })
    p = setTransition(p, b, 'whipPan')
    expect(clipOf(p, b).transitionIn).toMatchObject({ type: 'whipPan', duration: 1.2, ease: 'easeOut' })
    p = removeTransition(p, b)
    expect(clipOf(p, b).transitionIn).toBeUndefined()
  })
  it('al cortar un clip con transición, la mitad derecha no la hereda', () => {
    let { p, b } = setup()
    p = setTransition(p, b, 'crossfade')
    const r = splitClip(p, b, 5.5)
    expect(clipOf(r.project, b).transitionIn).toBeDefined()
    expect(clipOf(r.project, r.rightId!).transitionIn).toBeUndefined()
  })
  it('una transición sin corte (clip movido o vecino borrado) queda inactiva', () => {
    let { p, a, b } = setup()
    p = setTransition(p, b, 'crossfade')
    expect(transitionAt(deleteClips(p, [a]).tracks[0], 4)).toBeUndefined()
  })
  it('busca el corte más cercano', () => {
    const { p, b } = setup()
    expect(nearestCut(p, 6)?.b.id).toBe(b)
  })
})

describe('render: elementos de capa', () => {
  it('dentro de la ventana devuelve A y B juntos con tiempos de origen limitados', () => {
    let { p, a, b } = setup()
    p = setTransition(p, b, 'crossfade', 2)
    const at = (t: number) => Renderer.collectLayers(p, t)
    expect(at(2.9).map((l) => l.clip.id)).toEqual([a])
    const it35 = at(3.5)[0]
    expect(it35.clip.id).toBe(a)
    expect(it35.transition?.b.clip.id).toBe(b)
    expect(it35.srcT).toBeCloseTo(4.5, 6) // A sigue: in 1 + 3.5
    expect(it35.transition!.b.srcT).toBe(0) // B antes de su entrada: congela el primer fotograma
    expect(it35.transition!.progress).toBeCloseTo(0.25, 6)
    const it45 = at(4.5)[0]
    expect(it45.srcT).toBeCloseTo(5.5, 6) // A después de su salida: aún hay material
    expect(it45.transition!.b.srcT).toBeCloseTo(0.5, 6)
    expect(at(5.1).map((l) => [l.clip.id, l.transition])).toEqual([[b, undefined]])
  })
  it('congela el último fotograma si al clip A no le queda material', () => {
    expect(clampedSourceTime({ in: 8, start: 0 } as Clip, 3, 10, 30)).toBeCloseTo(10 - 0.5 / 30, 6)
    expect(clampedSourceTime({ in: 0, start: 5 } as Clip, 4, 10, 30)).toBe(0)
  })
  it('cada transición tiene GLSL o render', () => {
    for (const m of listTransitions()) expect(!!(getTransition(m.id)!.glsl || m.render)).toBe(true)
  })
})
