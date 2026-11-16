import type { MP4Sample } from 'mp4box'
import type { DecodedFrame, FrameRequestOptions, FrameSource } from './FrameSource'
import { fetchRange } from './mediaUrl'
import { openMp4, type Mp4Video } from './mp4'

/** Fotogramas decodificados que se guardan por delante del actual. */
const MAX_BUFFERED = 8
/** Bytes máximos por lectura agrupada de muestras. */
const SPAN_BYTES = 6 * 1024 * 1024
/** Si el objetivo está a menos de esto (en muestras de decodificación), avanzamos en vez de saltar. */
const FORWARD_DECODE_WINDOW = 90

/**
 * Decodificación precisa por fotograma con WebCodecs.
 * Mantiene un VideoDecoder vivo: al avanzar (reproducción) solo alimenta las
 * muestras nuevas; al saltar, reinicia en el keyframe anterior.
 */
export class WebCodecsSource implements FrameSource {
  readonly backend = 'webcodecs' as const
  private decoder!: VideoDecoder
  private config!: VideoDecoderConfig
  private samples: MP4Sample[] = []
  /** Índices de decodificación ordenados por tiempo de presentación. */
  private presentation: number[] = []
  /** Timestamp (µs) de cada muestra, indexado por orden de decodificación. */
  private tsOf: number[] = []
  private nextFeed = 0
  private needsReset = true
  private buffered: VideoFrame[] = []
  private current: VideoFrame | null = null
  /** Fotograma devuelto antes que `current` (sigue abierto: la interpolación pide pares f, f+1). */
  private prev: VideoFrame | null = null
  private wantFrom = 0
  private lastOutputTs = -Infinity
  private outputWaiters: Array<() => void> = []
  private span: { start: number; data: Uint8Array } | null = null
  private lock: Promise<unknown> = Promise.resolve()
  private disposed = false
  private error: Error | null = null
  private rotation = 0

  private constructor(private url: string) {}

  static async create(url: string, mp4?: Mp4Video): Promise<WebCodecsSource> {
    if (typeof VideoDecoder === 'undefined') throw new Error('WebCodecs no disponible')
    const src = new WebCodecsSource(url)
    await src.init(mp4 ?? (await openMp4(url)))
    return src
  }

  private async init(mp4: Mp4Video): Promise<void> {
    const t = mp4.track
    this.rotation = mp4.rotation
    this.config = {
      codec: mp4.codec.startsWith('vp08') ? 'vp8' : mp4.codec,
      codedWidth: t.video.width,
      codedHeight: t.video.height,
      description: mp4.description,
      optimizeForLatency: true
    }
    const support = await VideoDecoder.isConfigSupported(this.config)
    if (!support.supported) throw new Error(`Códec no soportado por WebCodecs: ${mp4.codec}`)

    this.samples = mp4.samples
    const base = Math.min(...this.samples.map((s) => s.cts))
    this.tsOf = this.samples.map((s) => Math.round(((s.cts - base) / s.timescale) * 1e6))
    this.presentation = this.samples.map((_, i) => i).sort((a, b) => this.tsOf[a] - this.tsOf[b])

    this.decoder = new VideoDecoder({
      output: (frame) => this.onOutput(frame),
      error: (e) => {
        this.error = e instanceof Error ? e : new Error(String(e))
        this.needsReset = true
        this.wake()
      }
    })
  }

  private onOutput(frame: VideoFrame): void {
    if (this.disposed || frame.timestamp < this.wantFrom) {
      frame.close()
      return
    }
    this.lastOutputTs = frame.timestamp
    this.buffered.push(frame)
    this.buffered.sort((a, b) => a.timestamp - b.timestamp)
    while (this.buffered.length > MAX_BUFFERED * 2) this.buffered.pop()?.close()
    this.wake()
  }

  private wake(): void {
    const w = this.outputWaiters
    this.outputWaiters = []
    w.forEach((fn) => fn())
  }

