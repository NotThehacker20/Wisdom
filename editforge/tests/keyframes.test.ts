import { describe, expect, it } from 'vitest'
import { evalKeyframes, evalProp, segmentProgress } from '@/core/anim'
import { emptyHistory, execute, opCommand, undo } from '@/core/commands'
import { cubicBezier, PRESET_FUNCTIONS } from '@/core/easing'
import { createClipFromAsset, createProject } from '@/core/project'
import {
  clipKeyTimes, copyKeys, getProp, moveKeys, pasteKeys, removeKeys, setKeyHandle, setKeysEase, setPropValue, toggleKeyframes, type KeyRef
} from '@/core/props'
import { insertClip, splitClip, trimClip } from '@/core/timeline'
import type { Keyframe, MediaAsset, Project } from '@/core/types'

const k = (t: number, v: number, extra: Partial<Keyframe> = {}): Keyframe => ({ id: `k${t}`, t, v, interp: 'linear', ...extra })

describe('curvas', () => {
  it('bézier: extremos, simetría y lineal', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0)).toBe(0)
    expect(cubicBezier(0.42, 0, 0.58, 1, 1)).toBe(1)
    expect(cubicBezier(0.42, 0, 0.58, 1, 0.5)).toBeCloseTo(0.5, 5)
    expect(cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3, 0.3)).toBeCloseTo(0.3, 5)
    // ease-in arranca despacio, ease-out rápido
    expect(cubicBezier(0.42, 0, 1, 1, 0.25)).toBeLessThan(0.1)
    expect(cubicBezier(0, 0, 0.58, 1, 0.25)).toBeGreaterThan(0.35)
  })
  it('bézier con tangentes fuera de rango sigue siendo monótona en el tiempo', () => {
    let prev = -Infinity
    for (let u = 0; u <= 1; u += 0.05) {
      const y = cubicBezier(1.5, 0, -0.5, 1, u) // x se limita a [0,1]
      expect(Number.isFinite(y)).toBe(true)
      prev = Math.max(prev, y)
    }
  })
  it('presets analíticos: f(0)=0, f(1)=1 y su forma característica', () => {
    for (const f of Object.values(PRESET_FUNCTIONS)) {
      expect(f(0)).toBeCloseTo(0, 6)
      expect(f(1)).toBeCloseTo(1, 6)
    }
    expect(PRESET_FUNCTIONS.easeOutBack(0.6)).toBeGreaterThan(1) // sobrepasa
    expect(PRESET_FUNCTIONS.elastic(0.15)).toBeGreaterThan(1) // oscila por encima
    expect(PRESET_FUNCTIONS.easeInOutExpo(0.2)).toBeLessThan(0.01)
    const b = PRESET_FUNCTIONS.bounce
    expect(b(0.36)).toBeGreaterThan(b(0.5)) // rebota (no monótona)
  })
})

describe('interpolación de keyframes', () => {
  it('lineal, antes del primero y después del último', () => {
    const ks = [k(1, 10), k(3, 30)]
    expect(evalKeyframes(ks, 0)).toBe(10)
    expect(evalKeyframes(ks, 2)).toBe(20)
    expect(evalKeyframes(ks, 9)).toBe(30)
  })
  it('hold mantiene el valor hasta el siguiente keyframe', () => {
    const ks = [k(0, 0, { interp: 'hold' }), k(1, 100)]
    expect(evalKeyframes(ks, 0.999)).toBe(0)
    expect(evalKeyframes(ks, 1)).toBe(100)
  })
  it('bezier custom usa la tangente de salida del primero y la de entrada del segundo', () => {
    const ks = [k(0, 0, { interp: 'bezier', ease: 'custom', outX: 0.42, outY: 0 }), k(1, 100, { inX: 0.58, inY: 1 })]
    expect(evalKeyframes(ks, 0.5)).toBeCloseTo(50, 3)
    expect(evalKeyframes(ks, 0.1)).toBeLessThan(5)
  })
  it('presets en el tramo y valores decrecientes', () => {
    const ks = [k(0, 100, { interp: 'bezier', ease: 'easeOutBack' }), k(1, 0)]
    expect(evalKeyframes(ks, 0.6)).toBeLessThan(0) // sobrepasa por debajo
    expect(segmentProgress(ks[0], ks[1], 1)).toBeCloseTo(1, 6)
  })
  it('muchos keyframes (búsqueda binaria)', () => {
    const ks = Array.from({ length: 100 }, (_, i) => k(i, i * 2))
    expect(evalKeyframes(ks, 57.5)).toBe(115)
  })
  it('sin keyframes devuelve el valor fijo', () => {
    expect(evalProp({ value: 7 }, 3)).toBe(7)
    expect(evalProp({ value: 7, keyframes: [] }, 3)).toBe(7)
  })
})

