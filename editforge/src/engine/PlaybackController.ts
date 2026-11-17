import { projectDuration } from '@/core/project'
import type { Project } from '@/core/types'
import { AudioEngine } from './AudioEngine'
import { MediaPool } from './MediaPool'
import { proxies } from './media/proxies'
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
  readonly pool = new MediaPool(true)
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
  /** Límite de la caché de fotogramas (bytes). */
  cacheBytes = 512 * 1024 * 1024
  /** Identificador de cada versión del proyecto (para la caché). */
  private projectIds = new WeakMap<Project, number>()
  private nextProjectId = 1
  /** Estadísticas para el panel de rendimiento. */
  stats = { renderMs: 0, cached: false }

  setCacheMB(mb: number): void {
    this.cacheBytes = Math.max(0, mb) * 1024 * 1024
    if (this.renderer) {
      this.renderer.cache.maxBytes = this.cacheBytes
      if (this.cacheBytes === 0) this.renderer.cache.clear()
    }
  }

  constructor(private listener: PlaybackListener) {
    // Un proxy nuevo (o activar/desactivar los proxies) cambia la imagen y quizá el audio.
    proxies.subscribe(() => {
      this.renderer?.cache.clear()
      if (this.project) this.audio.preload(this.project)
      this.dirty = true
    })
  }

  attach(canvas: HTMLCanvasElement): void {
    this.renderer?.dispose()
    this.renderer = new Renderer(canvas)
    // Recursos que llegan en segundo plano (LUTs): volver a pintar al cargarse (y la caché ya no vale).
    this.renderer.onAsyncResource = () => {
      this.dirty = true
      this.renderer?.cache.clear()
    }
    this.renderer.cache.maxBytes = this.cacheBytes
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
    const prev = this.project
    this.project = p
    this.pool.gc(p)
    this.renderer?.gc(p)
    this.audio.preload(p)
    this.dirty = true
    // Si se edita durante la reproducción, reprogramamos el audio desde el instante actual.
    if (this.playing && prev && prev.tracks !== p.tracks && this.rate === 1) void this.audio.start(p, this.time)
  }

  /** Velocidad de reproducción (J/L): negativa = hacia atrás. Fuera de 1× no hay audio. */
  private rate = 1
  private rateStartPerf = 0
  private rateStartT = 0

  get playbackRate(): number {
    return this.playing ? this.rate : 0
  }

  /** J/K/L: cada pulsación de L acelera hacia delante (1×, 2×, 4×, 8×); J igual hacia atrás. */
  shuttle(dir: 1 | -1): void {
    let next: number
    if (!this.playing || Math.sign(this.rate) !== dir) next = dir
    else next = Math.max(-8, Math.min(8, this.rate * 2))
    void this.playAt(next)
  }

  /** Scrubbing: mueve el cabezal y reproduce un fragmento de audio. */
  scrub(t: number): void {
    this.pause()
    this.seek(t)
    if (this.project) this.audio.scrub(this.project, this.time)
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
    this.rateStartPerf = performance.now()
    this.rateStartT = this.time
    if (this.playing && this.project && this.rate === 1) void this.audio.start(this.project, this.time)
    this.dirty = true
    this.listener.onTime(this.time)
  }

  step(frames: number): void {
    this.pause()
    const fd = this.frameDur()
    this.seek((Math.round(this.time / fd) + frames) * fd)
  }

  play(): Promise<void> {
    if (this.playing && this.rate === 1) return Promise.resolve()
    return this.playAt(1)
  }

  private async playAt(rate: number): Promise<void> {
    if (!this.project) return
    const dur = projectDuration(this.project)
    if (dur <= 0) return
    if (rate > 0 && this.time >= dur - this.frameDur()) this.time = 0
    if (rate < 0 && this.time <= 0) this.time = dur
    this.audio.stop()
    this.rate = rate
    this.rateStartPerf = performance.now()
    this.rateStartT = this.time
    const was = this.playing
    this.playing = true
    if (!was) this.listener.onPlayingChange(true)
    if (rate === 1) await this.audio.start(this.project, this.time)
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.rate = 1
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
      this.time =
        this.rate === 1 ? this.audio.time : this.rateStartT + ((performance.now() - this.rateStartPerf) / 1000) * this.rate
      if (this.time >= dur) {
        this.time = dur
        this.pause()
      } else if (this.time <= 0 && this.rate < 0) {
        this.time = 0
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
    // Caché: cada versión del proyecto + calidad es una «generación»; un fotograma ya visto se presenta sin renderizar.
    let pid = this.projectIds.get(p)
    if (!pid) this.projectIds.set(p, (pid = this.nextProjectId++))
    r.cache.setGeneration(`${pid}|${this.quality}`, r.canvas.width, r.canvas.height)
    if (this.cacheBytes > 0 && r.presentCached(frame)) {
      this.rendering = false
      this.stats = { renderMs: 0, cached: true }
      this.trackFps(performance.now())
      return
    }
    const started = performance.now()
    // Solo a 1× hacia delante se lee por adelantado; en J/L rápido o hacia atrás se busca fotograma a fotograma.
    r.render(p, frame / p.settings.fps, this.pool, { playing: this.playing && this.rate === 1, cacheAs: this.cacheBytes > 0 ? frame : undefined })
      .then(() => {
        this.stats = { renderMs: performance.now() - started, cached: false }
      })
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
        if (c.start > t && c.start - t < 1 && c.assetId) {
          const a = p.assets[c.assetId]
          if (a?.hasVideo && !a.missing) this.pool.warm(c, a, c.in)
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
