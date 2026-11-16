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
