/**
 * Plan de mezcla de audio (puro): qué intervalo suena de cada clip y con qué
 * envolventes. Lo usa el reproductor (AudioContext) y lo usará la exportación
 * (OfflineAudioContext), así suenan igual.
 *
 * Con una transición en un corte, el audio de A sigue sonando durante la
 * segunda mitad de la ventana y el de B empieza en la primera mitad, con un
 * crossfade de potencia constante (cos/sen) para que no haya bajón de volumen.
 * El crossfade se limita a la zona en la que ambos medios tienen material;
 * si no la hay, el corte es seco (con microfundidos para evitar clics).
 */
import { availableLocalRange } from '../speed'
import { clipEnd } from '../timeline'
import { trackTransitions, type ActiveTransition } from '../transitions'
import type { Clip, Project, Track } from '../types'

export interface AudioPlan {
  clip: Clip
  /** Intervalo de timeline que suena (ampliado por las transiciones). */
  from: number
  to: number
  /** Ventanas de crossfade (timeline). */
  xIn?: [number, number]
  xOut?: [number, number]
  /** Fundidos del usuario (timeline). */
  fadeIn?: [number, number]
  fadeOut?: [number, number]
}

/** Microfundido para cortes secos (evita clics). */
export const MICRO_FADE = 0.005

/**
 * Zona real del crossfade de una transición: la parte de su ventana en la que
 * A todavía tiene material después de su salida y B ya lo tiene antes de su
 * entrada. Sin esa zona (clips sin material sobrante) el corte es seco.
 */
export function crossfadeRegion(tr: ActiveTransition, mediaDuration: (c: Clip) => number): [number, number] | null {
  const aAvailEnd = tr.a.start + availableLocalRange(tr.a, mediaDuration(tr.a))[1]
  const bAvailStart = tr.b.start + availableLocalRange(tr.b, mediaDuration(tr.b))[0]
  const from = Math.max(tr.start, bAvailStart)
  const to = Math.min(tr.end, aAvailEnd)
  return to - from >= 0.01 ? [from, to] : null
}

export function audioPlan(track: Track, clip: Clip, mediaDuration: (c: Clip) => number = () => Infinity): AudioPlan {
  const trs = trackTransitions(track)
  const tin = trs.find((x) => x.b.id === clip.id)
  const tout = trs.find((x) => x.a.id === clip.id)
  const plan: AudioPlan = { clip, from: clip.start, to: clipEnd(clip) }
  if (tin) {
    const r = crossfadeRegion(tin, mediaDuration)
    if (r) {
      plan.from = r[0]
      plan.xIn = r
    } else plan.xIn = [clip.start, clip.start + MICRO_FADE]
  }
  if (tout) {
    const r = crossfadeRegion(tout, mediaDuration)
    if (r) {
      plan.to = r[1]
      plan.xOut = r
    } else plan.xOut = [clipEnd(clip) - MICRO_FADE, clipEnd(clip)]
  }
  if (clip.fadeIn && clip.fadeIn > 0) plan.fadeIn = [clip.start, clip.start + clip.fadeIn]
  if (clip.fadeOut && clip.fadeOut > 0) plan.fadeOut = [clipEnd(clip) - clip.fadeOut, clipEnd(clip)]
  return plan
}

const u = (w: [number, number], t: number) => Math.min(1, Math.max(0, (t - w[0]) / (w[1] - w[0] || 1)))

/** Ganancia del crossfade (potencia constante) en t. */
export function crossfadeGain(p: AudioPlan, t: number): number {
  let g = 1
  if (p.xIn) g *= Math.sin((u(p.xIn, t) * Math.PI) / 2)
  if (p.xOut) g *= Math.cos((u(p.xOut, t) * Math.PI) / 2)
  return g
}

/** Ganancia de los fundidos del usuario (lineales) en t. */
export function fadeGain(p: AudioPlan, t: number): number {
  let g = 1
  if (p.fadeIn) g *= u(p.fadeIn, t)
  if (p.fadeOut) g *= 1 - u(p.fadeOut, t)
  return g
}

/** Planes de todos los clips que suenan (pistas y clips no silenciados, con medio con audio). */
export function projectAudioPlans(project: Project): AudioPlan[] {
  const out: AudioPlan[] = []
  for (const track of project.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      if (clip.muted || !clip.assetId) continue
      const a = project.assets[clip.assetId]
      if (!a?.hasAudio || a.missing) continue
      out.push(audioPlan(track, clip, (c) => (c.assetId ? (project.assets[c.assetId]?.duration ?? Infinity) : Infinity)))
    }
  }
  return out
}

export const dbToGain = (db: number): number => (db <= -60 ? 0 : Math.pow(10, db / 20))
export const gainToDb = (g: number): number => (g <= 0.001 ? -60 : 20 * Math.log10(g))
