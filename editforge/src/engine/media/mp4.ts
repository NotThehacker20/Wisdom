import { createFile, DataStream, type MP4ArrayBuffer, type MP4Info, type MP4Sample, type MP4VideoTrack } from 'mp4box'
import { fetchRange, fetchSize } from './mediaUrl'

/**
 * Lectura de contenedores MP4/MOV sin cargar el archivo entero:
 * recorremos las cajas de primer nivel por peticiones Range, leemos solo
 * ftyp+moov y obtenemos la tabla de muestras (offset/tamaño/cts/keyframes).
 * Los bytes de cada muestra se leen luego bajo demanda.
 */

export interface Mp4Video {
  info: MP4Info
  track: MP4VideoTrack
  samples: MP4Sample[]
  description?: Uint8Array
  codec: string
  rotation: number
  fps: number
  duration: number
  hasAudio: boolean
}

interface BoxRef {
  type: string
  start: number
  size: number
}

async function scanTopLevel(url: string): Promise<{ boxes: BoxRef[]; fileSize: number }> {
  const fileSize = await fetchSize(url)
  const boxes: BoxRef[] = []
  let off = 0
  for (let guard = 0; off < fileSize && guard < 512; guard++) {
    const hdr = new DataView(await fetchRange(url, off, Math.min(fileSize, off + 16)))
    if (hdr.byteLength < 8) break
    let size = hdr.getUint32(0)
    const type = String.fromCharCode(hdr.getUint8(4), hdr.getUint8(5), hdr.getUint8(6), hdr.getUint8(7))
    if (size === 1) {
      if (hdr.byteLength < 16) break
      size = Number(hdr.getBigUint64(8))
    } else if (size === 0) {
      size = fileSize - off
    }
    if (size < 8) break
    boxes.push({ type, start: off, size })
    off += size
  }
  return { boxes, fileSize }
}

export function rotationFromMatrix(matrix: ArrayLike<number> | undefined): number {
  if (!matrix || matrix.length < 4) return 0
  const a = matrix[0] / 65536
  const b = matrix[1] / 65536
  const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI)
  return ((deg % 360) + 360) % 360
}

export async function openMp4(url: string): Promise<Mp4Video> {
  const { boxes } = await scanTopLevel(url)
  const ftyp = boxes.find((b) => b.type === 'ftyp')
  const moov = boxes.find((b) => b.type === 'moov')
  if (!moov) throw new Error('MP4 sin caja moov (¿archivo incompleto o fragmentado?)')
  const parts: ArrayBuffer[] = []
  if (ftyp) parts.push(await fetchRange(url, ftyp.start, ftyp.start + ftyp.size))
  parts.push(await fetchRange(url, moov.start, moov.start + moov.size))
  const total = parts.reduce((s, p) => s + p.byteLength, 0)
  const joined = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    joined.set(new Uint8Array(p), o)
    o += p.byteLength
  }

  const file = createFile()
  let info: MP4Info | undefined
  let err: string | undefined
  file.onReady = (i) => (info = i)
  file.onError = (e) => (err = e)
  const buf = joined.buffer as MP4ArrayBuffer
  buf.fileStart = 0
  file.appendBuffer(buf)
  file.flush()
  if (!info) throw new Error(err ?? 'No se pudo leer el MP4')

  const track = info.videoTracks[0]
  if (!track) throw new Error('El archivo no tiene pista de vídeo')
  const trak = file.getTrackById(track.id)
  const samples = trak.samples ?? []
  if (samples.length === 0) throw new Error('MP4 fragmentado o sin muestras en moov')

  let description: Uint8Array | undefined
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C
    if (box) {
      const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN)
      box.write(stream)
      description = new Uint8Array(stream.buffer, 8) // sin la cabecera de la caja
      break
    }
  }

  const duration = track.duration / track.timescale || info.duration / info.timescale
  return {
    info,
    track,
    samples,
    description,
    codec: track.codec,
    rotation: rotationFromMatrix(track.matrix),
    fps: duration > 0 ? track.nb_samples / duration : 30,
    duration,
    hasAudio: info.audioTracks.length > 0
  }
}

export function isMp4Like(path: string): boolean {
  return /\.(mp4|m4v|mov)$/i.test(path)
}
