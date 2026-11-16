import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, frameBytes, outputSize, parseFfmpegFrame } from '../electron/ffmpegArgs'
import { encodeWav } from '@/core/audio/wav'

const base = { width: 1080, height: 1920, fps: 30, bitrate: 16, output: '/out/edit.mp4' }
const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

describe('argumentos de FFmpeg', () => {
  it('H.264: fotogramas RGBA por stdin, volteo, BT.709, bitrate, faststart y audio AAC', () => {
    const a = buildFfmpegArgs({ ...base, codec: 'h264', audioPath: '/tmp/a.wav' })
    expect(a.slice(a.indexOf('-f'), a.indexOf('-f') + 10)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x1920', '-framerate', '30', '-i', 'pipe:0'])
    expect(after(a, '-vf')).toContain('vflip')
    expect(after(a, '-vf')).toContain('bt709')
    expect([after(a, '-c:v'), after(a, '-pix_fmt'), after(a, '-b:v'), after(a, '-c:a')]).toEqual(['libx264', 'rgba', '16M', 'aac'])
    expect(a.filter((x) => x === '-pix_fmt')).toHaveLength(2)
    expect(a.lastIndexOf('yuv420p')).toBeGreaterThan(0)
    expect(a).toContain('+faststart')
    expect(a).toContain('-shortest')
    expect(a.at(-1)).toBe('/out/edit.mp4')
    expect(a.slice(a.indexOf('-map'))).toEqual(expect.arrayContaining(['0:v:0', '1:a:0']))
  })
  it('H.265 con etiqueta hvc1 y ProRes 422 HQ 10 bits con PCM', () => {
    const h = buildFfmpegArgs({ ...base, codec: 'h265' })
    expect([after(h, '-c:v'), after(h, '-tag:v')]).toEqual(['libx265', 'hvc1'])
    expect(h).not.toContain('-c:a')
    const p = buildFfmpegArgs({ ...base, codec: 'prores', output: '/o.mov', audioPath: '/a.wav' })
    expect([after(p, '-c:v'), after(p, '-profile:v'), after(p, '-c:a')]).toEqual(['prores_ks', '3', 'pcm_s16le'])
    expect(p).toContain('yuv422p10le')
  })
  it('PNG: secuencia numerada en la carpeta y sin audio', () => {
    const a = buildFfmpegArgs({ ...base, codec: 'png', output: '/out/frames', audioPath: '/a.wav' }, (x, y) => `${x}/${y}`)
    expect(a.at(-1)).toBe('/out/frames/frame_%05d.png')
    expect(a).not.toContain('/a.wav')
    expect(after(a, '-c:v')).toBe('png')
  })
  it('tamaños pares para YUV y bytes por fotograma', () => {
    expect(outputSize({ codec: 'h264', width: 1081, height: 607 })).toEqual([1082, 608])
    expect(outputSize({ codec: 'png', width: 1081, height: 607 })).toEqual([1081, 607])
    expect(frameBytes({ codec: 'h264', width: 1920, height: 1080 })).toBe(1920 * 1080 * 4)
  })
  it('lee el progreso de FFmpeg', () => {
    expect(parseFfmpegFrame('frame=  123 fps= 45 q=28.0 size=...')).toBe(123)
    expect(parseFfmpegFrame('Input #0')).toBeNull()
  })
})

describe('WAV', () => {
  it('cabecera PCM 16 bits estéreo y muestras entrelazadas con recorte', () => {
    const wav = encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0.5, -0.5, 0, -2])], 48000)
    const v = new DataView(wav.buffer)
    const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4))
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([2, 48000, 16, 16])
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true), v.getInt16(50, true)]).toEqual([0, 16384, 32767, -16384])
    expect([v.getInt16(56, true), v.getInt16(58, true)]).toEqual([32767, -32768])
  })
})
