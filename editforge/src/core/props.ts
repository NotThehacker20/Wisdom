/**
 * Propiedades animables direccionadas por ruta ('transform.x', y en la
 * fase 5 'fx.<id>.<param>') y operaciones puras de keyframes.
 */
import { evalProp, isAnimated, KEY_EPS } from './anim'
import { getEffect, isNumericParam } from './effects'
import { BEZIER_PRESETS, type BezierPresetName } from './easing'
import { uid } from './id'
import { frameRound } from './timeline'
import type { AnimProp, Clip, EasingPreset, Keyframe, Project, Transform } from './types'

export type PropPath = string

export interface PropDef {
  path: PropPath
  label: string
  unit?: string
  step: number
  min?: number
  max?: number
  decimals: number
  /** Color de la curva en el graph editor. */
  color: string
  /** Valor por defecto (doble clic en la etiqueta lo restablece). */
  default: number
}

export const TRANSFORM_PROPS: PropDef[] = [
  { path: 'transform.x', default: 0, label: 'Posición X', unit: 'px', step: 1, decimals: 1, color: '#ff6b6b' },
  { path: 'transform.y', default: 0, label: 'Posición Y', unit: 'px', step: 1, decimals: 1, color: '#51cf66' },
  { path: 'transform.scale', default: 100, label: 'Escala', unit: '%', step: 0.5, min: 0, decimals: 1, color: '#4dabf7' },
  { path: 'transform.rotation', default: 0, label: 'Rotación', unit: '°', step: 0.5, decimals: 1, color: '#ffd43b' },
  { path: 'transform.anchorX', default: 0, label: 'Anclaje X', unit: 'px', step: 1, decimals: 1, color: '#f783ac' },
  { path: 'transform.anchorY', default: 0, label: 'Anclaje Y', unit: 'px', step: 1, decimals: 1, color: '#9775fa' },
  { path: 'transform.opacity', default: 100, label: 'Opacidad', unit: '%', step: 0.5, min: 0, max: 100, decimals: 1, color: '#e9ecef' }
]

const DEFS = new Map(TRANSFORM_PROPS.map((d) => [d.path, d]))

/** Registro extensible: los plugins de efectos (fase 5) añaden aquí sus parámetros. */
export function registerPropDef(def: PropDef): void {
  DEFS.set(def.path, def)
}

export function propDef(path: PropPath): PropDef | undefined {
  return DEFS.get(path)
}

/** Propiedades de transformación de un clip. */
export function transformPaths(clip: Clip): PropPath[] {
  if (clip.kind === 'audio') return []
  if (clip.kind === 'adjustment') return ['transform.opacity']
  if (clip.kind === 'null') return TRANSFORM_PROPS.filter((d) => d.path !== 'transform.opacity').map((d) => d.path)
  return TRANSFORM_PROPS.map((d) => d.path)
}

export const fxPath = (fxId: string, param: string): PropPath => `fx.${fxId}.${param}`

/** Propiedades animables de un clip: transformación + parámetros numéricos de sus efectos. */
export function clipPropPaths(clip: Clip): PropPath[] {
  const out = transformPaths(clip)
  for (const fx of clip.effects ?? []) {
    const m = getEffect(fx.type)
    for (const d of m?.params ?? []) if (d.type === 'number') out.push(fxPath(fx.id, d.name))
  }
  return out
}

export function getProp(clip: Clip, path: PropPath): AnimProp | undefined {
  const [root, key, param] = path.split('.')
  if (root === 'transform') return clip.transform[key as keyof Transform]
  if (root === 'fx') {
    const fx = clip.effects?.find((e) => e.id === key)
    if (!fx) return undefined
    if (fx.params[param]) return fx.params[param]
    const d = getEffect(fx.type)?.params.find((x) => x.name === param)
    return d && isNumericParam(d) ? { value: Number(d.default) } : undefined
  }
  return undefined
}

function withProp(clip: Clip, path: PropPath, prop: AnimProp): Clip {
  const [root, key, param] = path.split('.')
  if (root === 'transform') return { ...clip, transform: { ...clip.transform, [key]: prop } }
  if (root === 'fx') {
    return { ...clip, effects: (clip.effects ?? []).map((e) => (e.id === key ? { ...e, params: { ...e.params, [param]: prop } } : e)) }
  }
  return clip
}

