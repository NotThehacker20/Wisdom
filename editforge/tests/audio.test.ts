import { describe, expect, it } from 'vitest'
import { analyzeBeats, estimateTempo, gridTimes, onsetEnvelope, pickOnsets } from '@/core/audio/beats'
import { FFT } from '@/core/audio/fft'
import { computePeaks, mixToMono, peaksRange } from '@/core/audio/peaks'

const SR = 44100

/** Pista de clics: golpes cortos y percusivos (ruido con caída) a un tempo dado, con ruido de fondo. */
function clickTrack(bpm: number, seconds: number, opts: { offset?: number; accentEvery?: number; jitter?: number } = {}): { x: Float32Array; clicks: number[] } {
  const x = new Float32Array(Math.round(seconds * SR))
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  for (let i = 0; i < x.length; i++) x[i] = rnd() * 0.01
  const clicks: number[] = []
  const period = 60 / bpm
  for (let k = 0, t = opts.offset ?? 0.25; t < seconds - 0.1; t += period, k++) {
    const tt = t + (opts.jitter ? rnd() * opts.jitter : 0)
    clicks.push(tt)
    const amp = opts.accentEvery && k % opts.accentEvery === 0 ? 0.9 : 0.5
    const s0 = Math.round(tt * SR)
    for (let j = 0; j < SR * 0.04 && s0 + j < x.length; j++) x[s0 + j] += rnd() * amp * Math.exp(-j / (SR * 0.008))
  }
  return { x, clicks }
}

const nearest = (arr: number[], t: number) => arr.reduce((b, v) => (Math.abs(v - t) < Math.abs(b - t) ? v : b), Infinity)

describe('FFT', () => {
  it('detecta una sinusoide en su bin', () => {
    const n = 1024
    const fft = new FFT(n)
    const re = new Float32Array(n)
    const im = new Float32Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 37 * i) / n)
    fft.transform(re, im)
    const mags = Array.from(re.subarray(0, n / 2), (r, i) => Math.hypot(r, im[i]))
    expect(mags.indexOf(Math.max(...mags))).toBe(37)
    expect(mags[37]).toBeCloseTo(n / 2, 0)
  })
  it('rechaza tamaños que no son potencia de 2', () => {
    expect(() => new FFT(1000)).toThrow()
  })
})

describe('picos de forma de onda', () => {
  it('calcula mínimos y máximos por bloque y los reduce a columnas', () => {
    const x = new Float32Array(SR)
    for (let i = 0; i < SR; i++) x[i] = i < SR / 2 ? 0.25 * Math.sin(i / 10) : 0.9 * Math.sin(i / 10)
    const p = computePeaks(x, SR, 100)
    expect(p.min.length).toBe(100)
    expect(p.duration).toBe(1)
    expect(Math.max(...p.max.subarray(0, 50))).toBeCloseTo(0.25, 2)
    expect(Math.max(...p.max.subarray(50))).toBeCloseTo(0.9, 2)
    const r = peaksRange(p, 0, 1, 4)
    expect(Array.from(r.max).map((v) => +v.toFixed(2))).toEqual([0.25, 0.25, 0.9, 0.9])
  })
  it('mezcla a mono', () => {
    expect(Array.from(mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5])
  })
})

