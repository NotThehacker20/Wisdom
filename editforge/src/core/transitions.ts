/**
 * Transiciones: manifiestos (registro extensible, como los efectos) y
 * operaciones puras.
 *
 * Una transición vive en el clip B (`transitionIn`) y está activa cuando el
 * clip anterior A de la misma pista termina justo donde empieza B. Su ventana
 * está centrada en el corte: [corte − d/2, corte + d/2). Durante ella se
 * renderizan A (más allá de su salida) y B (antes de su entrada) y el shader
 * de la transición los mezcla.
 */
import { cubicBezier, PRESET_FUNCTIONS, BEZIER_PRESETS } from './easing'
import type { EffectRenderAPI, ParamDef } from './effects'
import { uid } from './id'
import { updateClip } from './props'
import { clipSourceTime } from './speed'
import { clipEnd, EPS, frameRound } from './timeline'
import type { Clip, EasingPreset, Project, Track, TransitionInstance } from './types'

export interface TransitionManifest {
  id: string
  name: string
  description?: string
  params: ParamDef[]
  /** Duración por defecto (s). */
  duration?: number
  /** Curva por defecto. */
  ease?: string
  /**
   * GLSL con `vec4 transition(vec2 uv, float p)`; p = progreso con curva (0 → A, 1 → B).
   * Dispone de getFrom(uv) / getTo(uv) (con bordes en espejo), uFrom/uTo y las ayudas de los efectos.
   */
  glsl?: string
  render?: (api: EffectRenderAPI, from: unknown, to: unknown, output: unknown, progress: number, params: Record<string, number>) => void
}

const registry = new Map<string, TransitionManifest>()

export function registerTransition(m: TransitionManifest): void {
  if (!m.glsl && !m.render) throw new Error(`La transición ${m.id} no tiene shader`)
  registry.set(m.id, m)
}
export const getTransition = (id: string): TransitionManifest | undefined => registry.get(id)
export const listTransitions = (): TransitionManifest[] => [...registry.values()]

export const DEFAULT_TRANSITION_DURATION = 0.5

/** Curvas disponibles para el progreso de una transición. */
export const TRANSITION_EASES: Array<{ id: string; label: string }> = [
  { id: 'linear', label: 'Lineal' },
  { id: 'easeIn', label: 'Ease in' },
  { id: 'easeOut', label: 'Ease out' },
  { id: 'easeInOut', label: 'Ease in/out' },
  { id: 'easeInOutExpo', label: 'InOut Expo' },
  { id: 'easeOutBack', label: 'Out Back' }
]

/** Aplica una curva a u ∈ [0,1]. */
export function easeProgress(ease: string, u: number): number {
  const x = Math.min(1, Math.max(0, u))
  if (ease in PRESET_FUNCTIONS) return PRESET_FUNCTIONS[ease as EasingPreset](x)
  if (ease in BEZIER_PRESETS) {
    const h = BEZIER_PRESETS[ease as keyof typeof BEZIER_PRESETS]
    return cubicBezier(h.outX, h.outY, h.inX, h.inY, x)
  }
  return x
}

/** Solo los clips con imagen (vídeo, foto, texto) admiten transiciones. */
export const acceptsTransition = (c: Clip): boolean => c.kind === 'video' || c.kind === 'image' || c.kind === 'text'

export interface Cut {
  a: Clip
  b: Clip
  /** Instante del corte. */
  t: number
}

/** Cortes de una pista: pares de clips contiguos (sin hueco) que admiten transición. */
export function findCuts(track: Track): Cut[] {
  const out: Cut[] = []
  for (let i = 1; i < track.clips.length; i++) {
    const a = track.clips[i - 1]
    const b = track.clips[i]
    if (Math.abs(clipEnd(a) - b.start) < 1e-4 && acceptsTransition(a) && acceptsTransition(b)) out.push({ a, b, t: b.start })
  }
  return out
}

export interface ActiveTransition extends Cut {
  trans: TransitionInstance
  start: number
  end: number
}

/** Transiciones válidas de una pista (las de clips que ya no están en un corte se ignoran). */
export function trackTransitions(track: Track): ActiveTransition[] {
  return findCuts(track)
    .filter((c) => c.b.transitionIn && getTransition(c.b.transitionIn.type))
    .map((c) => {
      const d = c.b.transitionIn!.duration
      return { ...c, trans: c.b.transitionIn!, start: c.t - d / 2, end: c.t + d / 2 }
    })
}