const FX_COLORS = ['#ff922b', '#22d3c5', '#cc5de8', '#94d82d', '#ff8787', '#74c0fc', '#ffe066', '#63e6be']

/** Definición de una propiedad, también para los parámetros de efecto (necesita el clip para saber el tipo). */
export function propDefFor(clip: Clip, path: PropPath): PropDef | undefined {
  const base = DEFS.get(path)
  if (base) return base
  const [root, key, param] = path.split('.')
  if (root !== 'fx') return undefined
  const idx = (clip.effects ?? []).findIndex((e) => e.id === key)
  const fx = clip.effects?.[idx]
  const m = fx && getEffect(fx.type)
  const d = m?.params.find((x) => x.name === param)
  if (!m || !d) return undefined
  const pi = m.params.indexOf(d)
  return {
    path,
    label: `${m.name} · ${d.label}`,
    unit: d.unit,
    step: d.step ?? ((d.max ?? 100) - (d.min ?? 0)) / 200,
    min: d.min,
    max: d.max,
    decimals: d.decimals ?? 2,
    color: FX_COLORS[(idx * 3 + pi) % FX_COLORS.length],
    default: Number(d.default)
  }
}

function clampFor(clip: Clip | undefined, path: PropPath, v: number): number {
  const d = clip ? propDefFor(clip, path) : DEFS.get(path)
  if (!d) return v
  return Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v))
}

export function clampToDef(path: PropPath, v: number): number {
  return clampFor(undefined, path, v)
}

export function updateClip(p: Project, clipId: string, fn: (c: Clip) => Clip): Project {
  let changed = false
  const tracks = p.tracks.map((t) => {
    if (!t.clips.some((c) => c.id === clipId)) return t
    return {
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c
        const n = fn(c)
        if (n !== c) changed = true
        return n
      })
    }
  })
  return changed ? { ...p, tracks } : p
}

function findClipById(p: Project, clipId: string): Clip | undefined {
  for (const t of p.tracks) for (const c of t.clips) if (c.id === clipId) return c
  return undefined
}

const sortKeys = (ks: Keyframe[]): Keyframe[] => [...ks].sort((a, b) => a.t - b.t)

function newKey(t: number, v: number, like?: Keyframe): Keyframe {
  return { id: uid('kf_'), t, v, interp: like?.interp ?? 'linear', ease: like?.ease }
}

/** Inserta o actualiza el keyframe en t. */
function upsertKey(prop: AnimProp, t: number, v: number): AnimProp {
  const ks = prop.keyframes ?? []
  const at = ks.find((k) => Math.abs(k.t - t) < KEY_EPS)
  if (at) return { ...prop, keyframes: ks.map((k) => (k === at ? { ...k, v } : k)) }
  // El keyframe nuevo hereda la interpolación del anterior (como After Effects).
  const prev = [...ks].reverse().find((k) => k.t < t)
  return { ...prop, keyframes: sortKeys([...ks, newKey(t, v, prev)]) }
}

/**
 * Cambia el valor de una propiedad en el tiempo local t. Si la propiedad está
 * animada se crea/actualiza un keyframe (auto-key); si no, cambia el valor fijo.
 */
export function setPropValue(p: Project, clipId: string, path: PropPath, localT: number, v: number): Project {
  const t = frameRound(localT, p.settings.fps)
  return updateClip(p, clipId, (c) => {
    const value = clampFor(c, path, v)
    const prop = getProp(c, path)
    if (!prop) return c
    if (isAnimated(prop)) return withProp(c, path, upsertKey(prop, t, value))
    if (prop.value === value) return c
    return withProp(c, path, { ...prop, value })
  })
}

/**
 * Alt+K / botón ◆: si todas las propiedades tienen keyframe en t, los quita;
 * si no, añade los que falten con el valor actual de la curva.
 */
