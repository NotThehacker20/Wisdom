import type { AnimProp } from './types'

/**
 * Evalúa una propiedad animable en un tiempo local de clip.
 * Fase 1: valor estático. La interpolación de keyframes llega en la fase 3.
 */
export function evalProp(p: AnimProp, _localT: number): number {
  return p.value
}