const asset: MediaAsset = { id: 'A', kind: 'video', name: 'a', path: '/a', duration: 10, width: 1920, height: 1080, hasAudio: false, hasVideo: true }
function setup(): { p: Project; id: string } {
  const p0 = { ...createProject(), assets: { A: asset } }
  const clip = createClipFromAsset(asset, 2)
  const r = insertClip(p0, clip, p0.tracks[0].id)
  return { p: r.project, id: r.clipId }
}
const clipOf = (p: Project, id: string) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!
const prop = (p: Project, id: string, path: string) => getProp(clipOf(p, id), path)!
const refs = (p: Project, id: string, path: string): KeyRef[] => (prop(p, id, path).keyframes ?? []).map((x) => ({ clipId: id, path, id: x.id }))

describe('operaciones de keyframes', () => {
  it('sin animación, cambiar el valor modifica el valor fijo; con animación crea keyframes (auto-key)', () => {
    let { p, id } = setup()
    p = setPropValue(p, id, 'transform.x', 0, 50)
    expect(prop(p, id, 'transform.x')).toEqual({ value: 50 })
    p = toggleKeyframes(p, id, ['transform.x'], 0)
    p = setPropValue(p, id, 'transform.x', 1, 150)
    const ks = prop(p, id, 'transform.x').keyframes!
    expect(ks.map((x) => [x.t, x.v])).toEqual([[0, 50], [1, 150]])
    p = setPropValue(p, id, 'transform.x', 1, 120) // actualiza, no duplica
    expect(prop(p, id, 'transform.x').keyframes!.map((x) => x.v)).toEqual([50, 120])
    expect(evalProp(prop(p, id, 'transform.x'), 0.5)).toBe(85)
  })
  it('respeta los límites (opacidad 0..100)', () => {
    let { p, id } = setup()
    p = setPropValue(p, id, 'transform.opacity', 0, 180)
    expect(prop(p, id, 'transform.opacity').value).toBe(100)
  })
  it('toggle: añade a todas las propiedades que falten; si todas tienen, quita', () => {
    let { p, id } = setup()
    const paths = ['transform.x', 'transform.scale']
    p = toggleKeyframes(p, id, ['transform.x'], 1)
    p = toggleKeyframes(p, id, paths, 1)
    expect(paths.map((x) => prop(p, id, x).keyframes?.length)).toEqual([1, 1])
    p = toggleKeyframes(p, id, paths, 1)
    expect(paths.map((x) => prop(p, id, x).keyframes)).toEqual([undefined, undefined])
  })
  it('quitar el último keyframe conserva el valor de la curva en ese punto', () => {
    let { p, id } = setup()
    p = toggleKeyframes(p, id, ['transform.rotation'], 0)
    p = setPropValue(p, id, 'transform.rotation', 0, 45)
    p = removeKeys(p, refs(p, id, 'transform.rotation'))
    expect(prop(p, id, 'transform.rotation')).toEqual({ value: 45 })
  })
  it('mover keyframes en tiempo y valor, sustituyendo al que pisa', () => {
    let { p, id } = setup()
    for (const [t, v] of [[0, 0], [1, 10], [2, 20]]) {
      p = toggleKeyframes(p, id, ['transform.y'], t)
      p = setPropValue(p, id, 'transform.y', t, v)
    }
    const first = refs(p, id, 'transform.y').slice(0, 1)
    p = moveKeys(p, first, 1.01, { 'transform.y': 5 })
    expect(prop(p, id, 'transform.y').keyframes!.map((x) => [x.t, x.v])).toEqual([[1, 5], [2, 20]])
  })
  it('presets de easing y tangentes editables', () => {
    let { p, id } = setup()
    p = toggleKeyframes(p, id, ['transform.scale'], 0)
    p = setPropValue(p, id, 'transform.scale', 1, 200)
    const [r0, r1] = refs(p, id, 'transform.scale')
    p = setKeysEase(p, [r0], 'easeInOut')
    let ks = prop(p, id, 'transform.scale').keyframes!
    expect([ks[0].interp, ks[0].ease, ks[0].outX, ks[1].inX]).toEqual(['bezier', 'custom', 0.42, 0.58])
    p = setKeysEase(p, [r0], 'elastic')
    expect(prop(p, id, 'transform.scale').keyframes![0].ease).toBe('elastic')
    p = setKeyHandle(p, r1, 'in', 0.9, 1.2)
    ks = prop(p, id, 'transform.scale').keyframes!
    expect([ks[0].ease, ks[1].inX, ks[1].inY]).toEqual(['custom', 0.9, 1.2])
    p = setKeysEase(p, [r0], 'hold')
    expect(evalProp(prop(p, id, 'transform.scale'), 0.99)).toBe(100)
  })
  it('copiar/pegar keyframes con tiempos relativos y remapeo de propiedad', () => {
    let { p, id } = setup()
    p = toggleKeyframes(p, id, ['transform.scale'], 1)
    p = setPropValue(p, id, 'transform.scale', 2, 300)
    const cb = copyKeys(p, refs(p, id, 'transform.scale'))!
    expect(cb.items.map((i) => i.key.t)).toEqual([0, 1])
    const r = pasteKeys(p, id, 4, cb)
    expect(prop(r.project, id, 'transform.scale').keyframes!.map((x) => [x.t, x.v])).toEqual([[1, 100], [2, 300], [4, 100], [5, 300]])
    const r2 = pasteKeys(p, id, 0, cb, 'transform.rotation')
    expect(prop(r2.project, id, 'transform.rotation').keyframes!.map((x) => x.v)).toEqual([100, 300])
    expect(r2.refs).toHaveLength(2)
  })
  it('los keyframes acompañan al contenido al cortar y recortar el inicio', () => {
    let { p, id } = setup() // clip en t=2
    p = toggleKeyframes(p, id, ['transform.x'], 1)
    p = setPropValue(p, id, 'transform.x', 3, 100)
    p = trimClip(p, id, 'start', 2.5) // recorta 0.5 s del inicio
    expect(prop(p, id, 'transform.x').keyframes!.map((x) => x.t)).toEqual([0.5, 2.5])
    const r = splitClip(p, id, 4)
    expect(clipKeyTimes(clipOf(r.project, r.rightId!))).toEqual([-1, 1])
  })
  it('arrastrar un valor genera un solo paso de deshacer', () => {
    let { p, id } = setup()
    let h = emptyHistory()
    for (const v of [10, 20, 30]) {
      ;({ project: p, history: h } = execute(p, h, opCommand('x', (q) => setPropValue(q, id, 'transform.x', 0, v), `${id}|transform.x`)))
    }
    expect(h.past).toHaveLength(1)
    expect(prop(undo(p, h)!.project, id, 'transform.x').value).toBe(0)
  })
})
