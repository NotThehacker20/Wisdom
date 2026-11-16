import { describe, expect, it } from 'vitest'
import { emptyHistory, execute, opCommand, redo, undo } from '@/core/commands'
import { createProject } from '@/core/project'
import {
  addMarker, addTrack, clearRange, clipEnd, constrainMove, deleteClips, duplicateClips, editPoints, insertAssetClip,
  insertGeneratorClip, moveClips, rippleDelete, snap, snapPoints, splitAt, splitClip, trimClip, updateMarker
} from '@/core/timeline'
import type { Clip, MediaAsset, Project, Track } from '@/core/types'

const asset = (id: string, duration = 10, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({
  id, kind, name: id, path: `/m/${id}`, duration, width: 1920, height: 1080, hasAudio: kind !== 'image', hasVideo: kind !== 'audio'
})

/** Proyecto con una pista de vídeo: A [0,4) B [4,7) con medios de 10 s. */
function setup(): { p: Project; a: string; b: string } {
  let p = createProject()
  p = { ...p, assets: { A: asset('A'), B: asset('B'), I: asset('I', Infinity, 'image'), S: asset('S', 20, 'audio') } }
  const v = p.tracks[0].id
  let r = insertAssetClip(p, p.assets.A, v, 0)
  p = trimClip(r.project, r.clipId, 'end', 4)
  const a = r.clipId
  r = insertAssetClip(p, p.assets.B, v, 4)
  p = trimClip(r.project, r.clipId, 'end', 7)
  return { p, a, b: r.clipId }
}

const v0 = (p: Project): Track => p.tracks[0]
const spans = (t: Track) => t.clips.map((c) => [c.start, clipEnd(c), c.in].map((x) => +x.toFixed(4)))

describe('clearRange (sobrescribir)', () => {
  const clip = (id: string, start: number, duration: number): Clip => ({
    id, kind: 'video', name: id, start, duration, in: 0, volume: 1,
    transform: { x: { value: 0 }, y: { value: 0 }, scale: { value: 100 }, rotation: { value: 0 }, anchorX: { value: 0 }, anchorY: { value: 0 }, opacity: { value: 100 } }
  })
  const track = (clips: Clip[]): Track => ({ id: 't', kind: 'video', name: 't', hidden: false, muted: false, locked: false, clips })

  it('recorta, divide y elimina según el solape', () => {
    const t = track([clip('a', 0, 4), clip('b', 4, 2), clip('c', 6, 4)])
    expect(spans(clearRange(t, 3, 7))).toEqual([[0, 3, 0], [7, 10, 1]])
  })
  it('un rango interior divide el clip y avanza el punto de entrada de la parte derecha', () => {
    const t = track([clip('a', 0, 10)])
    const r = clearRange(t, 2, 5)
    expect(spans(r)).toEqual([[0, 2, 0], [5, 10, 5]])
    expect(r.clips[0].id).toBe('a')
    expect(r.clips[1].id).not.toBe('a')
  })
})

describe('cortar', () => {
  it('divide un clip conservando la continuidad del medio', () => {
    const { p, a } = setup()
    const r = splitClip(p, a, 1.5)
    expect(spans(v0(r.project)).slice(0, 2)).toEqual([[0, 1.5, 0], [1.5, 4, 1.5]])
  })
  it('no divide en los bordes', () => {
    const { p, a } = setup()
    expect(splitClip(p, a, 0).rightId).toBeNull()
    expect(splitClip(p, a, 4).rightId).toBeNull()
  })
  it('splitAt sin selección corta todas las pistas desbloqueadas; con selección solo lo seleccionado', () => {
    let { p } = setup()
    const audio = p.tracks.find((t) => t.kind === 'audio')!.id
    p = insertAssetClip(p, p.assets.S, audio, 0).project
    expect(splitAt(p, 2, []).rightIds).toHaveLength(2)
    const sel = p.tracks[0].clips[0].id
    expect(splitAt(p, 2, [sel]).rightIds).toHaveLength(1)
    const locked = { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, locked: true } : t)) }
    expect(splitAt(locked, 2, []).rightIds).toHaveLength(1)
  })
  it('ajusta el corte a la rejilla de fotogramas', () => {
    const { p, a } = setup()
    const r = splitClip(p, a, 1.01)
    expect(v0(r.project).clips[0].duration).toBeCloseTo(1, 6)
  })
  it('desplaza los keyframes de la mitad derecha', () => {
    let { p, a } = setup()
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, transform: { ...c.transform, x: { value: 0, keyframes: [{ t: 0, v: 0, interp: 'linear' as const }, { t: 3, v: 30, interp: 'linear' as const }] } } } : c)) })) }
    const r = splitClip(p, a, 1)
    expect(v0(r.project).clips[1].transform.x.keyframes!.map((k) => k.t)).toEqual([-1, 2])
  })
})

describe('borrar', () => {
  it('delete deja hueco; ripple lo cierra', () => {
    const { p, a } = setup()
    expect(spans(v0(deleteClips(p, [a])))).toEqual([[4, 7, 0]])
    expect(spans(v0(rippleDelete(p, [a])))).toEqual([[0, 3, 0]])
  })
  it('ripple conserva huecos previos y solo afecta a su pista', () => {
    let { p, b } = setup()
    p = moveClips(p, [b], { dt: 1, dTrack: 0 }) // B en [5,8): hueco [4,5)
    const r = insertAssetClip(p, p.assets.I, p.tracks[0].id, 9)
    p = trimClip(r.project, r.clipId, 'end', 10)
    expect(spans(v0(rippleDelete(p, [b])))).toEqual([[0, 4, 0], [6, 7, 0]])
  })
})

