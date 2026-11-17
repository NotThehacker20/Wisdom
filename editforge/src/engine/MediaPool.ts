import type { Clip, MediaAsset, Project } from '@/core/types'
import type { DecodedFrame, FrameRequestOptions, FrameSource } from './media/FrameSource'
import { createFrameSource } from './media/createSource'
import { videoPathFor } from './media/proxies'

interface Entry {
  assetId: string
  path: string
  source: Promise<FrameSource>
  failed?: string
}

/**
 * Una fuente de fotogramas por clip (cada clip mantiene su propio decoder,
 * así dos clips del mismo medio no se pelean por la posición del decoder).
 */
export class MediaPool {
  private entries = new Map<string, Entry>()
  onError?: (asset: MediaAsset, message: string) => void

  /** `preview`: la previsualización puede usar proxies ligeros; la exportación no. */
  constructor(private readonly preview = false) {}

  private entry(clip: Clip, asset: MediaAsset): Entry {
    let e = this.entries.get(clip.id)
    const path = videoPathFor(asset, this.preview)
    // Otro medio, o ha aparecido/desaparecido un proxy: nueva fuente.
    if (e && (e.assetId !== asset.id || e.path !== path)) {
      void e.source.then((s) => s.dispose()).catch(() => undefined)
      e = undefined
    }
    if (!e) {
      const created: Entry = { assetId: asset.id, path, source: createFrameSource(asset, { path }) }
      created.source.catch((err: unknown) => {
        created.failed = err instanceof Error ? err.message : String(err)
        this.onError?.(asset, created.failed)
      })
      this.entries.set(clip.id, created)
      e = created
    }
    return e
  }

  async getFrame(clip: Clip, asset: MediaAsset, t: number, opts: FrameRequestOptions): Promise<DecodedFrame | null> {
    const e = this.entry(clip, asset)
    if (e.failed) return null
    try {
      const src = await e.source
      return await src.getFrame(t, opts)
    } catch (err) {
      console.warn('[EditForge] error obteniendo fotograma', err)
      return null
    }
  }

  /** Prepara la fuente de un clip que empezará pronto (abre el archivo y decodifica el primer fotograma). */
  warm(clip: Clip, asset: MediaAsset, t: number): void {
    void this.getFrame(clip, asset, t, { playing: false })
  }

  /** Libera fuentes de clips que ya no existen. */
  gc(project: Project): void {
    const alive = new Set<string>()
    for (const tr of project.tracks) for (const c of tr.clips) alive.add(c.id)
    for (const [id, e] of this.entries) {
      if (!alive.has(id)) {
        void e.source.then((s) => s.dispose()).catch(() => undefined)
        this.entries.delete(id)
      }
    }
  }

  dispose(): void {
    for (const e of this.entries.values()) void e.source.then((s) => s.dispose()).catch(() => undefined)
    this.entries.clear()
  }
}
