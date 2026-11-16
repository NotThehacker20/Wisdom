import { create } from 'zustand'
import { encodeWav } from '@/core/audio/wav'
import { projectAudioPlans } from '@/core/audio/mix'
import { projectDuration } from '@/core/project'
import type { Project } from '@/core/types'
import { scheduleAudio } from '@/engine/audio/schedule'
import { MediaPool } from '@/engine/MediaPool'
import { Renderer } from '@/engine/Renderer'
import { CODEC_INFO, outputSize, type ExportCodec, type ExportSettings } from '../../electron/ffmpegArgs'
import { playback } from './playback'
import { useProject } from './projectStore'

export interface ExportOptions {
  codec: ExportCodec
  width: number
  height: number
  fps: number
  bitrate: number
  audio: boolean
  output: string
}

export interface ExportProgress {
  phase: 'idle' | 'audio' | 'video' | 'finishing' | 'done' | 'error' | 'cancelled'
  frame: number
  total: number
  /** Fotogramas por segundo de exportación. */
  speed: number
  /** Segundos restantes estimados. */
  eta: number
  output: string
  message?: string
  log?: string
  elapsed: number
}

export const useExport = create<{ progress: ExportProgress }>(() => ({
  progress: { phase: 'idle', frame: 0, total: 0, speed: 0, eta: 0, output: '', elapsed: 0 }
}))

let cancelRequested = false
export function cancelExport(): void {
  cancelRequested = true
}

const set = (p: Partial<ExportProgress>) => useExport.setState((s) => ({ progress: { ...s.progress, ...p } }))

/** Tamaño del render encajado (misma proporción que el proyecto) dentro de la salida. */
export function exportFitSize(project: Project, outW: number, outH: number): [number, number] {
  const { width: W, height: H } = project.settings
  const k = Math.min(outW / W, outH / H)
  return [Math.min(outW, Math.round(W * k)), Math.min(outH, Math.round(H * k))]
}

/** Mezcla el audio del proyecto con el mismo planificador que la reproducción. */
export async function renderProjectAudio(project: Project, duration: number, sampleRate = 48000): Promise<Uint8Array | null> {
  const plans = projectAudioPlans(project)
  if (!plans.length) return null
  const assets = [...new Set(plans.map((p) => p.clip.assetId!))].map((id) => project.assets[id])
  const buffers = new Map<string, AudioBuffer | null>()
  await Promise.all(assets.map(async (a) => buffers.set(a.id, await playback.audio.load(a))))
  if (![...buffers.values()].some(Boolean)) return null
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate)
  scheduleAudio(ctx, ctx.destination, project, (id) => buffers.get(id), 0, 0)
  const out = await ctx.startRendering()
  return encodeWav([out.getChannelData(0), out.getChannelData(1)], sampleRate)
}

/**
 * Exporta el proyecto: audio → FFmpeg → render fotograma a fotograma con el
 * mismo motor que la previsualización (en un canvas y un pool de decodificadores
 * propios) → píxeles por pipe. Mientras FFmpeg recibe un fotograma se renderiza el siguiente.
 */
export async function runExport(opts: ExportOptions): Promise<ExportProgress> {
  const api = window.editforge
  if (!api) throw new Error('La exportación necesita la app de escritorio')
  cancelRequested = false
  playback.pause()
  const project = useProject.getState().project // instantánea: editar durante la exportación no la afecta
  const duration = projectDuration(project)
  const total = Math.max(1, Math.ceil(duration * opts.fps - 1e-6))
  const started = performance.now()
  set({ phase: 'audio', frame: 0, total, speed: 0, eta: 0, output: opts.output, message: undefined, log: undefined, elapsed: 0 })

  const settings: ExportSettings = { codec: opts.codec, width: opts.width, height: opts.height, fps: opts.fps, bitrate: opts.bitrate, output: opts.output }
  const [outW, outH] = outputSize(settings)
  const [cw, ch] = exportFitSize(project, outW, outH)

  let wav: Uint8Array | null = null
  try {
    if (opts.audio && CODEC_INFO[opts.codec].audio) wav = await renderProjectAudio(project, duration)
  } catch (e) {
    console.warn('[EditForge] no se pudo mezclar el audio', e)
  }

  const canvas = document.createElement('canvas')
  const renderer = new Renderer(canvas)
  const pool = new MediaPool()
  renderer.setSize(cw, ch)
  let id = 0
  try {
    // Calentamiento: abre los medios y carga recursos asíncronos (LUTs) antes del primer fotograma.
    let lutLoaded = false
    renderer.onAsyncResource = () => (lutLoaded = true)
    await renderer.renderToPixels(project, 0, pool, outW, outH)
    if (project.tracks.some((t) => t.clips.some((c) => c.effects?.some((f) => f.type === 'lut')))) {
      for (let i = 0; i < 40 && !lutLoaded; i++) await new Promise((r) => setTimeout(r, 50))
    }

    id = await api.exportStart(settings, wav)
    set({ phase: 'video' })
    let pending: Promise<boolean> | null = null
    for (let i = 0; i < total; i++) {
      if (cancelRequested) break
      const px = await renderer.renderToPixels(project, i / opts.fps, pool, outW, outH)
      if (pending && !(await pending)) break // FFmpeg dejó de aceptar fotogramas: el error lo da finish
      pending = api.exportFrame(id, px)
      const elapsed = (performance.now() - started) / 1000
      const speed = (i + 1) / Math.max(1e-3, elapsed)
      if (i % 2 === 0 || i === total - 1) set({ frame: i + 1, speed, eta: (total - i - 1) / Math.max(1e-3, speed), elapsed })
    }
    if (pending) await pending
    if (cancelRequested) {
      await api.exportCancel(id)
      set({ phase: 'cancelled', message: 'Exportación cancelada' })
    } else {
      set({ phase: 'finishing' })
      const res = await api.exportFinish(id)
      const elapsed = (performance.now() - started) / 1000
      set(res.ok ? { phase: 'done', elapsed, message: undefined } : { phase: 'error', message: 'FFmpeg terminó con un error', log: res.log, elapsed })
    }
  } catch (e) {
    if (id) await api.exportCancel(id).catch(() => undefined)
    set({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
  } finally {
    renderer.dispose()
    pool.dispose()
    ;(canvas.getContext('webgl2') as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
  }
  return useExport.getState().progress
}
