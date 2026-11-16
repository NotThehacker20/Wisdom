/**
 * Parenting estilo After Effects: operaciones puras sobre el proyecto.
 *
 * Al cambiar el padre de una capa se compensa su transformación para que no
 * «salte» en pantalla: si M = mundo(padreNuevo)⁻¹ · mundo(padreViejo) en el
 * instante t0, la nueva transformación local es M · local. Como todas las
 * transformaciones son semejanzas (posición, rotación, escala uniforme), esto
 * se traduce exactamente en: posición' = M(posición), rotación' = rotación +
 * θ(M), escala' = escala · s(M); el anclaje no cambia.
 */
import { evalProp } from './anim'
import { indexClips, worldMatrix, type ClipIndex } from './layerTransform'
import { chain, invert, multiply, transformPoint, type Mat3 } from './mat3'
import { createGeneratorClip } from './project'
import { updateClip } from './props'
import { clipEnd, deleteClips, frameRound, insertClip, rippleDelete } from './timeline'
import { uid } from './id'
import type { AnimProp, Clip, Keyframe, Project } from './types'

export const canBeParented = (c: Clip): boolean => c.kind !== 'audio'

/** ¿Es `ancestorId` padre (directo o indirecto) de `clipId`? */
export function isAncestor(index: ClipIndex, ancestorId: string, clipId: string): boolean {
  let cur = index.get(clipId)
  for (let d = 0; cur?.parentId && d < 64; d++) {
    if (cur.parentId === ancestorId) return true
    cur = index.get(cur.parentId)
  }
  return false
}

/** Comprueba que `parentId` pueda ser padre de `childId` (sin ciclos ni audio). */
export function canParent(p: Project, childId: string, parentId: string, index: ClipIndex = indexClips(p)): boolean {
  if (childId === parentId) return false
  const child = index.get(childId)
  const parent = index.get(parentId)
  if (!child || !parent || !canBeParented(child) || !canBeParented(parent)) return false
  return !isAncestor(index, childId, parentId)
}

export function childrenOf(p: Project, parentId: string): Clip[] {
  return p.tracks.flatMap((t) => t.clips).filter((c) => c.parentId === parentId)
}

/** Descomposición de una semejanza 2D: escala uniforme y rotación (grados). */
function similarityParts(m: Mat3): { s: number; deg: number } {
  return { s: Math.hypot(m[0], m[1]), deg: (Math.atan2(m[1], m[0]) * 180) / Math.PI }
}

function mapProp(prop: AnimProp, fn: (v: number, t: number | null) => number): AnimProp {
  if (prop.keyframes?.length) return { ...prop, keyframes: prop.keyframes.map((k) => ({ ...k, v: fn(k.v, k.t) })) }
  return { ...prop, value: fn(prop.value, null) }
}

/**
 * Da a x e y keyframes en los mismos instantes (copiando la interpolación del
 * otro eje donde falte), para poder transformar la posición como un punto.
 */
function alignPositionKeys(x: AnimProp, y: AnimProp): [AnimProp, AnimProp] {
  const kx = x.keyframes ?? []
  const ky = y.keyframes ?? []
  const times = [...new Set([...kx, ...ky].map((k) => +k.t.toFixed(6)))].sort((a, b) => a - b)
  const near = (ks: Keyframe[], t: number) => ks.find((k) => Math.abs(k.t - t) < 1e-6)
  const fill = (own: Keyframe[], other: Keyframe[], prop: AnimProp): AnimProp => ({
    ...prop,
    keyframes: times.map((t) => {
      const mine = near(own, t)
      if (mine) return mine
      const o = near(other, t)!
      const { id: _id, v: _v, ...shape } = o
      return { ...shape, id: uid('kf_'), t, v: evalProp(prop, t) }
    })
  })
  return [fill(kx, ky, x), fill(ky, kx, y)]
}

