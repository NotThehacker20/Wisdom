import { evalProp } from './anim'
import { chain, rotation, scaling, translation, type Mat3 } from './mat3'
import type { Clip } from './types'

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
