import { uid } from './id'
import {
  PROJECT_VERSION,
  type AnimProp,
  type Clip,
  type MediaAsset,
  type Project,
  type ProjectSettings,
  type Track,
  type TrackKind,
  type Transform
} from './types'

export const prop = (value: number): AnimProp => ({ value })

export function defaultTransform(): Transform {
  return {
    x: prop(0),
    y: prop(0),
    scale: prop(100),
    rotation: prop(0),
    anchorX: prop(0),
    anchorY: prop(0),
    opacity: prop(100)
  }
}

export const PRESETS: Record<string, Pick<ProjectSettings, 'width' | 'height'>> = {
  'Vertical 1080x1920': { width: 1080, height: 1920 },
  'Horizontal 1920x1080': { width: 1920, height: 1080 },
  'Cuadrado 1080x1080': { width: 1080, height: 1080 },
  '4K 3840x2160': { width: 3840, height: 2160 }
}

export function createProject(name = 'Sin título'): Project {
  return {
    version: PROJECT_VERSION,
    name,
    settings: { width: 1080, height: 1920, fps: 30, background: [0, 0, 0] },
    assets: {},
    tracks: [createTrack('video', 'Vídeo 1'), createTrack('audio', 'Audio 1')]
  }
}

export function createTrack(kind: TrackKind, name: string): Track {
  return { id: uid('trk_'), kind, name, hidden: false, muted: false, locked: false, clips: [] }
}

/** Duración por defecto de una imagen al añadirla a la timeline. */
export const DEFAULT_IMAGE_DURATION = 3

export function createClipFromAsset(asset: MediaAsset, start: number): Clip {
  const duration = asset.kind === 'image' ? DEFAULT_IMAGE_DURATION : asset.duration
  return {
    id: uid('clp_'),
    kind: asset.kind,
    assetId: asset.id,
    name: asset.name,
    start,
    duration,
    in: 0,
    transform: defaultTransform(),
    volume: 1
  }
}

export function trackEnd(track: Track): number {
  return track.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0)
}

export function projectDuration(p: Project): number {
  return p.tracks.reduce((m, t) => Math.max(m, trackEnd(t)), 0)
}

/** Clips activos en el instante t (start <= t < start+duration). */
export function clipAt(track: Track, t: number): Clip | undefined {
  return track.clips.find((c) => t >= c.start && t < c.start + c.duration)
}

/** Tiempo de origen (en el medio) para un tiempo de timeline. */
export function sourceTime(clip: Clip, t: number): number {
  return clip.in + (t - clip.start)
}

export function findClip(p: Project, clipId: string): { track: Track; clip: Clip } | undefined {
  for (const track of p.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return { track, clip }
  }
  return undefined
}

/** Ajusta un tiempo a la rejilla de fotogramas del proyecto. */
export function snapToFrame(t: number, fps: number): number {
  return Math.round(t * fps) / fps
}
