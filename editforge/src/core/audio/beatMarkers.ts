import { localTimeForSource } from '../speed'
import { clipEnd } from '../timeline'
import type { Clip, Project } from '../types'
import { gridTimes, type BeatAnalysis, type BeatGrid } from './beats'

export interface BeatPoint {
  /** Tiempo en la timeline. */
  t: number
  /** Primer beat del compás (cada 4). */
  strong: boolean
  clipId: string
}

/** Rejilla efectiva de un clip: por defecto, beats en los clips de audio y nada en el resto. */
export const effectiveGrid = (c: Clip): BeatGrid => c.beatGrid ?? (c.kind === 'audio' ? 'beats' : 'off')

/**
 * Marcadores de beat de la timeline, derivados del análisis de cada medio y
 * de la rejilla de cada clip: siguen al clip si se mueve, recorta o corta.
 */
export function projectBeatPoints(project: Project, analysis: (assetId: string) => BeatAnalysis | undefined): BeatPoint[] {
  const out: BeatPoint[] = []
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const grid = effectiveGrid(clip)
      if (grid === 'off' || !clip.assetId) continue
      const a = analysis(clip.assetId)
      if (!a) continue
      const strongSet = new Set(a.beats.filter((_, i) => i % 4 === 0))
      const end = clipEnd(clip)
      for (const s of gridTimes(a, grid)) {
        const t = clip.start + localTimeForSource(clip, s)
        if (t < clip.start - 1e-6 || t > end + 1e-6) continue
        out.push({ t, strong: grid !== 'onsets' && strongSet.has(s), clipId: clip.id })
      }
    }
  }
  return out.sort((x, y) => x.t - y.t)
}
