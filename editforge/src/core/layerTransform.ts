import { evalProp } from './anim'
import { chain, invert, multiply, rotation, scaling, transformPoint, translation, type Mat3 } from './mat3'
import type { Clip, Project } from './types'

export interface ResolvedTransform {
  x: number
  y: number
  scale: number
  rotation: number
  anchorX: number
  anchorY: number
  opacity: number
}

export function resolveTransform(clip: Clip, localT: number): ResolvedTransform {
  const tr = clip.transform
  return {
    x: evalProp(tr.x, localT),
    y: evalProp(tr.y, localT),
    scale: evalProp(tr.scale, localT) / 100,
    rotation: evalProp(tr.rotation, localT),
    anchorX: evalProp(tr.anchorX, localT),
    anchorY: evalProp(tr.anchorY, localT),
    opacity: Math.min(1, Math.max(0, evalProp(tr.opacity, localT) / 100))
  }
}

/**
 * Matriz local de capa en píxeles de proyecto (origen en el centro del lienzo):
 *   T(pos) · R(rot) · S(scale) · T(-anchor)
 * Se le aplica después el tamaño base de la capa (encaje en el lienzo).
 */
export function layerMatrix(r: ResolvedTransform): Mat3 {
  return chain(
    translation(r.x, r.y),
    rotation((r.rotation * Math.PI) / 180),
    scaling(r.scale, r.scale),
    translation(-r.anchorX, -r.anchorY)
  )
}

/** Tamaño base de una capa encajada (contain) dentro del lienzo. */
export function fitContain(srcW: number, srcH: number, dstW: number, dstH: number): [number, number] {
  if (srcW <= 0 || srcH <= 0) return [dstW, dstH]
  const k = Math.min(dstW / srcW, dstH / srcH)
  return [srcW * k, srcH * k]
}

// ───────────────────────────── geometría de capa ─────────────────────────────

/** Tamaño del cuadro de un null object en píxeles de proyecto (solo para el gizmo). */
export const NULL_SIZE = 100

/** Tamaño base (escala 100 %) de una capa en píxeles de proyecto. */
export function layerBaseSize(project: Project, clip: Clip): [number, number] {
  const { width: W, height: H } = project.settings
  if (clip.kind === 'null') return [NULL_SIZE, NULL_SIZE]
  if (clip.kind === 'adjustment') return [W, H]
  const a = clip.assetId ? project.assets[clip.assetId] : undefined
  if (!a || !a.width || !a.height) return [W, H]
  return fitContain(a.width, a.height, W, H)
}

// ───────────────────────────── jerarquía (parenting) ─────────────────────────────

/** Profundidad máxima de la cadena de padres (protege de ciclos en proyectos dañados). */
export const MAX_PARENT_DEPTH = 32

export type ClipIndex = Map<string, Clip>

export function indexClips(project: Project): ClipIndex {
  const m: ClipIndex = new Map()
  for (const t of project.tracks) for (const c of t.clips) m.set(c.id, c)
  return m
}

/** Matriz local de un clip en el tiempo de timeline t (los padres se evalúan en su propio tiempo local). */
export function clipLocalMatrix(clip: Clip, t: number): Mat3 {
  return layerMatrix(resolveTransform(clip, t - clip.start))
}

/**
 * Matriz de mundo (espacio de capa → píxeles de proyecto centrados):
 * mundo(padre) · local(hijo), recorriendo toda la cadena de padres.
 */
export function worldMatrix(project: Project, clip: Clip, t: number, index: ClipIndex = indexClips(project)): Mat3 {
  let m = clipLocalMatrix(clip, t)
  let cur = clip
  for (let depth = 0; cur.parentId && depth < MAX_PARENT_DEPTH; depth++) {
    const parent = index.get(cur.parentId)
    if (!parent) break
    m = multiply(clipLocalMatrix(parent, t), m)
    cur = parent
  }
  return m
}

/** Solo la parte heredada de los padres (identidad si no tiene padre). */
export function parentWorldMatrix(project: Project, clip: Clip, t: number, index: ClipIndex = indexClips(project)): Mat3 {
  const parent = clip.parentId ? index.get(clip.parentId) : undefined
  return parent ? worldMatrix(project, parent, t, index) : chain()
}

export interface LayerGeometry {
  /** Quad unitario ([-0.5,0.5]²) → píxeles de proyecto con origen en el centro. */
  matrix: Mat3
  /** Transformación de mundo de la capa (con padres) sin el tamaño base. */
  local: Mat3
  /** Transformación heredada de los padres (identidad si no tiene). */
  parent: Mat3
  baseW: number
  baseH: number
  resolved: ResolvedTransform
}

export function layerGeometry(project: Project, clip: Clip, localT: number, base?: [number, number], index?: ClipIndex): LayerGeometry {
  const [baseW, baseH] = base ?? layerBaseSize(project, clip)
  const resolved = resolveTransform(clip, localT)
  const parent = clip.parentId ? parentWorldMatrix(project, clip, clip.start + localT, index) : chain()
  const local = multiply(parent, layerMatrix(resolved))
  return { matrix: multiply(local, scaling(baseW, baseH)), local, parent, baseW, baseH, resolved }
}

/** Capa visible más alta bajo un punto (píxeles de proyecto centrados). */
export function hitTestLayers(project: Project, t: number, px: number, py: number): string | null {
  const index = indexClips(project)
  for (const track of project.tracks) {
    if (track.kind !== 'video' || track.hidden || track.locked) continue
    const clip = track.clips.find((c) => t >= c.start && t < c.start + c.duration)
    if (!clip || clip.kind === 'null' || clip.kind === 'adjustment' || clip.kind === 'audio') continue
    const g = layerGeometry(project, clip, t - clip.start, undefined, index)
    if (g.resolved.opacity <= 0) continue
    const [u, v] = transformPoint(invert(g.matrix), px, py)
    if (Math.abs(u) <= 0.5 && Math.abs(v) <= 0.5) return clip.id
  }
  return null
}
