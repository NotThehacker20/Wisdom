import { describe, expect, it } from 'vitest'
import '@/plugins'
import { applyPreset, addAdjustmentWithEffect, addEffect, cloneEffects, moveEffect, pasteEffects, removeEffect, setEffectEnabled } from '@/core/effectOps'
import { createEffectInstance, evalEffectParams, getEffect, listEffects, registerEffect, resolveTraits, transformDeltas } from '@/core/effects'
import { indexClips, worldMatrix } from '@/core/layerTransform'
import { transformPoint } from '@/core/mat3'
import { fbm1, noise1 } from '@/core/noise'
import { setParent } from '@/core/parenting'
import { createClipFromAsset, createGeneratorClip, createProject } from '@/core/project'
import { clipKeyTimes, clipPropPaths, fxPath, getProp, propDefFor, setPropValue, toggleKeyframes } from '@/core/props'
import { insertClip, splitClip } from '@/core/timeline'
import type { Clip, MediaAsset, Project } from '@/core/types'

const asset: MediaAsset = { id: 'A', kind: 'video', name: 'a', path: '/a', duration: 10, width: 1920, height: 1080, hasAudio: false, hasVideo: true }
function setup() {
  let p: Project = { ...createProject(), assets: { A: asset } }
  const add = (c: Clip) => {
    const r = insertClip(p, c, null)
    p = r.project
    return r.clipId
  }
  const a = add({ ...createClipFromAsset(asset, 0), duration: 5 })
  const n = add(createGeneratorClip('null', 0, 5))
  return { p, a, n }
}
const clip = (p: Project, id: string) => indexClips(p).get(id)!
const origin = (p: Project, id: string, t: number) => transformPoint(worldMatrix(p, clip(p, id), t), 0, 0)

describe('registro de efectos', () => {
  it('registra los efectos integrados con manifiestos válidos', () => {
    const ids = listEffects().map((m) => m.id)
    for (const id of ['shake', 'zoom', 'motionBlur', 'glow', 'rgbSplit', 'color', 'blur', 'lut', 'mirrorTile']) expect(ids).toContain(id)
    for (const m of listEffects()) {
      for (const d of m.params) {
        if (d.type === 'number') {
          expect(d.min).toBeDefined()
          expect(Number(d.default)).toBeGreaterThanOrEqual(d.min!)
          expect(Number(d.default)).toBeLessThanOrEqual(d.max!)
        }
        if (d.type === 'enum') expect(d.options!.length).toBeGreaterThan(Number(d.default))
      }
      for (const pr of m.presets ?? []) for (const k of Object.keys(pr.values)) expect(m.params.map((d) => d.name)).toContain(k)
    }
  })
  it('rechaza manifiestos sin implementación y permite añadir efectos nuevos sin tocar el núcleo', () => {
    expect(() => registerEffect({ id: 'x', name: 'X', category: 'Color', kind: 'pixel', params: [] })).toThrow()
    registerEffect({ id: 'invert', name: 'Invertir', category: 'Color', kind: 'pixel', params: [], glsl: 'vec4 effect(vec2 uv){vec4 c=texture(uTex,uv);return vec4(c.a-c.rgb,c.a);}' })
    expect(getEffect('invert')?.name).toBe('Invertir')
  })
  it('crea instancias con los valores por defecto y evalúa sus parámetros', () => {
    const fx = createEffectInstance('glow')
    const v = evalEffectParams(fx, 0)
    expect(v.threshold).toBe(0.6)
    expect(v.$strings?.tint).toBe('#ffffff')
  })
})

describe('ruido determinista', () => {
  it('es reproducible, continuo y acotado', () => {
    expect(noise1(3.7, 5)).toBe(noise1(3.7, 5))
    expect(noise1(3.7, 5)).not.toBe(noise1(3.7, 6))
    for (let x = 0; x < 50; x += 0.37) {
      expect(Math.abs(fbm1(x, 1))).toBeLessThanOrEqual(1.6)
      expect(Math.abs(fbm1(x + 0.001, 1) - fbm1(x, 1))).toBeLessThan(0.02)
    }
    expect(noise1(4, 1)).toBeCloseTo(0, 6) // ruido de gradiente: 0 en los enteros
  })
})

