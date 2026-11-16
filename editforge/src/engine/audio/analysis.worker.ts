/// <reference lib="webworker" />
import { analyzeBeats } from '@/core/audio/beats'
import { computePeaks } from '@/core/audio/peaks'

/** Análisis de audio fuera del hilo de la interfaz: primero los picos (rápido), luego los beats. */
self.onmessage = (e: MessageEvent<{ id: string; samples: Float32Array; sampleRate: number }>) => {
  const { id, samples, sampleRate } = e.data
  try {
    const peaks = computePeaks(samples, sampleRate)
    ;(self as unknown as Worker).postMessage({ id, kind: 'peaks', peaks }, [peaks.min.buffer, peaks.max.buffer])
    const beats = analyzeBeats(samples, sampleRate)
    ;(self as unknown as Worker).postMessage({ id, kind: 'beats', beats })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