export function toggleKeyframes(p: Project, clipId: string, paths: PropPath[], localT: number): Project {
  const t = frameRound(localT, p.settings.fps)
  const clip = findClipById(p, clipId)
  if (!clip) return p
  const props = paths.map((path) => ({ path, prop: getProp(clip, path) })).filter((x) => x.prop) as Array<{ path: string; prop: AnimProp }>
  const allHave = props.length > 0 && props.every(({ prop }) => prop.keyframes?.some((k) => Math.abs(k.t - t) < KEY_EPS))
  return updateClip(p, clipId, (c) => {
    let next = c
    for (const { path, prop } of props) {
      const ks = prop.keyframes ?? []
      if (allHave) {
        const keep = ks.filter((k) => Math.abs(k.t - t) >= KEY_EPS)
        // Al quitar el último keyframe, la propiedad conserva el valor que tenía en ese instante.
        next = withProp(next, path, keep.length ? { ...prop, keyframes: keep } : { value: evalProp(prop, t) })
      } else if (!ks.some((k) => Math.abs(k.t - t) < KEY_EPS)) {
        next = withProp(next, path, upsertKey(prop, t, evalProp(prop, t)))
      }
    }
    return next
  })
}

// ───────────────────────────── selección de keyframes ─────────────────────────────

export interface KeyRef {
  clipId: string
  path: PropPath
  id: string
}

export const keyRefId = (r: KeyRef): string => `${r.clipId}|${r.path}|${r.id}`

/** Aplica fn a cada propiedad afectada por la selección. */
function mapSelectedProps(p: Project, refs: KeyRef[], fn: (prop: AnimProp, ids: Set<string>, path: PropPath, clip: Clip) => AnimProp): Project {
  const byClip = new Map<string, Map<PropPath, Set<string>>>()
  for (const r of refs) {
    const m = byClip.get(r.clipId) ?? new Map<PropPath, Set<string>>()
    const s = m.get(r.path) ?? new Set<string>()
    s.add(r.id)
    m.set(r.path, s)
    byClip.set(r.clipId, m)
  }
  for (const [clipId, paths] of byClip) {
    p = updateClip(p, clipId, (c) => {
      let next = c
      for (const [path, ids] of paths) {
        const prop = getProp(next, path)
        if (prop?.keyframes) next = withProp(next, path, fn(prop, ids, path, next))
      }
      return next
    })
  }
  return p
}

export function removeKeys(p: Project, refs: KeyRef[]): Project {
  return mapSelectedProps(p, refs, (prop, ids) => {
    const ks = prop.keyframes!
    const keep = ks.filter((k) => !ids.has(k.id))
    if (keep.length === ks.length) return prop
    if (keep.length) return { ...prop, keyframes: keep }
    return { value: ks[0].v } // sin keyframes: valor fijo
  })
}

/**
 * Mueve keyframes en tiempo (dt) y valor (dv por propiedad). Si un keyframe
 * cae sobre otro que no se mueve, lo sustituye.
 */
export function moveKeys(p: Project, refs: KeyRef[], dt: number, dvByPath: Record<PropPath, number> = {}): Project {
  const fps = p.settings.fps
  return mapSelectedProps(p, refs, (prop, ids, path, clip) => {
    const dv = dvByPath[path] ?? 0
    const moved = prop.keyframes!.filter((k) => ids.has(k.id)).map((k) => ({ ...k, t: frameRound(k.t + dt, fps), v: clampFor(clip, path, k.v + dv) }))
    const stay = prop.keyframes!.filter((k) => !ids.has(k.id) && !moved.some((m) => Math.abs(m.t - k.t) < KEY_EPS))
    return { ...prop, keyframes: sortKeys([...stay, ...moved]) }
  })
}

export type EaseChoice = BezierPresetName | EasingPreset | 'hold'

/** Aplica una interpolación/curva al tramo saliente de cada keyframe seleccionado. */
export function setKeysEase(p: Project, refs: KeyRef[], choice: EaseChoice): Project {
  return mapSelectedProps(p, refs, (prop, ids) => {
    const ks = prop.keyframes!
    const out = ks.map((k) => ({ ...k }))
    for (let i = 0; i < out.length; i++) {
      const k = out[i]
      if (!ids.has(k.id)) continue
      if (choice === 'hold') {
        k.interp = 'hold'
      } else if (choice === 'linear') {
        k.interp = 'linear'
        k.ease = undefined
      } else if (choice in BEZIER_PRESETS) {
        const h = BEZIER_PRESETS[choice as BezierPresetName]
        k.interp = 'bezier'
        k.ease = 'custom'
        k.outX = h.outX
        k.outY = h.outY
        if (out[i + 1]) {
          out[i + 1].inX = h.inX
          out[i + 1].inY = h.inY
        }
      } else {
        k.interp = 'bezier'
        k.ease = choice as EasingPreset
      }
    }
    return { ...prop, keyframes: out }
  })
}

