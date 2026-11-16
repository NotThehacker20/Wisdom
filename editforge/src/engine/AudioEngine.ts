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
        if (!asset.hasAudio || asset.missing) return null
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
      const key = `${a.id}|${a.path}`
      if (!a.hasAudio || a.missing || this.loadedKeys.has(key)) continue
      this.loadedKeys.add(key)
      this.buffers.delete(a.id) // ruta nueva (revinculado): recargar
      void this.load(a).then((b) => this.ready.set(a.id, b))
    }
  }

  private loadedKeys = new Set<string>()
  private lastScrub = 0

  /** Audio del scrubbing: un fragmento corto en t (con fundidos para evitar clics). */
  scrub(project: Project, t: number): void {
    const now = performance.now()
    if (now - this.lastScrub < 45) return
    this.lastScrub = now
    if (this.ctx.state !== 'running') void this.ctx.resume()
    const len = 0.07
    for (const track of project.tracks) {
      if (track.muted) continue
      for (const clip of track.clips) {
        if (clip.muted || !clip.assetId || t < clip.start || t >= clip.start + clip.duration) continue
        const buffer = this.ready.get(clip.assetId)
        if (!buffer) continue
        const offset = clip.in + (t - clip.start)
        if (offset >= buffer.duration) continue
        const node = this.ctx.createBufferSource()
        node.buffer = buffer
        const g = this.ctx.createGain()
        const at = this.ctx.currentTime
        g.gain.setValueAtTime(0, at)
        g.gain.linearRampToValueAtTime(clip.volume, at + 0.008)
        g.gain.setValueAtTime(clip.volume, at + len - 0.015)
        g.gain.linearRampToValueAtTime(0, at + len)
        node.connect(g).connect(this.master)
        node.start(at, offset, len)
      }
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
