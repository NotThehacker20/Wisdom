/**
 * Argumentos de FFmpeg para la exportación (puro, testeable).
 * El vídeo llega por stdin como fotogramas RGBA crudos (de abajo arriba,
 * como los lee WebGL: se voltean con vflip) y el audio, si lo hay, de un WAV.
 */

export type ExportCodec = 'h264' | 'h265' | 'prores' | 'png'

export interface ExportSettings {
  codec: ExportCodec
  width: number
  height: number
  fps: number
  /** Megabits por segundo (H.264/H.265). */
  bitrate: number
  /** Ruta de salida: archivo de vídeo, o carpeta para la secuencia PNG. */
  output: string
  /** WAV con la mezcla de audio (opcional). */
  audioPath?: string | null
}

export const CODEC_INFO: Record<ExportCodec, { label: string; ext: string; audio: boolean }> = {
  h264: { label: 'H.264 (MP4)', ext: 'mp4', audio: true },
  h265: { label: 'H.265 / HEVC (MP4)', ext: 'mp4', audio: true },
  prores: { label: 'ProRes 422 HQ (MOV)', ext: 'mov', audio: true },
  png: { label: 'Secuencia PNG', ext: 'png', audio: false }
}

/** Patrón de nombre de la secuencia PNG dentro de la carpeta de salida. */
export const PNG_PATTERN = 'frame_%05d.png'

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export function buildFfmpegArgs(s: ExportSettings, join: (a: string, b: string) => string = (a, b) => `${a}/${b}`): string[] {
  const w = s.codec === 'png' ? Math.round(s.width) : even(s.width)
  const h = s.codec === 'png' ? Math.round(s.height) : even(s.height)
  const args = ['-hide_banner', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-framerate', String(s.fps), '-i', 'pipe:0']
  const withAudio = !!s.audioPath && CODEC_INFO[s.codec].audio
  if (withAudio) args.push('-i', s.audioPath!)
  args.push('-map', '0:v:0')
  if (withAudio) args.push('-map', '1:a:0')

  // RGB → YUV con matriz BT.709 y rango de vídeo (colores correctos en reproductores y redes).
  const yuv = (pix: string) => ['-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', pix, '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
  const br = Math.max(0.5, s.bitrate)
  switch (s.codec) {
    case 'h264':
      args.push(...yuv('yuv420p'), '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-b:v', `${br}M`, '-maxrate', `${br * 1.5}M`, '-bufsize', `${br * 2}M`, '-movflags', '+faststart')
      if (withAudio) args.push('-c:a', 'aac', '-b:a', '192k')
      break
    case 'h265':
      args.push(...yuv('yuv420p'), '-c:v', 'libx265', '-preset', 'medium', '-b:v', `${br}M`, '-tag:v', 'hvc1', '-x265-params', 'log-level=error', '-movflags', '+faststart')
      if (withAudio) args.push('-c:a', 'aac', '-b:a', '192k')
      break
    case 'prores':
      args.push(...yuv('yuv422p10le'), '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0')
      if (withAudio) args.push('-c:a', 'pcm_s16le')
      break
    case 'png':
      args.push('-vf', 'vflip', '-c:v', 'png', '-pix_fmt', 'rgba', '-start_number', '1')
      break
  }
  if (withAudio) args.push('-shortest')
  args.push('-r', String(s.fps))
  args.push(s.codec === 'png' ? join(s.output, PNG_PATTERN) : s.output)
  return args
}

/** Tamaño de fotograma (bytes) que espera FFmpeg por stdin. */
export const frameBytes = (s: Pick<ExportSettings, 'codec' | 'width' | 'height'>): number => {
  const w = s.codec === 'png' ? Math.round(s.width) : even(s.width)
  const h = s.codec === 'png' ? Math.round(s.height) : even(s.height)
  return w * h * 4
}

/** Dimensiones reales de salida (los códecs YUV 4:2:0/4:2:2 necesitan tamaños pares). */
export const outputSize = (s: Pick<ExportSettings, 'codec' | 'width' | 'height'>): [number, number] =>
  s.codec === 'png' ? [Math.round(s.width), Math.round(s.height)] : [even(s.width), even(s.height)]

/** Extrae «frame=  123» del progreso de FFmpeg (stderr). */
export function parseFfmpegFrame(line: string): number | null {
  const m = /frame=\s*(\d+)/.exec(line)
  return m ? parseInt(m[1], 10) : null
}

// ───────────────────────────── proxies y sondeo ─────────────────────────────

export type ProxyKind = 'preview' | 'compat'

/** Lado mayor del proxy de previsualización. */
export const PREVIEW_PROXY_SIZE = 960

/**
 * Proxy en H.264 con GOP corto (scrub ágil):
 *  - 'compat': resolución completa y alta calidad, para medios que Chromium no
 *    decodifica (ProRes, AVI…). Se usa también al exportar.
 *  - 'preview': 960 px, ligero, solo para la previsualización de medios pesados.
 * FFmpeg aplica la rotación de los metadatos, así que el proxy sale ya derecho.
 */
export function buildProxyArgs(input: string, output: string, kind: ProxyKind): string[] {
  const scale =
    kind === 'preview'
      ? `scale=w='if(gt(iw,ih),${PREVIEW_PROXY_SIZE},-2)':h='if(gt(iw,ih),-2,${PREVIEW_PROXY_SIZE})'`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  return [
    '-hide_banner', '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `${scale},format=yuv420p`,
    '-c:v', 'libx264', '-preset', kind === 'preview' ? 'veryfast' : 'medium', '-crf', kind === 'preview' ? '23' : '14',
    '-g', '15', '-keyint_min', '15', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    output
  ]
}

export interface MediaInfo {
  duration: number
  width: number
  height: number
  fps: number
  videoCodec: string | null
  hasAudio: boolean
  /** Rotación de visualización (grados). */
  rotation: number
}

/** Interpreta la salida de `ffmpeg -i archivo` (no hay ffprobe en ffmpeg-static). */
export function parseFfmpegInfo(stderr: string): MediaInfo | null {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  const v = /Stream #\d+:\d+[^:]*: Video: ([\w-]+)[^\n]*?, (\d{2,5})x(\d{2,5})[^\n]*?(?:, ([\d.]+) fps|, ([\d.]+) tbr)/.exec(stderr)
  if (!v) return null
  const rot = /displaymatrix: rotation of (-?[\d.]+) degrees/.exec(stderr) ?? /rotate\s*:\s*(-?\d+)/.exec(stderr)
  let rotation = rot ? Math.round(-parseFloat(rot[1])) : 0
  rotation = ((rotation % 360) + 360) % 360
  const w = parseInt(v[2], 10)
  const h = parseInt(v[3], 10)
  const swap = rotation % 180 !== 0
  return {
    duration: d ? parseInt(d[1], 10) * 3600 + parseInt(d[2], 10) * 60 + parseFloat(d[3]) : 0,
    width: swap ? h : w,
    height: swap ? w : h,
    fps: parseFloat(v[4] ?? v[5] ?? '30'),
    videoCodec: v[1],
    hasAudio: /Stream #\d+:\d+[^:]*: Audio:/.test(stderr),
    rotation
  }
}

/** «time=00:00:01.50» del progreso de FFmpeg, en segundos. */
export function parseFfmpegTime(line: string): number | null {
  const m = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  return m ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]) : null
}
