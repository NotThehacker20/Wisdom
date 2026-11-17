/** Operaciones de velocidad sobre el proyecto. */
import { BEZIER_PRESETS } from './easing'
import { uid } from './id'
import { SPEED_PRESETS, integral, sourceSpan } from './speed'
import { clipEnd, EPS, frameRound } from './timeline'
import type { AnimProp, Clip, Keyframe, Project } from './types'

function findClip(p: Project, id: string): { clip: Clip; trackId: string } | undefined {
  for (const t of p.tracks) {
    const clip = t.clips.find((c) => c.id === id)
    if (clip) return { clip, trackId: t.id }
  }
  return undefined
}

/**
 * Sustituye un clip y desplaza (ripple) los que venían detrás en su pista
 * cuando cambia su duración, como hace CapCut al cambiar la velocidad.
 */
function replaceWithRipple(p: Project, trackId: string, old: Clip, next: Clip): Project {
  const delta = clipEnd(next) - clipEnd(old)
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      if (t.id !== trackId) return t
      return {
        ...t,
        clips: t.clips.map((c) => {
          if (c.id === old.id) return next
          if (delta !== 0 && c.start >= clipEnd(old) - EPS) return { ...c, start: c.start + delta }
          return c
        })
      }
    })
  }
}

/** Velocidad constante: conserva el fragmento del medio y ajusta la duración. */
export function setConstantSpeed(p: Project, clipId: string, percent: number): Project {
  const f = findClip(p, clipId)
  if (!f) return p
  const fps = p.settings.fps
  const pct = Math.min(1000, Math.max(1, percent))
  const span = sourceSpan(f.clip)
  const next: Clip = { ...f.clip, duration: Math.max(1 / fps, frameRound(span / (pct / 100), fps)) }
  if (pct === 100) delete next.speed
  else next.speed = { value: pct }
  return replaceWithRipple(p, f.trackId, f.clip, next)
}

/** Curva de velocidad predefinida: conserva el fragmento del medio y ajusta la duración. */
export function applySpeedPreset(p: Project, clipId: string, presetId: string): Project {
  const f = findClip(p, clipId)
  const preset = SPEED_PRESETS.find((x) => x.id === presetId)
  if (!f || !preset) return p
  const fps = p.settings.fps
  const span = sourceSpan(f.clip)
  const h = BEZIER_PRESETS.easeInOut
  const keys = (D: number): Keyframe[] =>
    preset.points.map(([u, v], i) => ({
      id: uid('kf_'),
      t: u * D,
      v,
      interp: 'bezier' as const,
      ease: 'custom' as const,
      outX: h.outX,
      outY: h.outY,
      ...(i > 0 ? { inX: h.inX, inY: h.inY } : {})
    }))
  // Velocidad media de la curva (con duración 1): D = fragmento / media.
  const unit: Clip = { ...f.clip, speed: { value: preset.points[0][1], keyframes: keys(1) } }
  const mean = integral(unit, 1)
  const D = Math.max(1 / fps, frameRound(span / mean, fps))
  // Al redondear D a fotogramas cambia un poco el fragmento: reescalamos la curva para conservarlo exacto.
  const k = span / (mean * D)
  const scaled = keys(D).map((kf) => ({ ...kf, v: Math.min(1000, Math.max(1, kf.v * k)) }))
  const speed: AnimProp = { value: scaled[0].v, keyframes: scaled }
  return replaceWithRipple(p, f.trackId, f.clip, { ...f.clip, duration: D, speed })
}

/** Quita la velocidad (100 %) conservando el fragmento del medio. */
export function resetSpeed(p: Project, clipId: string): Project {
  return setConstantSpeed(p, clipId, 100)
}

export function setReverse(p: Project, clipId: string, reverse: boolean): Project {
  const f = findClip(p, clipId)
  if (!f) return p
  const next: Clip = { ...f.clip, reverse }
  if (!reverse) delete next.reverse
  return replaceWithRipple(p, f.trackId, f.clip, next)
}

export function setPreservePitch(p: Project, clipId: string, on: boolean): Project {
  const f = findClip(p, clipId)
  if (!f) return p
  const next: Clip = { ...f.clip, preservePitch: on }
  if (!on) delete next.preservePitch
  return replaceWithRipple(p, f.trackId, f.clip, next)
}

export function setFrameInterp(p: Project, clipId: string, mode: NonNullable<Clip['frameInterp']>): Project {
  const f = findClip(p, clipId)
  if (!f) return p
  return replaceWithRipple(p, f.trackId, f.clip, { ...f.clip, frameInterp: mode })
}