/** Aplica la semejanza M a la transformación local de un clip (incluidos sus keyframes). */
export function applySimilarity(clip: Clip, m: Mat3): Clip {
  const { s, deg } = similarityParts(m)
  let tr = clip.transform
  // Si M rota (mezcla los ejes) y la posición está animada, x e y necesitan keyframes en los mismos instantes.
  const mixes = Math.abs(m[1]) > 1e-9 || Math.abs(m[3]) > 1e-9
  if (mixes && (tr.x.keyframes?.length || tr.y.keyframes?.length)) {
    const [ax, ay] = alignPositionKeys(tr.x, tr.y)
    tr = { ...tr, x: ax, y: ay }
  }
  const tx = tr.x
  const ty = tr.y
  const x = mapProp(tx, (v, t) => transformPoint(m, v, t === null ? ty.value : evalProp(ty, t))[0])
  const y = mapProp(ty, (v, t) => transformPoint(m, t === null ? tx.value : evalProp(tx, t), v)[1])
  return {
    ...clip,
    transform: {
      ...tr,
      x,
      y,
      rotation: mapProp(tr.rotation, (v) => v + deg),
      scale: mapProp(tr.scale, (v) => v * s)
    }
  }
}

/**
 * Cambia el padre de varios clips. Con `keep` (por defecto) compensa la
 * transformación en el instante t0 para que no se muevan en pantalla.
 * Los clips que crearían un ciclo se ignoran.
 */
export function setParent(p: Project, childIds: string[], parentId: string | null, t0: number, keep = true): Project {
  const index = indexClips(p)
  const newParent = parentId ? index.get(parentId) : undefined
  if (parentId && !newParent) return p
  const newParentWorld = newParent ? worldMatrix(p, newParent, t0, index) : chain()
  const invNew = invert(newParentWorld)
  const degenerate = Math.abs(newParentWorld[0] * newParentWorld[4] - newParentWorld[1] * newParentWorld[3]) < 1e-9
  for (const id of childIds) {
    const child = index.get(id)
    if (!child || child.parentId === (parentId ?? undefined)) continue
    if (parentId && !canParent(p, id, parentId, index)) continue
    p = updateClip(p, id, (c) => {
      let next: Clip = { ...c, parentId: parentId ?? undefined }
      if (!parentId) delete next.parentId
      if (keep && !degenerate) {
        const oldParent = c.parentId ? index.get(c.parentId) : undefined
        const oldWorld = oldParent ? worldMatrix(p, oldParent, t0, index) : chain()
        next = applySimilarity(next, multiply(invNew, oldWorld))
      }
      return next
    })
  }
  return p
}

/**
 * «Crear null padre»: añade un null object que cubre el rango de los clips,
 * en una pista nueva encima de todo, y los emparenta a él sin moverlos.
 */
export function createNullParent(p: Project, childIds: string[], t0: number): { project: Project; nullId: string | null } {
  const index = indexClips(p)
  const kids = childIds.map((id) => index.get(id)).filter((c): c is Clip => !!c && canBeParented(c))
  if (!kids.length) return { project: p, nullId: null }
  const start = Math.min(...kids.map((c) => c.start))
  const end = Math.max(...kids.map(clipEnd))
  const nul = createGeneratorClip('null', frameRound(start, p.settings.fps), end - start)
  // Si todos compartían padre, el null hereda ese padre (la jerarquía se conserva).
  const commonParent = kids.every((c) => c.parentId === kids[0].parentId) ? kids[0].parentId : undefined
  if (commonParent) nul.parentId = commonParent
  const r = insertClip(p, nul, null)
  return { project: setParent(r.project, kids.map((c) => c.id), nul.id, t0), nullId: nul.id }
}

/**
 * Borra clips sin que sus hijos salten: antes de borrar, los hijos de los
 * clips eliminados pasan al abuelo (o a ninguno) con compensación en t0.
 */
export function deleteClipsKeepChildren(p: Project, ids: string[], t0: number, ripple = false): Project {
  const removed = new Set(ids)
  const index = indexClips(p)
  for (const c of index.values()) {
    if (!c.parentId || removed.has(c.id) || !removed.has(c.parentId)) continue
    // Primer antepasado que sobrevive.
    let up = index.get(c.parentId)
    while (up && up.parentId && removed.has(up.id)) up = index.get(up.parentId)
    const survivor = up && !removed.has(up.id) ? up.id : null
    p = setParent(p, [c.id], survivor, t0)
  }
  return ripple ? rippleDelete(p, ids) : deleteClips(p, ids)
}