  private waitOutput(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms)
      this.outputWaiters.push(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  /** Índice (orden de decodificación) del fotograma que se muestra en t. */
  private indexAt(t: number): number {
    const us = t * 1e6 + 500 // tolerancia de medio milisegundo
    const p = this.presentation
    let lo = 0
    let hi = p.length - 1
    if (us <= this.tsOf[p[0]]) return p[0]
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.tsOf[p[mid]] <= us) lo = mid
      else hi = mid - 1
    }
    return p[lo]
  }

  private keyframeBefore(decodeIdx: number): number {
    for (let i = decodeIdx; i >= 0; i--) if (this.samples[i].is_sync) return i
    return 0
  }

  private reset(at: number): void {
    if (this.decoder.state === 'closed') throw this.error ?? new Error('Decoder cerrado')
    this.decoder.reset()
    this.decoder.configure(this.config)
    this.buffered.forEach((f) => f.close())
    this.buffered = []
    this.nextFeed = at
    this.lastOutputTs = -Infinity
    this.needsReset = false
    this.error = null
  }

  private async sampleData(i: number): Promise<Uint8Array> {
    const s = this.samples[i]
    const sp = this.span
    if (sp && s.offset >= sp.start && s.offset + s.size <= sp.start + sp.data.byteLength) {
      return sp.data.subarray(s.offset - sp.start, s.offset - sp.start + s.size)
    }
    // Leemos de una vez las siguientes muestras (normalmente contiguas en el archivo).
    let end = s.offset + s.size
    for (let j = i + 1; j < this.samples.length; j++) {
      const n = this.samples[j]
      if (n.offset < s.offset) break
      const e = n.offset + n.size
      if (e - s.offset > SPAN_BYTES) break
      end = Math.max(end, e)
    }
    const data = new Uint8Array(await fetchRange(this.url, s.offset, end))
    this.span = { start: s.offset, data }
    return data.subarray(0, s.size)
  }

  private async feedOne(): Promise<void> {
    const i = this.nextFeed++
    const s = this.samples[i]
    const data = await this.sampleData(i)
    if (this.disposed) return
    this.decoder.decode(
      new EncodedVideoChunk({
        type: s.is_sync ? 'key' : 'delta',
        timestamp: this.tsOf[i],
        duration: Math.round((s.duration / s.timescale) * 1e6),
        data
      })
    )
    if (this.decoder.decodeQueueSize > 4) {
      await new Promise<void>((r) => this.decoder.addEventListener('dequeue', () => r(), { once: true }))
    }
  }

  private takeFromBuffer(ts: number): VideoFrame | null {
    const idx = this.buffered.findIndex((f) => f.timestamp === ts)
    if (idx < 0) return null
    const frame = this.buffered[idx]
    // Los fotogramas anteriores ya no sirven.
    this.buffered.slice(0, idx).forEach((f) => f.close())
    this.buffered = this.buffered.slice(idx + 1)
    if (this.current && this.current !== frame) {
      if (this.prev && this.prev !== this.current) this.prev.close()
      this.prev = this.current
    }
    this.current = frame
    return frame
  }

  private toDecoded(f: VideoFrame): DecodedFrame {
    return { source: f, width: f.displayWidth, height: f.displayHeight, rotation: this.rotation, stable: true }
  }

  getFrame(t: number, opts: FrameRequestOptions): Promise<DecodedFrame | null> {
    const run = this.lock.then(() => this.getFrameLocked(t, opts))
    this.lock = run.catch(() => undefined)
    return run
  }

  private async getFrameLocked(t: number, opts: FrameRequestOptions): Promise<DecodedFrame | null> {
    if (this.disposed) return null
    const target = this.indexAt(Math.max(0, t))
    const ts = this.tsOf[target]
    if (this.current && this.current.timestamp === ts) {
      if (opts.playing) await this.fillAhead(target)
      return this.toDecoded(this.current)
    }
    // El anterior (pares f, f+1 de la interpolación de fotogramas): sin volver a decodificar.
    if (this.prev && this.prev.timestamp === ts) return this.toDecoded(this.prev)

    const fromBuf = this.takeFromBuffer(ts)
    if (fromBuf) {
      if (opts.playing) await this.fillAhead(target)
      return this.toDecoded(fromBuf)
    }

    const key = this.keyframeBefore(target)
    const passed = this.lastOutputTs > ts // ya salió un fotograma posterior: el objetivo se descartó
    const behind = target < this.nextFeed && passed
    const tooFar = key > this.nextFeed || target - this.nextFeed > FORWARD_DECODE_WINDOW
    if (this.needsReset || behind || tooFar) {
      this.reset(key)
    }
    this.wantFrom = ts

    let extra = 0
    for (let guard = 0; guard < 10000; guard++) {
      const got = this.takeFromBuffer(ts)
      if (got) {
        if (opts.playing) await this.fillAhead(target)
        return this.toDecoded(got)
      }
      if (this.error) throw this.error
      if (this.lastOutputTs > ts) {
        // El objetivo no llegó (reordenación rara): reiniciamos una vez desde el keyframe.
        this.reset(key)
        this.wantFrom = ts
        continue
      }
      if (this.nextFeed <= target + 2 && this.nextFeed < this.samples.length) {
        await this.feedOne()
        continue
      }
      // Ya alimentamos el objetivo: esperamos la salida (B-frames pueden necesitar algunas muestras más).
      if (await this.waitOutput(40)) continue
      if (this.nextFeed < this.samples.length && extra < 16) {
        extra++
        await this.feedOne()
      } else {
        await this.decoder.flush()
        this.needsReset = true // tras flush el decoder exige un keyframe
        const last = this.takeFromBuffer(ts)
        if (last) return this.toDecoded(last)
        return this.current ? this.toDecoded(this.current) : null
      }
    }
    return null
  }

  /** Durante la reproducción, mantiene algunos fotogramas decodificados por delante. */
  private async fillAhead(target: number): Promise<void> {
    if (this.needsReset) return
    const goal = Math.min(this.samples.length, target + MAX_BUFFERED)
    while (this.nextFeed < goal && this.buffered.length < MAX_BUFFERED && this.decoder.decodeQueueSize < 3) {
      await this.feedOne()
    }
  }

  dispose(): void {
    this.disposed = true
    this.buffered.forEach((f) => f.close())
    this.buffered = []
    this.current?.close()
    this.current = null
    this.prev?.close()
    this.prev = null
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close()
    this.wake()
  }
}
