import { describe, expect, it } from 'vitest'
import { indexClips, layerGeometry, worldMatrix } from '@/core/layerTransform'
import { transformPoint, type Mat3 } from '@/core/mat3'
import { canParent, childrenOf, createNullParent, deleteClipsKeepChildren, setParent } from '@/core/parenting'
import { createClipFromAsset, createGeneratorClip, createProject } from '@/core/project'
import { setPropValue, toggleKeyframes, updateClip } from '@/core/props'
import { insertClip } from '@/core/timeline'
import type { Clip, MediaAsset, Project } from '@/core/types'

const asset: MediaAsset = { id: 'A', kind: 'video', name: 'a', path: '/a', duration: 10, width: 1920, height: 1080, hasAudio: false, hasVideo: true }

/** Null N (pista 0) y clips A, B (pistas propias), todos de 0 a 5 s. */
function setup() {
  let p: Project = { ...createProject(), assets: { A: asset } }
  const add = (c: Clip) => {
    const r = insertClip(p, c, null)
    p = r.project
    return r.clipId
  }
  const a = add({ ...createClipFromAsset(asset, 0), duration: 5 })
  const b = add({ ...createClipFromAsset(asset, 0), duration: 5 })
  const n = add(createGeneratorClip('null', 0, 5))
  return { p, a, b, n }
}
const clip = (p: Project, id: string) => indexClips(p).get(id)!
const set = (p: Project, id: string, path: string, v: number, t = 0) => setPropValue(p, id, path, t, v)
/** Varias propiedades de un clip a la vez: sets(p, id, { x: 10, rotation: 90 }) */
const sets = (p: Project, id: string, vals: Record<string, number>, t = 0) =>
  Object.entries(vals).reduce((q, [k, v]) => setPropValue(q, id, `transform.${k}`, t, v), p)
const world = (p: Project, id: string, t = 0) => worldMatrix(p, clip(p, id), t)
const expectSameMatrix = (a: Mat3, b: Mat3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4))

describe('matriz de mundo', () => {
  it('el hijo hereda posición, rotación y escala del padre', () => {
    let { p, a, n } = setup()
    p = sets(p, n, { x: 100, rotation: 90, scale: 200 })
    p = updateClip(p, a, (c) => ({ ...c, parentId: n }))
    p = set(p, a, 'transform.x', 10)
    // El punto local (0,0) de A está en x=10 del espacio del null: rotado 90° y escalado ×2 → (100, 20)
    const [x, y] = transformPoint(world(p, a), 0, 0)
    expect(x).toBeCloseTo(100, 6)
    expect(y).toBeCloseTo(20, 6)
  })
  it('cadenas de varios niveles y anclaje del padre', () => {
    let { p, a, b, n } = setup()
    p = sets(p, n, { x: 50, anchorX: 10 }) // el null se desplaza 50 y su anclaje 10
    p = updateClip(p, b, (c) => ({ ...c, parentId: n }))
    p = updateClip(p, a, (c) => ({ ...c, parentId: b }))
    p = set(p, b, 'transform.y', 30)
    expect(transformPoint(world(p, a), 0, 0)).toEqual([40, 30])
  })
  it('un padre animado arrastra a sus hijos (caso de uso: shake/zoom en el null)', () => {
    let { p, a, n } = setup()
    p = toggleKeyframes(p, n, ['transform.scale'], 0)
    p = set(p, n, 'transform.scale', 150, 1)
    p = updateClip(p, a, (c) => ({ ...c, parentId: n }))
    p = set(p, a, 'transform.x', 100)
    expect(transformPoint(world(p, a, 0), 0, 0)[0]).toBeCloseTo(100, 6)
    expect(transformPoint(world(p, a, 0.5), 0, 0)[0]).toBeCloseTo(125, 6)
    expect(transformPoint(world(p, a, 1), 0, 0)[0]).toBeCloseTo(150, 6)
  })
  it('el padre se evalúa en su propio tiempo local aunque empiece en otro momento', () => {
    let { p, a } = setup()
    const late = insertClip(p, createGeneratorClip('null', 2, 3), null)
    p = late.project
    p = toggleKeyframes(p, late.clipId, ['transform.x'], 0) // keyframe local 0 = timeline 2 s
    p = set(p, late.clipId, 'transform.x', 300, 1) // local 1 = timeline 3 s
    p = updateClip(p, a, (c) => ({ ...c, parentId: late.clipId }))
    expect(transformPoint(world(p, a, 2.5), 0, 0)[0]).toBeCloseTo(150, 6)
    expect(transformPoint(world(p, a, 0), 0, 0)[0]).toBeCloseTo(0, 6) // antes del padre: primer keyframe
  })
  it('la geometría para el render incluye la herencia; la opacidad no se hereda', () => {
    let { p, a, n } = setup()
    p = sets(p, n, { x: 100, opacity: 0 })
    p = updateClip(p, a, (c) => ({ ...c, parentId: n }))
    const g = layerGeometry(p, clip(p, a), 0)
    expect(transformPoint(g.matrix, 0, 0)).toEqual([100, 0])
    expect(g.resolved.opacity).toBe(1)
  })
})