describe('efectos de transformación', () => {
  it('shake desplaza la capa de forma determinista y cae con «Caída»', () => {
    let { p, a } = setup()
    p = addEffect(p, [a], 'shake').project
    const o1 = origin(p, a, 0.33)
    expect(o1).toEqual(origin(p, a, 0.33))
    expect(Math.hypot(o1[0], o1[1])).toBeGreaterThan(0.5)
    const fx = clip(p, a).effects![0]
    p = setPropValue(p, a, fxPath(fx.id, 'decay'), 0, 0.1)
    const late = transformDeltas(clip(p, a), 3, 30)[0]
    expect(Math.hypot(late.x, late.y)).toBeLessThan(1e-6)
  })
  it('un shake en un null lo heredan sus hijos', () => {
    let { p, a, n } = setup()
    p = setParent(p, [a], n, 0)
    p = addEffect(p, [n], 'shake').project
    expect(origin(p, a, 0.41)).toEqual(origin(p, n, 0.41))
    expect(Math.hypot(...origin(p, a, 0.41))).toBeGreaterThan(0.5)
    const traits = resolveTraits(clip(p, a), 0.41, (c) => (c.parentId ? clip(p, c.parentId) : undefined))
    expect(traits.edge).toBe(1) // espejo heredado
    expect(traits.motionBlur?.shutter).toBeGreaterThan(0)
  })
  it('zoom escala alrededor del anclaje + centro y se anima con un preset', () => {
    let { p, a } = setup()
    p = addEffect(p, [a], 'zoom').project
    const fx = clip(p, a).effects![0]
    const m = worldMatrix(p, clip(p, a), 0)
    expect(Math.hypot(m[0], m[1])).toBeCloseTo(1.2, 6)
    expect(transformPoint(m, 0, 0)).toEqual([0, 0])
    p = applyPreset(p, a, fx.id, getEffect('zoom')!.presets!.find((x) => x.name === 'Punch-in')!, 1)
    const at = (t: number) => Math.hypot(...Array.from(worldMatrix(p, clip(p, a), t)).slice(0, 2))
    expect(at(1)).toBeCloseTo(1, 6)
    expect(at(1.5)).toBeCloseTo(1.3, 6)
    expect(at(1.06)).toBeGreaterThan(1.15) // ease-out: rápido al principio
  })
  it('un efecto desactivado no hace nada', () => {
    let { p, a } = setup()
    p = addEffect(p, [a], 'zoom').project
    p = setEffectEnabled(p, a, clip(p, a).effects![0].id, false)
    expect(Math.hypot(...Array.from(worldMatrix(p, clip(p, a), 0)).slice(0, 2))).toBeCloseTo(1, 6)
  })
})

describe('parámetros de efecto como propiedades animables', () => {
  it('aparecen en las rutas del clip, con su definición, y se animan', () => {
    let { p, a } = setup()
    p = addEffect(p, [a], 'glow').project
    const fx = clip(p, a).effects![0]
    const path = fxPath(fx.id, 'intensity')
    expect(clipPropPaths(clip(p, a))).toContain(path)
    expect(propDefFor(clip(p, a), path)).toMatchObject({ label: 'Glow · Intensidad', min: 0, max: 8 })
    p = toggleKeyframes(p, a, [path], 0)
    p = setPropValue(p, a, path, 1, 4)
    p = setPropValue(p, a, path, 2, 99) // se limita al máximo
    expect(evalEffectParams(clip(p, a).effects![0], 0.5).intensity).toBeCloseTo(2.6, 6)
    expect(getProp(clip(p, a), path)!.keyframes!.map((k) => k.v)).toEqual([1.2, 4, 8])
    expect(clipKeyTimes(clip(p, a))).toEqual([0, 1, 2])
  })
  it('los keyframes de efectos se mueven al cortar', () => {
    let { p, a } = setup()
    p = addEffect(p, [a], 'flash').project
    const path = fxPath(clip(p, a).effects![0].id, 'intensity')
    p = toggleKeyframes(p, a, [path], 3)
    const r = splitClip(p, a, 2)
    const right = clip(r.project, r.rightId!)
    expect(getProp(right, path)!.keyframes![0].t).toBe(1)
  })
})

describe('operaciones de la pila', () => {
  it('añadir, reordenar, quitar; copiar/pegar con ids nuevos; ajuste con efecto', () => {
    let { p, a, n } = setup()
    p = addEffect(p, [a], 'glow').project
    p = addEffect(p, [a], 'rgbSplit').project
    const [g, r] = clip(p, a).effects!
    p = moveEffect(p, a, r.id, -1)
    expect(clip(p, a).effects!.map((f) => f.type)).toEqual(['rgbSplit', 'glow'])
    p = removeEffect(p, a, g.id)
    expect(clip(p, a).effects!.map((f) => f.type)).toEqual(['rgbSplit'])
    const copies = cloneEffects(clip(p, a).effects!)
    expect(copies[0].id).not.toBe(r.id)
    p = pasteEffects(p, [n], copies)
    expect(clip(p, n).effects![0].type).toBe('rgbSplit')
    const adj = addAdjustmentWithEffect(p, 'vhs', 1)
    const ac = clip(adj.project, adj.clipId)
    expect([ac.kind, ac.start, ac.effects![0].type, adj.project.tracks[0].clips[0].id]).toEqual(['adjustment', 1, 'vhs', adj.clipId])
  })
  it('no añade efectos a clips de audio', () => {
    let p = createProject()
    const r = insertClip(p, createClipFromAsset({ ...asset, kind: 'audio' }, 0), null)
    p = r.project
    expect(addEffect(p, [r.clipId], 'glow').fxIds).toHaveLength(0)
  })
})