describe('onsets, tempo y beats', () => {
  it('detecta los golpes de una pista de clics con precisión de ~20 ms', () => {
    const { x, clicks } = clickTrack(120, 8)
    const { env, frameRate } = onsetEnvelope(x, SR)
    const a = analyzeBeats(x, SR)
    for (const c of clicks) expect(Math.abs(nearest(a.onsets, c) - c)).toBeLessThan(0.025)
    expect(a.onsets.length).toBeGreaterThanOrEqual(clicks.length - 1)
    expect(a.onsets.length).toBeLessThanOrEqual(clicks.length + 1)
    expect(pickOnsets(env, frameRate).length).toBe(a.onsets.length)
  })
  for (const bpm of [90, 120, 128, 150]) {
    it(`estima ${bpm} BPM y sigue los beats`, () => {
      const { x, clicks } = clickTrack(bpm, 12, { offset: 0.37, accentEvery: 4 })
      const a = analyzeBeats(x, SR)
      expect(Math.abs(a.bpm - bpm)).toBeLessThan(0.3)
      // Los beats coinciden con los clics (ignorando el primero y el último).
      const inner = a.beats.filter((b) => b > 1 && b < 11)
      expect(inner.length).toBeGreaterThan(5)
      for (const b of inner) expect(Math.abs(nearest(clicks, b) - b)).toBeLessThan(0.03)
    })
  }
  it('con bombo en el beat y hi-hat a contratiempo, los beats van al bombo', () => {
    const x = new Float32Array(SR * 12)
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
    const period = 60 / 128
    const kicks: number[] = []
    for (let i = 0; i < x.length; i++) {
      const t = i / SR - 0.2
      if (t < 0) continue
      const ph = t % period
      const off = (t + period / 2) % period
      x[i] = 0.9 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-25 * ph) + 0.35 * rnd() * Math.exp(-60 * off) + 0.05 * Math.sin(2 * Math.PI * 330 * t)
    }
    for (let t = 0.2; t < 12; t += period) kicks.push(t)
    const a = analyzeBeats(x, SR)
    expect(Math.abs(a.bpm - 128)).toBeLessThan(1.5)
    const inner = a.beats.filter((b) => b > 1 && b < 11)
    for (const b of inner) expect(Math.abs(nearest(kicks, b) - b)).toBeLessThan(0.035)
  })
  it('tolera pequeñas variaciones de tempo (humanización)', () => {
    const { x, clicks } = clickTrack(110, 12, { jitter: 0.012 })
    const a = analyzeBeats(x, SR)
    expect(Math.abs(a.bpm - 110)).toBeLessThan(2)
    const inner = a.beats.filter((b) => b > 1 && b < 11)
    for (const b of inner) expect(Math.abs(nearest(clicks, b) - b)).toBeLessThan(0.04)
  })
  it('el tempo no se dobla ni se divide entre 2 en un rango normal', () => {
    const { x } = clickTrack(100, 12)
    const { env, frameRate } = onsetEnvelope(x, SR)
    expect(Math.abs(estimateTempo(env, frameRate) - 100)).toBeLessThan(1.5)
  })
  it('silencio: sin beats', () => {
    const a = analyzeBeats(new Float32Array(SR * 3), SR)
    expect(a.onsets).toEqual([])
  })
  it('rejillas: cada beat, cada 2, compás y golpes', () => {
    const a = { bpm: 120, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], onsets: [0.1, 0.7] }
    expect(gridTimes(a, 'half')).toEqual([0, 1, 2, 3, 4])
    expect(gridTimes(a, 'bars')).toEqual([0, 2, 4])
    expect(gridTimes(a, 'onsets')).toEqual([0.1, 0.7])
    expect(gridTimes(a, 'off')).toEqual([])
  })
})

import { audioPlan, crossfadeGain, dbToGain, fadeGain, gainToDb, projectAudioPlans } from '@/core/audio/mix'
import '@/plugins'
import { createClipFromAsset, createProject } from '@/core/project'
import { setTransition } from '@/core/transitions'
import { insertClip } from '@/core/timeline'
import type { MediaAsset, Project } from '@/core/types'

