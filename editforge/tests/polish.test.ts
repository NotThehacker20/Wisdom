import { describe, expect, it, vi } from 'vitest'

// El mapa de atajos solo se consulta aquí: sustituimos los módulos con efectos (audio, DOM).
vi.mock('@/state/playback', () => ({ playback: {} }))
const anyFn = vi.hoisted(() => () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => undefined), has: () => true }))
vi.mock('@/state/actions', () => anyFn())
vi.mock('@/state/projectFile', () => anyFn())
import { buildCurvesTable, DEFAULT_CURVES, evalCurve, normalizeCurve, parseCurves, sampleCurve } from '@/core/curves'
import { buildProxyArgs, parseFfmpegInfo, parseFfmpegTime } from '../electron/ffmpegArgs'
import { comboFromEvent, prettyCombo } from '@/ui/combo'
import { ACTIONS, actionFor, conflictsFor, keysOf } from '@/ui/keymap'

const ev = (key: string, m: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({ key, ctrlKey: !!m.ctrl, metaKey: !!m.meta, altKey: !!m.alt, shiftKey: !!m.shift })

describe('combinaciones de teclas', () => {
  it('normaliza modificadores y nombres', () => {
    expect(comboFromEvent(ev('s', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+S')
    expect(comboFromEvent(ev('S', { shift: true }))).toBe('Shift+S')
    expect(comboFromEvent(ev('ArrowLeft', { alt: true }))).toBe('Alt+Left')
    expect(comboFromEvent(ev(' '))).toBe('Space')
    expect(comboFromEvent(ev('k', { meta: true }))).toBe('Ctrl+K')
    expect(comboFromEvent(ev('Shift', { shift: true }))).toBeNull()
  })
  it('ignora Mayús en signos de puntuación (depende de la distribución)', () => {
    expect(comboFromEvent(ev('+', { shift: true }))).toBe('+')
    expect(comboFromEvent(ev(',', { ctrl: true }))).toBe('Ctrl+,')
  })
  it('presentación en español', () => {
    expect(prettyCombo('Ctrl+Shift+Left')).toBe('Ctrl+Mayús+←')
    expect(prettyCombo('Space')).toBe('Espacio')
  })
})

describe('mapa de atajos', () => {
  it('cada combinación por defecto pertenece a una sola acción', () => {
    const seen = new Map<string, string>()
    for (const a of ACTIONS)
      for (const k of keysOf(a, {})) {
        expect(seen.get(k), `${k} en ${a.id} y ${seen.get(k)}`).toBeUndefined()
        seen.set(k, a.id)
      }
  })
  it('los atajos personalizados sustituyen a los de fábrica y se detectan conflictos', () => {
    const km = { split: ['X'] }
    expect(actionFor('X', km)?.id).toBe('split')
    expect(actionFor('C', km)).toBeUndefined()
    expect(conflictsFor('marker', 'X', km).map((a) => a.id)).toEqual(['split'])
    expect(conflictsFor('split', 'X', km)).toEqual([])
    expect(actionFor('Alt+K', {})?.id).toBe('keyframe')
  })
})

describe('curvas', () => {
  it('la identidad no cambia nada', () => {
    const t = buildCurvesTable(DEFAULT_CURVES)
    for (let i = 0; i < 256; i++) {
      expect(t[i * 4]).toBe(i)
      expect(t[i * 4 + 1]).toBe(i)
      expect(t[i * 4 + 2]).toBe(i)
      expect(t[i * 4 + 3]).toBe(255)
    }
  })
  it('el spline pasa por los puntos y es monótono (sin rebotes)', () => {
    const pts = normalizeCurve([[0, 0], [0.25, 0.1], [0.5, 0.5], [0.75, 0.9], [1, 1]])
    for (const [x, y] of pts) expect(evalCurve(pts, x)).toBeCloseTo(y, 6)
    const s = sampleCurve(pts, 512)
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1] - 1e-6)
  })
  it('compone canal ∘ maestra', () => {
    const c = parseCurves(JSON.stringify({ m: [[0, 1], [1, 0]], r: [[0, 0], [1, 0.5]] }))
    const t = buildCurvesTable(c)
    expect(t[0]).toBe(128) // r(m(0)) = r(1) = 0.5
    expect(t[1]).toBe(255) // g(m(0)) = 1
    expect(t[255 * 4 + 1]).toBe(0)
  })
  it('tolera datos corruptos', () => {
    expect(parseCurves('no json')).toEqual(DEFAULT_CURVES)
    expect(parseCurves(JSON.stringify({ m: [[2, -1], [0.5, 0.5], [0.5, 0.7]] })).m).toEqual([[0.5, 0.7], [1, 0]])
  })
})

describe('proxies (FFmpeg)', () => {
  const prores = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'prores.mov':
  Duration: 00:00:03.00, start: 0.000000, bitrate: 46377 kb/s
  Stream #0:0[0x1]: Video: prores (HQ) (apch / 0x68637061), yuv422p10le(progressive), 1280x720, 45662 kb/s, SAR 1:1 DAR 16:9, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2]: Audio: pcm_s16le (sowt / 0x74776F73), 44100 Hz, mono, s16, 705 kb/s (default)`
  const phone = `  Duration: 00:01:02.50, start: 0.000000, bitrate: 17000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 16000 kb/s, 29.97 fps, 29.97 tbr, 600 tbn (default)
    Side data:
      displaymatrix: rotation of -90.00 degrees`
  it('lee la salida de ffmpeg -i', () => {
    expect(parseFfmpegInfo(prores)).toEqual({ duration: 3, width: 1280, height: 720, fps: 30, videoCodec: 'prores', hasAudio: true, rotation: 0 })
    const p = parseFfmpegInfo(phone)!
    expect(p).toMatchObject({ duration: 62.5, width: 1080, height: 1920, fps: 29.97, videoCodec: 'hevc', hasAudio: false, rotation: 90 })
    expect(parseFfmpegInfo('Duration: 00:00:05.00\n Stream #0:0: Audio: mp3')).toBeNull()
  })
  it('progreso y argumentos', () => {
    expect(parseFfmpegTime('frame=  50 fps=0.0 q=-1.0 size= 256kB time=00:01:01.50 bitrate=')).toBeCloseTo(61.5)
    const pv = buildProxyArgs('in.mov', 'out.mp4', 'preview')
    expect(pv.join(' ')).toContain('960')
    expect(pv).toContain('-g')
    const cp = buildProxyArgs('in.mov', 'out.mp4', 'compat')
    expect(cp.join(' ')).not.toContain('960')
    expect(cp.slice(-1)[0]).toBe('out.mp4')
  })
})