describe('mover', () => {
  it('mueve y sobrescribe lo que hay debajo', () => {
    const { p, b } = setup()
    const r = moveClips(p, [b], { dt: -2, dTrack: 0 })
    expect(spans(v0(r))).toEqual([[0, 2, 0], [2, 5, 0]])
  })
  it('no permite tiempos negativos', () => {
    const { p, a, b } = setup()
    expect(constrainMove(p, [a, b], { dt: -5, dTrack: 0 }).dt).toBe(0)
  })
  it('no mueve vídeo a una pista de audio', () => {
    const { p, a } = setup()
    expect(constrainMove(p, [a], { dt: 0, dTrack: 1 }).dTrack).toBe(0)
  })
  it('mueve entre pistas compatibles y crea pistas nuevas', () => {
    let { p, b } = setup()
    p = addTrack(p, 'video').project // pista nueva arriba → la original pasa al índice 1
    const up = moveClips(p, [b], { dt: 0, dTrack: -1 })
    expect(up.tracks[0].clips.map((c) => c.id)).toEqual([b])
    const fresh = moveClips(p, [b], { dt: 0, dTrack: 0, newTrack: 'top' })
    expect(fresh.tracks).toHaveLength(4)
    expect(fresh.tracks[0].clips.map((c) => c.id)).toEqual([b])
  })
})

describe('recortar bordes (trim)', () => {
  it('no supera la duración del medio ni invade vecinos', () => {
    const { p, a, b } = setup()
    expect(clipEnd(v0(trimClip(p, a, 'end', 6)).clips[0])).toBe(4) // B empieza en 4
    const lone = deleteClips(p, [a])
    expect(clipEnd(v0(trimClip(lone, b, 'end', 30)).clips[0])).toBe(14) // 10 s de medio desde 4
    expect(v0(trimClip(lone, b, 'start', 0)).clips[0].start).toBe(4) // in=0: no puede empezar antes
  })
  it('recortar el inicio avanza el punto de entrada', () => {
    const { p, b } = setup()
    const c = v0(trimClip(p, b, 'start', 5)).clips[1]
    expect([c.start, c.in, c.duration]).toEqual([5, 1, 2])
  })
  it('las imágenes se pueden alargar sin límite', () => {
    let p = createProject()
    p = { ...p, assets: { I: asset('I', Infinity, 'image') } }
    const r = insertAssetClip(p, p.assets.I, p.tracks[0].id, 0)
    expect(clipEnd(v0(trimClip(r.project, r.clipId, 'end', 100)).clips[0])).toBe(100)
  })
})

describe('duplicar, generadores y puntos de edición', () => {
  it('duplica a continuación de la selección', () => {
    const { p, a, b } = setup()
    const r = duplicateClips(p, [a, b])
    expect(spans(v0(r.project))).toEqual([[0, 4, 0], [4, 7, 0], [7, 11, 0], [11, 14, 0]])
    expect(r.newIds).toHaveLength(2)
  })
  it('duplicar desplaza lo que hay detrás en vez de sobrescribirlo', () => {
    const { p, a, b } = setup()
    const r = duplicateClips(p, [a])
    expect(spans(v0(r.project))).toEqual([[0, 4, 0], [4, 8, 0], [8, 11, 0]])
    expect(v0(r.project).clips[2].id).toBe(b)
  })
  it('crea null objects en una pista nueva encima', () => {
    const { p } = setup()
    const r = insertGeneratorClip(p, 'null', 1)
    expect(r.project.tracks[0].clips[0].kind).toBe('null')
    expect(r.project.tracks[0].clips[0].start).toBe(1)
  })
  it('lista los puntos de edición', () => {
    expect(editPoints(setup().p)).toEqual([0, 4, 7])
  })
})

describe('snap y marcadores', () => {
  it('encuentra el punto más cercano dentro del umbral', () => {
    expect(snap([3.95, 6.95], [0, 4, 7.02], 0.1)).toEqual({ delta: expect.closeTo(0.05, 6), point: 4 })
    expect(snap([2], [0, 4], 0.1).point).toBeNull()
  })
  it('incluye bordes de clips (salvo los excluidos), cabezal y marcadores', () => {
    let { p, a } = setup()
    p = addMarker(p, 5.5).project
    expect(snapPoints(p, [a], 1).sort()).toEqual([0, 1, 4, 5.5, 7].sort())
  })
  it('añade, mueve y ordena marcadores sin duplicar', () => {
    let p = createProject()
    const r1 = addMarker(p, 2)
    p = r1.project
    p = addMarker(p, 1).project
    expect(addMarker(p, 2).project).toBe(p)
    p = updateMarker(p, r1.markerId, { t: 0.5 })
    expect(p.markers.map((m) => m.t)).toEqual([0.5, 1])
  })
})

describe('historial con opCommand', () => {
  it('deshace y rehace operaciones de timeline exactamente', () => {
    const { p: p0, a } = setup()
    let p = p0
    let h = emptyHistory()
    ;({ project: p, history: h } = execute(p, h, opCommand('cortar', (x) => splitAt(x, 2, []).project)))
    ;({ project: p, history: h } = execute(p, h, opCommand('ripple', (x) => rippleDelete(x, [a]))))
    const final = p
    let r = undo(p, h)!
    r = undo(r.project, r.history)!
    expect(r.project).toBe(p0)
    r = redo(r.project, r.history)!
    r = redo(r.project, r.history)!
    expect(r.project).toBe(final)
  })
  it('una operación sin efecto no entra en el historial', () => {
    const { p } = setup()
    const r = execute(p, emptyHistory(), opCommand('nada', (x) => splitAt(x, 100, []).project))
    expect(r.history.past).toHaveLength(0)
  })
})
