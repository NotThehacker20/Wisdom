import type { MediaAsset, Project } from '@/core/types'
import { mediaUrl } from './media/mediaUrl'

/**
 * Reproducción de audio con Web Audio API. Sirve también de reloj maestro
 * durante la reproducción (el vídeo se sincroniza con el audio).
 * La forma de onda, el scrubbing y los beats llegan en la fase 7.
 */
export class AudioEngine {
  readonly ctx: AudioContext
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private playing: AudioBufferSourceNode[] = []
  private master: GainNode
  private startCtxTime = 0
  private ctxAtStart = 0
  private startPerf = 0
  private startT = 0

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
  }

  load(asset: MediaAsset): Promise<AudioBuffer | null> {
    let p = this.buffers.get(asset.id)
    if (!p) {
      p = (async () => {
        if (!asset.hasAudio) return null
        try {
          const data = await (await fetch(mediaUrl(asset.path))).arrayBuffer()
          return await this.ctx.decodeAudioData(data)
        } catch (e) {
          console.warn(`[EditForge] sin audio decodificable en ${asset.name}`, e)
          return null
        }
      })()
      this.buffers.set(asset.id, p)
    }
    return p
  }

  /** Buffer ya decodificado (o undefined si aún no está listo). */
  private ready = new Map<string, AudioBuffer | null>()

  preload(project: Project): void {
    for (const a of Object.values(project.assets)) {
      if (!a.hasAudio || this.ready.has(a.id)) continue
      void this.load(a).then((b) => this.ready.set(a.id, b))
    }
  }

  /**
   * Reloj de reproducción. Usa el reloj del AudioContext (sincronía exacta con
   * el audio) y, si no avanza (sin dispositivo de salida), performance.now().
   */
  get time(): number {
    const perf = (performance.now() - this.startPerf) / 1000
    const audioAlive = this.ctx.state === 'running' && (this.ctx.currentTime > this.ctxAtStart || perf < 0.3)
    if (audioAlive) return this.startT + Math.max(0, this.ctx.currentTime - this.startCtxTime)
    return this.startT + Math.max(0, perf)
  }

  async start(project: Project, t: number): Promise<void> {
    this.stop()
    this.startT = t
    this.startPerf = performance.now()
    this.ctxAtStart = this.ctx.currentTime
    this.startCtxTime = this.ctx.currentTime
    if (this.ctx.state !== 'running') {
      // resume() puede no resolverse nunca si no hay salida de audio.
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 300))])
      if ((this.ctx.state as AudioContextState) !== 'running') return
    }
    const lead = 0.05 // margen para programar sin cortes
    this.ctxAtStart = this.ctx.currentTime
    this.startCtxTime = this.ctx.currentTime + lead
    this.startPerf = performance.now() + lead * 1000
    for (const track of project.tracks) {
      if (track.muted) continue
      for (const clip of track.clips) {
        if (clip.muted || !clip.assetId) continue
        const end = clip.start + clip.duration
        if (end <= t) continue
        const buffer = this.ready.get(clip.assetId)
        if (!buffer) continue
        const skip = Math.max(0, t - clip.start)
        const offset = clip.in + skip
        if (offset >= buffer.duration) continue
        const node = this.ctx.createBufferSource()
        node.buffer = buffer
        const gain = this.ctx.createGain()
        gain.gain.value = clip.volume
        node.connect(gain).connect(this.master)
        const when = this.startCtxTime + Math.max(0, clip.start - t)
        node.start(when, offset, clip.duration - skip)
        this.playing.push(node)
      }
    }
  }

  stop(): void {
    for (const n of this.playing) {
      try {
        n.stop()
      } catch {
        /* ya parado */
      }
      n.disconnect()
    }
    this.playing = []
  }

  dispose(): void {
    this.stop()
    void this.ctx.close()
  }
}