/**
 * Mueve una tangente bézier (coordenadas normalizadas del tramo). Convierte
 * el tramo afectado en bézier 'custom'.
 */
export function setKeyHandle(p: Project, ref: KeyRef, side: 'in' | 'out', x: number, y: number): Project {
  const hx = Math.min(1, Math.max(0, x))
  return mapSelectedProps(p, [ref], (prop, ids) => {
    const ks = prop.keyframes!.map((k) => ({ ...k }))
    const i = ks.findIndex((k) => ids.has(k.id))
    if (i < 0) return prop
    if (side === 'out') {
      if (!ks[i + 1]) return prop
      Object.assign(ks[i], { interp: 'bezier', ease: 'custom', outX: hx, outY: y })
    } else {
      if (!ks[i - 1]) return prop
      Object.assign(ks[i], { inX: hx, inY: y })
      Object.assign(ks[i - 1], { interp: 'bezier', ease: 'custom' })
      ks[i - 1].outX ??= 0.33
      ks[i - 1].outY ??= 0
    }
    return { ...prop, keyframes: ks }
  })
}

// ───────────────────────────── copiar / pegar ─────────────────────────────

export interface KeyClipboard {
  items: Array<{ path: PropPath; key: Omit<Keyframe, 'id'> }>
}

/** Copia keyframes con tiempos relativos al primero. */
export function copyKeys(p: Project, refs: KeyRef[]): KeyClipboard | null {
  const items: KeyClipboard['items'] = []
  for (const r of refs) {
    const c = findClipById(p, r.clipId)
    const k = c && getProp(c, r.path)?.keyframes?.find((x) => x.id === r.id)
    if (k) {
      const { id: _id, ...rest } = k
      items.push({ path: r.path, key: rest })
    }
  }
  if (!items.length) return null
  const t0 = Math.min(...items.map((i) => i.key.t))
  return { items: items.map((i) => ({ path: i.path, key: { ...i.key, t: i.key.t - t0 } })) }
}

/**
 * Pega keyframes en un clip a partir de localT. Si el portapapeles contiene
 * una sola propiedad y se indica `target`, se pegan en esa propiedad
 * (p. ej. copiar la escala de un clip a la rotación de otro).
 */
export function pasteKeys(p: Project, clipId: string, localT: number, cb: KeyClipboard, target?: PropPath): { project: Project; refs: KeyRef[] } {
  const paths = new Set(cb.items.map((i) => i.path))
  const remap = (path: PropPath) => (paths.size === 1 && target ? target : path)
  const refs: KeyRef[] = []
  const fps = p.settings.fps
  const project = updateClip(p, clipId, (c) => {
    let next = c
    for (const item of cb.items) {
      const path = remap(item.path)
      const prop = getProp(next, path)
      if (!prop) continue
      const t = frameRound(localT + item.key.t, fps)
      const k: Keyframe = { ...item.key, id: uid('kf_'), t, v: clampFor(next, path, item.key.v) }
      const ks = (prop.keyframes ?? []).filter((x) => Math.abs(x.t - t) >= KEY_EPS)
      next = withProp(next, path, { ...prop, keyframes: sortKeys([...ks, k]) })
      refs.push({ clipId, path, id: k.id })
    }
    return next
  })
  return { project, refs }
}

/** Todos los tiempos (locales) con keyframe en un clip, para dibujarlos en la timeline. */
export function clipKeyTimes(clip: Clip): number[] {
  const s = new Set<number>()
  for (const path of clipPropPaths(clip)) for (const k of getProp(clip, path)?.keyframes ?? []) s.add(+k.t.toFixed(4))
  return [...s].sort((a, b) => a - b)
}
