import type { DecodedFrame, FrameRequestOptions, FrameSource } from './FrameSource'

/**
 * Respaldo para contenedores/códecs que no podemos demultiplexar (WebM, MKV…)
 * o que WebCodecs no soporta. Menos preciso al buscar fotogramas, pero
 * reproduce todo lo que reproduce Chromium. (Para el resto: proxies FFmpeg, fase 11.)
 */
export class HtmlVideoSource implements FrameSource {
  readonly backend = 'html-video' as const
  private video: HTMLVideoElement

  private constructor(video: HTMLVideoElement) {
    this.video = video
  }

  static create(url: string): Promise<HtmlVideoSource> {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video')
      v.muted = true
      v.playsInline = true
      v.preload = 'auto'
      v.crossOrigin = 'anonymous'
      v.onloadeddata = () => resolve(new HtmlVideoSource(v))
      v.onerror = () => reject(new Error(v.error?.message || 'El navegador no puede reproducir este vídeo'))
      v.src = url
    })
  }

  private frame(): DecodedFrame | null {
    const v = this.video
    if (v.readyState < 2) return null
    return { source: v, width: v.videoWidth, height: v.videoHeight, rotation: 0 }
  }

  private seek(t: number): Promise<void> {
    const v = this.video
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        v.removeEventListener('seeked', done)
        resolve()
      }
      const timer = setTimeout(done, 500)
      v.addEventListener('seeked', done)
      v.currentTime = t
    })
  }

  async getFrame(t: number, opts: FrameRequestOptions): Promise<DecodedFrame | null> {
    const v = this.video
    const target = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.001))
    if (opts.playing) {
      if (v.paused || Math.abs(v.currentTime - target) > 0.25) {
        v.currentTime = target
        void v.play().catch(() => undefined)
      }
      return this.frame()
    }
    if (!v.paused) v.pause()
    if (Math.abs(v.currentTime - target) > 0.001) await this.seek(target)
    return this.frame()
  }

  dispose(): void {
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
  }
}
