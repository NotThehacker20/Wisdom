import { projectDuration } from '@/core/project'
import type { Project } from '@/core/types'
import { AudioEngine } from './AudioEngine'
import { MediaPool } from './MediaPool'
import { Renderer } from './Renderer'

export interface PlaybackListener {
  onTime(t: number): void
  onPlayingChange(playing: boolean): void
}

/**
 * Bucle de reproducción: reloj (audio), render por fotograma de proyecto y
 * control de concurrencia (nunca hay dos renders a la vez; si el render va
 * lento se saltan fotogramas, el audio sigue).
 */
export class PlaybackController {
  readonly pool = new MediaPool()
  readonly audio = new AudioEngine()
  renderer: Renderer | null = null
  private project: Project | null = null
  private time = 0
  private playing = false
  private raf = 0
  private rendering = false
  private dirty = true
  private lastRenderedKey = ''
  private fpsSamples: number[] = []
  measuredFps = 0
  /** Factor de resolución de la previsualización (1, 0.5, 0.25). */
  quality = 1

  constructor(private listener: PlaybackListener) {}

  attach(canvas: HTMLCanvasElement): void {
    this.renderer?.dispose()
    this.renderer = new Renderer(canvas)
    this.dirty = true
    this.loop()
  }

  detach(): void {
    cancelAnimationFrame(this.raf)
    this.renderer?.dispose()
    this.renderer = null
  }

  setProject(p: Project): void {
    if (this.project === p) return
    this.project = p
    this.pool.gc(p)
    this.renderer?.gc(p)
    this.audio.preload(p)
    this.dirty = true
  }

  setQuality(q: number): void {
    if (q === this.quality) return
    this.quality = q
    this.dirty = true
  }

  get currentTime(): number {
    return this.time
  }

  get isPlaying(): boolean {
    return this.playing
  }

  private frameDur(): number {
    return 1 / (this.project?.settings.fps ?? 30)
  }

  seek(t: number): void {
    const dur = this.project ? projectDuration(this.project) : 0
    this.time = Math.max(0, Math.min(t, dur))
    if (this.playing && this.project) void this.audio.start(this.project, this.time)
    this.dirty = true
    this.listener.onTime(this.time)
  }

  step(frames: number): void {
    this.pause()
    const fd = this.frameDur()
    this.seek((Math.round(this.time / fd) + frames) * fd)
  }

  async play(): Promise<void> {
    if (this.playing || !this.project) return
    const dur = projectDuration(this.project)
    if (dur <= 0) return
    if (this.time >= dur - this.frameDur()) this.time = 0
    this.playing = true
    this.listener.onPlayingChange(true)
    await this.audio.start(this.project, this.time)
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.audio.stop()
    this.dirty = true
    this.listener.onPlayingChange(false)
  }

  toggle(): void {
    if (this.playing) this.pause()
    else void this.play()
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    const p = this.project
    if (!p || !this.renderer) return

    if (this.playing) {
      const dur = projectDuration(p)
      this.time = this.audio.time
      if (this.time >= dur) {
        this.time = dur
        this.pause()
      }
      this.listener.onTime(this.time)
      this.warmUpcoming(p)
    }

    // Solo renderizamos cuando cambia el fotograma de proyecto o el estado.
    const frame = Math.floor(this.time * p.settings.fps + 1e-6)
    const key = `${frame}|${this.quality}`
    if (this.rendering || (!this.dirty && key === this.lastRenderedKey)) return
    this.rendering = true
    this.dirty = false
    this.lastRenderedKey = key
    const r = this.renderer
    r.setSize(p.settings.width * this.quality, p.settings.height * this.quality)
    const started = performance.now()
    r.render(p, frame / p.settings.fps, this.pool, { playing: this.playing })
      .catch((e) => console.error('[EditForge] error de render', e))
      .finally(() => {
        this.rendering = false
        this.trackFps(started)
      })
  }

  private trackFps(now: number): void {
    const s = this.fpsSamples
    s.push(now)
    while (s.length > 0 && now - s[0] > 1000) s.shift()
    this.measuredFps = this.playing ? s.length : 0
  }

  /** Abre por adelantado los clips que empiezan en el próximo medio segundo. */
  private warmUpcoming(p: Project): void {
    const t = this.time
    for (const track of p.tracks) {
      if (track.kind !== 'video') continue
      for (const c of track.clips) {
        if (c.start > t && c.start - t < 0.5 && c.assetId) {
          const a = p.assets[c.assetId]
          if (a?.hasVideo) this.pool.warm(c, a, c.in)
        }
      }
    }
  }

  dispose(): void {
    this.detach()
    this.pool.dispose()
    this.audio.dispose()
  }
}
