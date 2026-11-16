import { create } from 'zustand'
import type { BeatAnalysis } from '@/core/audio/beats'
import { mixToMono, type Peaks } from '@/core/audio/peaks'
import type { MediaAsset } from '@/core/types'

export interface AnalysisEntry {
  status: 'analyzing' | 'ready' | 'error'
  peaks?: Peaks
  beats?: BeatAnalysis
  error?: string
}

interface AnalysisState {
  entries: Record<string, AnalysisEntry>
}

/** Resultados del análisis de audio por medio (solo en memoria; se recalcula al abrir el proyecto). */
export const useAudioAnalysis = create<AnalysisState>(() => ({ entries: {} }))

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../engine/audio/analysis.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: string; kind: string; peaks?: Peaks; beats?: BeatAnalysis; message?: string }>) => {
      const { id, kind } = e.data
      useAudioAnalysis.setState((s) => {
        const cur = s.entries[id] ?? { status: 'analyzing' }
        const next: AnalysisEntry =
          kind === 'peaks'
            ? { ...cur, peaks: e.data.peaks }
            : kind === 'beats'
              ? { ...cur, beats: e.data.beats, status: 'ready' }
              : { ...cur, status: 'error', error: e.data.message }
        return { entries: { ...s.entries, [id]: next } }
      })
    }
  }
  return worker
}

/** Analiza (picos + beats) el audio decodificado de un medio, una sola vez por ruta. */
const requested = new Set<string>()
export function analyzeAudio(asset: MediaAsset, buffer: AudioBuffer): void {
  const key = `${asset.id}|${asset.path}`
  if (requested.has(key)) return
  requested.add(key)
  useAudioAnalysis.setState((s) => ({ entries: { ...s.entries, [asset.id]: { status: 'analyzing' } } }))
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const mono = mixToMono(channels)
  getWorker().postMessage({ id: asset.id, samples: mono, sampleRate: buffer.sampleRate }, [mono.buffer])
}

export const beatAnalysisOf = (assetId: string): BeatAnalysis | undefined => useAudioAnalysis.getState().entries[assetId]?.beats
