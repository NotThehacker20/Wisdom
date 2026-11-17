import { uid } from '@/core/id'
import type { MediaAsset, MediaKind } from '@/core/types'
import { createFrameSource } from './createSource'
import { mediaUrl } from './mediaUrl'
import { isMp4Like, openMp4 } from './mp4'

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i

export function kindFromPath(path: string): MediaKind | null {
  if (VIDEO_EXT.test(path)) return 'video'
  if (IMAGE_EXT.test(path)) return 'image'
  if (AUDIO_EXT.test(path)) return 'audio'
  return null
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function mediaElementMeta(url: string, tag: 'video' | 'audio'): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag)
    el.preload = 'metadata'
    el.muted = true
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement
      resolve({ duration: el.duration, width: v.videoWidth ?? 0, height: v.videoHeight ?? 0 })
      el.removeAttribute('src')
      el.load()
    }
    el.onerror = () => reject(new Error(el.error?.message || 'Formato no soportado'))
    el.src = url
  })
}

/** Lee los metadatos de un archivo y crea su MediaAsset. */
export async function probeMedia(path: string): Promise<MediaAsset> {
  const kind = kindFromPath(path)
  if (!kind) throw new Error(`Tipo de archivo no soportado: ${baseName(path)}`)
  const url = mediaUrl(path)
  const base = { id: uid('ast_'), kind, name: baseName(path), path }
  const size = (await window.editforge?.stat(path))?.size

  if (kind === 'image') {
    const bmp = await createImageBitmap(await (await fetch(url)).blob(), { imageOrientation: 'from-image' })
    const asset: MediaAsset = { ...base, duration: Infinity, width: bmp.width, height: bmp.height, hasAudio: false, hasVideo: true, size }
    bmp.close()
    return asset
  }

  if (kind === 'audio') {
    const m = await mediaElementMeta(url, 'audio')
    return { ...base, duration: m.duration, width: 0, height: 0, hasAudio: true, hasVideo: false, size }
  }

  if (isMp4Like(path)) {
    try {
      const mp4 = await openMp4(url)
      const rotated = mp4.rotation % 180 !== 0
      const w = mp4.track.video.width
      const h = mp4.track.video.height
      return {
        ...base,
        duration: mp4.duration,
        width: rotated ? h : w,
        height: rotated ? w : h,
        fps: Math.round(mp4.fps * 1000) / 1000,
        codec: mp4.codec,
        rotation: mp4.rotation,
        hasAudio: mp4.hasAudio,
        hasVideo: true,
        size
      }
    } catch (e) {
      console.warn('[EditForge] mp4box no pudo leer el archivo, usando <video>', e)
    }
  }
  try {
    const m = await mediaElementMeta(url, 'video')
    if (m.width > 0) return { ...base, duration: m.duration, width: m.width, height: m.height, hasAudio: true, hasVideo: true, size }
  } catch (e) {
    if (!window.editforge) throw e
  }
  // Chromium no sabe leerlo (AVI, ProRes en contenedores raros…): preguntamos a FFmpeg. El proxy compat hará el resto.
  const info = await window.editforge?.probeMedia(path)
  if (!info) throw new Error('Formato no soportado')
  return {
    ...base,
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: Math.round(info.fps * 1000) / 1000,
    codec: info.videoCodec ?? undefined,
    rotation: info.rotation,
    hasAudio: info.hasAudio,
    hasVideo: true,
    size
  }
}

/** Genera una miniatura (dataURL JPEG) del medio, reutilizando el mismo backend de decodificación. */
export async function makeThumbnail(asset: MediaAsset, maxSize = 220): Promise<string | null> {
  if (!asset.hasVideo) return null
  const src = await createFrameSource(asset, { preview: true })
  try {
    const t = asset.kind === 'image' ? 0 : Math.min(1, asset.duration / 3)
    const f = await src.getFrame(t, { playing: false })
    if (!f) return null
    const quarter = Math.round(f.rotation / 90) % 4
    const dw = quarter % 2 ? f.height : f.width
    const dh = quarter % 2 ? f.width : f.height
    const k = Math.min(1, maxSize / Math.max(dw, dh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(dw * k))
    canvas.height = Math.max(1, Math.round(dh * k))
    const ctx = canvas.getContext('2d')!
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((quarter * Math.PI) / 2)
    const w = f.width * k
    const h = f.height * k
    ctx.drawImage(f.source as CanvasImageSource, -w / 2, -h / 2, w, h)
    return canvas.toDataURL('image/jpeg', 0.75)
  } finally {
    src.dispose()
  }
}
