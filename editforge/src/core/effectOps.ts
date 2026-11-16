/** Operaciones puras sobre la pila de efectos de los clips. */
import { BEZIER_PRESETS } from './easing'
import { createEffectInstance, getEffect, type EffectPreset } from './effects'
import { uid } from './id'
import { createGeneratorClip } from './project'
import { updateClip } from './props'
import { frameRound, insertClip } from './timeline'
import type { AnimProp, Clip, EffectInstance, Keyframe, Project } from './types'

const mapFx = (p: Project, clipId: string, fn: (list: EffectInstance[]) => EffectInstance[]): Project =>
  updateClip(p, clipId, (c) => ({ ...c, effects: fn(c.effects ?? []) }))

/** Los efectos de audio no tienen sentido en clips de audio. */
export const acceptsEffects = (c: Clip): boolean => c.kind !== 'audio'

export function addEffect(p: Project, clipIds: string[], type: string): { project: Project; fxIds: string[] } {
  const fxIds: string[] = []
  for (const id of clipIds) {
    const clip = p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)
    if (!clip || !acceptsEffects(clip)) continue
    const fx = createEffectInstance(type)
    fxIds.push(fx.id)
    p = mapFx(p, id, (list) => [...list, fx])
  }
  return { project: p, fxIds }
}

export function removeEffect(p: Project, clipId: string, fxId: string): Project {
  return mapFx(p, clipId, (list) => list.filter((f) => f.id !== fxId))
}

export function moveEffect(p: Project, clipId: string, fxId: string, dir: -1 | 1): Project {
  return mapFx(p, clipId, (list) => {
    const i = list.findIndex((f) => f.id === fxId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return list
    const out = [...list]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  })
}

export function setEffectEnabled(p: Project, clipId: string, fxId: string, enabled: boolean): Project {
  return mapFx(p, clipId, (list) => list.map((f) => (f.id === fxId ? { ...f, enabled } : f)))
}

export function setEffectString(p: Project, clipId: string, fxId: string, name: string, value: string): Project {
  return mapFx(p, clipId, (list) => list.map((f) => (f.id === fxId ? { ...f, strings: { ...f.strings, [name]: value } } : f)))
}

/**
 * Aplica un preset: los números fijan el valor (y quitan keyframes); las listas
 * crean keyframes relativos al instante `localT` (p. ej. un punch-in).
 */
export function applyPreset(p: Project, clipId: string, fxId: string, preset: EffectPreset, localT: number): Project {
  const fps = p.settings.fps
  return mapFx(p, clipId, (list) =>
    list.map((f) => {
      if (f.id !== fxId) return f
      const params: Record<string, AnimProp> = { ...f.params }
      const strings = { ...f.strings }
      for (const [name, v] of Object.entries(preset.values)) {
        if (typeof v === 'string') strings[name] = v
        else if (typeof v === 'number') params[name] = { value: v }
        else {
          // [t, v, curva]: la curva describe cómo se LLEGA a ese valor desde el anterior.
          const keyframes: Keyframe[] = v.map(([t, val]) => ({ id: uid('kf_'), t: frameRound(localT + t, fps), v: val, interp: 'linear' as const }))
          for (let i = 1; i < keyframes.length; i++) {
            const ease = v[i][2]
            const prev = keyframes[i - 1]
            if (!ease || ease === 'linear') continue
            if (ease === 'easeOutBack') Object.assign(prev, { interp: 'bezier', ease: 'easeOutBack' })
            else {
              const h = BEZIER_PRESETS[ease]
              Object.assign(prev, { interp: 'bezier', ease: 'custom', outX: h.outX, outY: h.outY })
              Object.assign(keyframes[i], { inX: h.inX, inY: h.inY })
            }
          }
          params[name] = { value: keyframes[0]?.v ?? 0, keyframes }
        }
      }
      return { ...f, params, strings }
    })
  )
}

/** Copia profunda con ids nuevos (efectos y keyframes). */
export function cloneEffects(list: EffectInstance[]): EffectInstance[] {
  return list.map((f) => ({
    ...f,
    id: uid('fx_'),
    params: Object.fromEntries(
      Object.entries(f.params).map(([n, pr]) => [n, pr.keyframes ? { ...pr, keyframes: pr.keyframes.map((k) => ({ ...k, id: uid('kf_') })) } : { ...pr }])
    ),
    strings: f.strings ? { ...f.strings } : undefined
  }))
}

export function pasteEffects(p: Project, clipIds: string[], list: EffectInstance[]): Project {
  for (const id of clipIds) {
    p = updateClip(p, id, (c) => (acceptsEffects(c) ? { ...c, effects: [...(c.effects ?? []), ...cloneEffects(list)] } : c))
  }
  return p
}

/** Capa de ajuste nueva (pista arriba del todo) con un efecto, en el cabezal. */
export function addAdjustmentWithEffect(p: Project, type: string, t: number, duration = 3): { project: Project; clipId: string } {
  const m = getEffect(type)
  const clip = createGeneratorClip('adjustment', frameRound(t, p.settings.fps), duration)
  clip.name = m ? m.name : 'Ajuste'
  clip.effects = [createEffectInstance(type)]
  return insertClip(p, clip, null)
}