describe('emparentar', () => {
  it('impide ciclos, emparentarse a sí mismo y el audio', () => {
    let { p, a, b, n } = setup()
    p = setParent(p, [a], b, 0)
    p = setParent(p, [b], n, 0)
    expect(canParent(p, n, a)).toBe(false) // n → a → b → n sería un ciclo
    expect(canParent(p, a, a)).toBe(false)
    expect(setParent(p, [n], a, 0)).toBe(p)
    const audio = insertClip(p, { ...createClipFromAsset({ ...asset, id: 'S', kind: 'audio' }, 0) }, null)
    expect(canParent(audio.project, a, audio.clipId)).toBe(false)
  })
  it('sin salto: la capa no se mueve en pantalla al emparentar ni al desemparentar', () => {
    let { p, a, n } = setup()
    p = sets(p, n, { x: 120, y: -40, rotation: 30, scale: 150 })
    p = sets(p, a, { x: 300, rotation: -10, scale: 80 })
    p = set(p, a, 'transform.anchorX', 25)
    const before = world(p, a)
    p = setParent(p, [a], n, 0)
    expect(clip(p, a).parentId).toBe(n)
    expectSameMatrix(world(p, a), before)
    p = setParent(p, [a], null, 0)
    expect(clip(p, a).parentId).toBeUndefined()
    expectSameMatrix(world(p, a), before)
    expect(clip(p, a).transform.x.value).toBeCloseTo(300, 4)
  })
  it('con salto (keep=false) conserva los valores locales', () => {
    let { p, a, n } = setup()
    p = set(p, n, 'transform.x', 100)
    p = set(p, a, 'transform.x', 10)
    p = setParent(p, [a], n, 0, false)
    expect(clip(p, a).transform.x.value).toBe(10)
    expect(transformPoint(world(p, a), 0, 0)[0]).toBe(110)
  })
  it('compensa los keyframes de un hijo animado (exacto en t0 y con padre estático)', () => {
    let { p, a, n } = setup()
    p = sets(p, n, { x: 100, rotation: 90 })
    p = toggleKeyframes(p, a, ['transform.x', 'transform.scale'], 0)
    p = sets(p, a, { x: 200, scale: 50 }, 2)
    const w0 = world(p, a, 0)
    const w2 = world(p, a, 2)
    const wMid = world(p, a, 1.3)
    p = setParent(p, [a], n, 0)
    expectSameMatrix(world(p, a, 0), w0)
    expectSameMatrix(world(p, a, 2), w2)
    // y no estaba animada, pero con el padre rotado ahora tiene que estarlo
    expect(clip(p, a).transform.y.keyframes?.length).toBe(2)
    // también entre keyframes (interpolación lineal en ambos ejes)
    expectSameMatrix(world(p, a, 1.3), wMid)
  })
  it('cambiar de un padre a otro no mueve la capa', () => {
    let { p, a, b, n } = setup()
    p = sets(p, n, { x: 80, scale: 50 })
    p = sets(p, b, { y: -60, rotation: 45 })
    p = setParent(p, [a], n, 0)
    const before = world(p, a)
    p = setParent(p, [a], b, 0)
    expectSameMatrix(world(p, a), before)
  })
})

describe('null padre y borrado', () => {
  it('«crear null padre» cubre el rango de los clips y los emparenta sin moverlos', () => {
    let { p, a, b } = setup()
    p = set(p, a, 'transform.x', 200)
    const wa = world(p, a)
    const r = createNullParent(p, [a, b], 1)
    p = r.project
    const nul = clip(p, r.nullId!)
    expect(nul.kind).toBe('null')
    expect([nul.start, nul.duration]).toEqual([0, 5])
    expect(p.tracks[0].clips[0].id).toBe(r.nullId) // pista nueva arriba del todo
    expect(childrenOf(p, r.nullId!).map((c) => c.id).sort()).toEqual([a, b].sort())
    expectSameMatrix(world(p, a), wa)
  })
  it('borrar un padre pasa sus hijos al abuelo sin que salten', () => {
    let { p, a, b, n } = setup()
    p = sets(p, n, { x: 100, scale: 200 })
    p = sets(p, b, { y: 50, rotation: 20 })
    p = setParent(p, [b], n, 0)
    p = setParent(p, [a], b, 0, false)
    p = set(p, a, 'transform.x', 30)
    const wa = world(p, a)
    p = deleteClipsKeepChildren(p, [b], 0)
    expect(clip(p, a).parentId).toBe(n)
    expectSameMatrix(world(p, a), wa)
    p = deleteClipsKeepChildren(p, [n], 0)
    expect(clip(p, a).parentId).toBeUndefined()
    expectSameMatrix(world(p, a), wa)
  })
})