/** Transición activa de una pista en el instante t, si la hay. */
export function transitionAt(track: Track, t: number): ActiveTransition | undefined {
  return trackTransitions(track).find((x) => t >= x.start - EPS && t < x.end - EPS)
}

/**
 * Duración máxima en un corte: cada mitad no puede superar el clip vecino,
 * ni solaparse con las transiciones del otro extremo de A y de B.
 */
export function maxTransitionDuration(track: Track, bId: string): number {
  const i = track.clips.findIndex((c) => c.id === bId)
  const a = track.clips[i - 1]
  const b = track.clips[i]
  if (!a || !b) return 0
  const aIn = a.transitionIn && track.clips[i - 2] && Math.abs(clipEnd(track.clips[i - 2]) - a.start) < 1e-4 ? a.transitionIn.duration / 2 : 0
  const next = track.clips[i + 1]
  const bOut = next?.transitionIn && Math.abs(clipEnd(b) - next.start) < 1e-4 ? next.transitionIn.duration / 2 : 0
  return Math.max(0, 2 * Math.min(a.duration - aIn, b.duration - bOut))
}

function trackOf(p: Project, clipId: string): Track | undefined {
  return p.tracks.find((t) => t.clips.some((c) => c.id === clipId))
}

/** Pone (o sustituye) la transición en el corte de entrada del clip B. */
export function setTransition(p: Project, bId: string, type: string, duration?: number): Project {
  const m = getTransition(type)
  const track = trackOf(p, bId)
  if (!m || !track || track.locked) return p
  if (!findCuts(track).some((c) => c.b.id === bId)) return p
  const prev = track.clips.find((c) => c.id === bId)!.transitionIn
  const params: Record<string, number> = {}
  const strings: Record<string, string> = {}
  for (const d of m.params) {
    if (d.type === 'color' || d.type === 'file' || d.type === 'curves') strings[d.name] = String(d.default)
    else params[d.name] = Number(d.default)
  }
  const max = maxTransitionDuration(track, bId)
  const want = duration ?? prev?.duration ?? m.duration ?? DEFAULT_TRANSITION_DURATION
  const trans: TransitionInstance = {
    id: prev?.id ?? uid('tr_'),
    type,
    duration: clampDuration(want, max, p.settings.fps),
    ease: prev?.ease ?? m.ease ?? 'easeInOut',
    params,
    ...(Object.keys(strings).length ? { strings } : {})
  }
  return updateClip(p, bId, (c) => ({ ...c, transitionIn: trans }))
}

function clampDuration(d: number, max: number, fps: number): number {
  const min = 2 / fps
  return Math.max(min, Math.min(max, Math.round(d * fps) / fps))
}

export function updateTransition(p: Project, bId: string, patch: Partial<Pick<TransitionInstance, 'duration' | 'ease' | 'params' | 'strings'>>): Project {
  const track = trackOf(p, bId)
  if (!track || track.locked) return p
  return updateClip(p, bId, (c) => {
    if (!c.transitionIn) return c
    const next = { ...c.transitionIn, ...patch }
    if (patch.params) next.params = { ...c.transitionIn.params, ...patch.params }
    if (patch.strings) next.strings = { ...c.transitionIn.strings, ...patch.strings }
    if (patch.duration !== undefined) next.duration = clampDuration(patch.duration, maxTransitionDuration(track, bId), p.settings.fps)
    return { ...c, transitionIn: next }
  })
}

export function removeTransition(p: Project, bId: string): Project {
  return updateClip(p, bId, (c) => {
    if (!c.transitionIn) return c
    const { transitionIn: _t, ...rest } = c
    return rest
  })
}

/** El corte más cercano a t (en pistas de vídeo desbloqueadas), opcionalmente solo en una pista. */
export function nearestCut(p: Project, t: number, trackId?: string): Cut | undefined {
  let best: Cut | undefined
  for (const tr of p.tracks) {
    if (tr.kind !== 'video' || tr.locked || (trackId && tr.id !== trackId)) continue
    for (const c of findCuts(tr)) if (!best || Math.abs(c.t - t) < Math.abs(best.t - t)) best = c
  }
  return best
}

/** Tiempo de origen de un clip para un tiempo de timeline, limitado al material disponible (congela si falta). */
export function clampedSourceTime(clip: Clip, t: number, mediaDuration: number, fps: number): number {
  const src = clipSourceTime(clip, t - clip.start)
  if (!isFinite(mediaDuration)) return Math.max(0, src)
  return Math.min(Math.max(0, src), Math.max(0, mediaDuration - 0.5 / fps))
}

export const snapTransitionDuration = (d: number, fps: number): number => frameRound(d, fps)