describe('plan de mezcla', () => {
  const asset = (id: string): MediaAsset => ({ id, kind: 'video', name: id, path: `/${id}`, duration: 20, width: 1920, height: 1080, hasAudio: true, hasVideo: true })
  function setup() {
    let p: Project = { ...createProject(), assets: { A: asset('A'), B: asset('B') } }
    const tr = p.tracks[0].id
    let r = insertClip(p, { ...createClipFromAsset(p.assets.A, 0), duration: 4 }, tr)
    p = r.project
    const a = r.clipId
    r = insertClip(p, { ...createClipFromAsset(p.assets.B, 4), duration: 4 }, tr)
    return { p: r.project, a, b: r.clipId }
  }
  it('sin transición: intervalos del clip y sin crossfade', () => {
    const { p } = setup()
    const [pa, pb] = projectAudioPlans(p)
    expect([pa.from, pa.to, pb.from, pb.to]).toEqual([0, 4, 4, 8])
    expect(crossfadeGain(pa, 3.99)).toBe(1)
  })
  it('con transición: A se alarga, B empieza antes y la potencia se conserva', () => {
    let { p, a, b } = setup()
    // B con material antes de su entrada (in = 2 s); A tiene medio de 20 s.
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === b ? { ...c, in: 2 } : c)) })) }
    p = setTransition(p, b, 'crossfade', 1)
    const plans = projectAudioPlans(p)
    const pa = plans.find((x) => x.clip.id === a)!
    const pb = plans.find((x) => x.clip.id === b)!
    expect([pa.from, pa.to, pb.from, pb.to]).toEqual([0, 4.5, 3.5, 8])
    for (const t of [3.5, 3.7, 4, 4.3, 4.5]) {
      const ga = crossfadeGain(pa, t)
      const gb = crossfadeGain(pb, t)
      expect(ga * ga + gb * gb).toBeCloseTo(1, 6) // potencia constante
    }
    expect(crossfadeGain(pa, 4)).toBeCloseTo(Math.SQRT1_2, 6)
    expect(crossfadeGain(pb, 3.5)).toBe(0)
    expect(crossfadeGain(pa, 4.5)).toBeCloseTo(0, 6)
  })
  it('sin material sobrante no hay solape: corte seco sin bajón de volumen', () => {
    let { p, a, b } = setup()
    // El medio de A se acaba justo en el corte y B.in = 0: ninguno tiene material sobrante.
    p = { ...p, assets: { ...p.assets, A: { ...p.assets.A, duration: 4 } } }
    p = setTransition(p, b, 'crossfade', 1)
    const plans = projectAudioPlans(p)
    const pa = plans.find((x) => x.clip.id === a)!
    const pb = plans.find((x) => x.clip.id === b)!
    expect([pa.to, pb.from]).toEqual([4, 4])
    expect(crossfadeGain(pa, 3.9)).toBe(1) // A suena entero hasta el corte
    expect(crossfadeGain(pb, 4.1)).toBe(1) // y B entero desde el corte
  })
  it('solape parcial: el crossfade se ajusta al material disponible', () => {
    let { p, b } = setup()
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === b ? { ...c, in: 0.2 } : c)) })) }
    p = setTransition(p, b, 'crossfade', 1)
    const pb = projectAudioPlans(p).find((x) => x.clip.id === b)!
    expect(pb.xIn![0]).toBeCloseTo(3.8, 6)
    expect(pb.xIn![1]).toBeCloseTo(4.5, 6)
  })
  it('fundidos del usuario y pistas silenciadas', () => {
    let { p, a } = setup()
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, fadeIn: 1, fadeOut: 2 } : c)) })) }
    const pa = audioPlan(p.tracks[0], p.tracks[0].clips[0])
    expect([fadeGain(pa, 0), fadeGain(pa, 0.5), fadeGain(pa, 1.5), fadeGain(pa, 3), fadeGain(pa, 4)]).toEqual([0, 0.5, 1, 0.5, 0])
    expect(projectAudioPlans({ ...p, tracks: p.tracks.map((t) => ({ ...t, muted: true })) })).toHaveLength(0)
  })
  it('dB ↔ ganancia', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3)
    expect(gainToDb(dbToGain(-12.5))).toBeCloseTo(-12.5, 6)
    expect(dbToGain(-60)).toBe(0)
  })
})
