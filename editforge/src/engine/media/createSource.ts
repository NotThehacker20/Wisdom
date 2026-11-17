import type { MediaAsset } from '@/core/types'
import type { FrameSource } from './FrameSource'
import { HtmlVideoSource } from './HtmlVideoSource'
import { ImageSource } from './ImageSource'
import { mediaUrl } from './mediaUrl'
import { videoPathFor } from './proxies'
import { isMp4Like } from './mp4'
import { WebCodecsSource } from './WebCodecsSource'

/**
 * Elige el backend de decodificación:
 *  1. WebCodecs (MP4/MOV con códec soportado): preciso por fotograma.
 *  2. <video> de Chromium como respaldo.
 */
export async function createFrameSource(asset: MediaAsset, opts: { preview?: boolean; path?: string } = {}): Promise<FrameSource> {
  const path = opts.path ?? videoPathFor(asset, opts.preview ?? false)
  const url = mediaUrl(path)
  if (asset.kind === 'image') return ImageSource.create(url)
  if (isMp4Like(path)) {
    try {
      return await WebCodecsSource.create(url)
    } catch (e) {
      console.warn(`[EditForge] WebCodecs no disponible para ${asset.name}, usando respaldo:`, e)
    }
  }
  return HtmlVideoSource.create(url)
}
