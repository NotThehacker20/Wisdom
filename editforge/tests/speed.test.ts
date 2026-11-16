import { describe, expect, it } from 'vitest'
import '@/plugins'
import { projectAudioPlans } from '@/core/audio/mix'
import { projectBeatPoints } from '@/core/audio/beatMarkers'
import { createClipFromAsset, createProject, sourceTime } from '@/core/project'
import { setPropValue, toggleKeyframes } from '@/core/props'
import {
  availableLocalRange, clipSourceTime, integral, inverseIntegral, localTimeForSource, SPEED_PRESETS, sourceSpan, speedAt
} from '@/core/speed'
import { applySpeedPreset, resetSpeed, setConstantSpeed, setReverse } from '@/core/speedOps'
import { clipEnd, insertClip, splitClip, trimClip } from '@/core/timeline'
import { clampedSourceTime, setTransition } from '@/core/transitions'
import type { Clip, MediaAsset, Project } from '@/core/types'

const asset = (id: string, duration = 20): MediaAsset => ({ id, kind: 'video', name: id, path: `/${id}`, duration, width: 1920, height: 1080, hasAudio: true, hasVideo: true })
const base = (extra: Partial<Clip> = {}): Clip => ({ ...createClipFromAsset(asset('A'), 0), duration: 4, ...extra })

/** A [0,4) in=2 y B [4,8) en la misma pista. */
function setup() {
  let p: Project = { ...createProject(), assets: { A: asset('A'), B: asset('B') } }
  const tr = p.tracks[0].id
  let r = insertClip(p, base({ in: 2 }), tr)
  p = r.project
  const a = r.clipId
  r = insertClip(p, { ...createClipFromAsset(p.assets.B, 4), duration: 4 }, tr)
  return { p: r.project, a, b: r.clipId }
}
const clip = (p: Project, id: string) => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!
const ramp = (from: number, to: number, D: number): Clip['speed'] => ({
  value: from,
  keyframes: [{ id: 'k0', t: 0, v: from, interp: 'linear' }, { id: 'k1', t: D, v: to, interp: 'linear' }]
})

describe('integral de velocidad', () => {
  it('constante y por defecto', () => {
    expect(integral(base(), 3)).toBe(3)
    expect(integral(base({ speed: { value: 200 } }), 3)).toBe(6)
    expect(integral(base({ speed: { value: 50 } }), -1)).toBe(-0.5)
  })
  it('rampa lineal 100 % → 300 % en 2 s consume 4 s de medio', () => {
    const c = base({ speed: ramp(100, 300, 2) })
    expect(integral(c, 2)).toBeCloseTo(4, 3)
    expect(integral(c, 1)).toBeCloseTo(1.5, 3) // ∫₀¹ (1 + t) dt
    expect(integral(c, 3)).toBeCloseTo(7, 3) // después del último keyframe sigue a 300 %
    expect(speedAt(c, 1)).toBeCloseTo(2, 6)
  })
  it('la inversa deshace la integral', () => {
    const c = base({ speed: ramp(30, 400, 3) })
    for (const t of [0.1, 0.7, 2.2, 3.5]) expect(inverseIntegral(c, integral(c, t))).toBeCloseTo(t, 4)
  })
})

describe('mapeo de tiempo', () => {
  it('normal e inverso cubren el mismo fragmento del medio', () => {
    const n = base({ in: 1, speed: { value: 200 } })
    const r = { ...n, reverse: true }
    expect([clipSourceTime(n, 0), clipSourceTime(n, 4)]).toEqual([1, 9])
    expect([clipSourceTime(r, 0), clipSourceTime(r, 4)]).toEqual([9, 1])
    expect(localTimeForSource(r, 5)).toBeCloseTo(2, 6)
    expect(availableLocalRange(n, 20)).toEqual([-0.5, 9.5])
  })
})

describe('cortar y recortar con velocidad', () => {
  const continuity = (p: Project, left: string, right: string, t: number) => {
    expect(sourceTime(clip(p, left), t - 1e-6)).toBeCloseTo(sourceTime(clip(p, right), t), 3)
  }
  for (const reverse of [false, true]) {
    it(`cortar una rampa${reverse ? ' al revés' : ''} conserva lo que se ve a cada lado`, () => {
      let { p, a } = setup()
      p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, speed: ramp(50, 250, 4), reverse } : c)) })) }
      const before = [0.5, 1.4, 2.6, 3.7].map((t) => sourceTime(clip(p, a), t))
      const r = splitClip(p, a, 2)
      const after = [0.5, 1.4].map((t) => sourceTime(clip(r.project, a), t)).concat([2.6, 3.7].map((t) => sourceTime(clip(r.project, r.rightId!), t)))
      after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 3))
      continuity(r.project, a, r.rightId!, 2)
    })
    it(`recortar el inicio y el final${reverse ? ' al revés' : ''} no mueve el resto`, () => {
      let { p, a } = setup()
      p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, speed: { value: 150 }, reverse } : c)) })) }
      const s25 = sourceTime(clip(p, a), 2.5)
      p = trimClip(p, a, 'start', 1)
      p = trimClip(p, a, 'end', 3)
      expect([clip(p, a).start, clipEnd(clip(p, a))]).toEqual([1, 3])
      expect(sourceTime(clip(p, a), 2.5)).toBeCloseTo(s25, 6)
    })
  }
  it('no deja recortar más allá del medio (a 200 % el medio se acaba antes)', () => {
    let { p, a, b } = setup()
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== b) })) }
    p = setConstantSpeed(p, a, 200) // in = 2, medio de 20 s: caben 9 s de clip
    p = trimClip(p, a, 'end', 30)
    expect(clipEnd(clip(p, a))).toBeCloseTo(9, 6)
    p = trimClip(p, a, 'start', -5)
    expect(clip(p, a).start).toBeCloseTo(0, 6) // no puede empezar antes de 0 en la timeline
  })
})

describe('operaciones de velocidad', () => {
  it('velocidad constante: conserva el fragmento, ajusta la duración y desplaza lo de detrás', () => {
    let { p, a, b } = setup()
    p = setConstantSpeed(p, a, 200)
    expect(clip(p, a).duration).toBe(2)
    expect(sourceSpan(clip(p, a))).toBeCloseTo(4, 6)
    expect(clip(p, b).start).toBe(2) // ripple
    p = setConstantSpeed(p, a, 50)
    expect(clip(p, a).duration).toBe(8)
    expect(clip(p, b).start).toBe(8)
    p = resetSpeed(p, a)
    expect([clip(p, a).duration, clip(p, a).speed]).toEqual([4, undefined])
  })
  for (const preset of SPEED_PRESETS) {
    it(`preset «${preset.name}» conserva el fragmento del medio`, () => {
      let { p, a } = setup()
      p = applySpeedPreset(p, a, preset.id)
      expect(sourceSpan(clip(p, a))).toBeCloseTo(4, 3) // exacto pese a redondear la duración a fotogramas
      expect(clip(p, a).speed!.keyframes!.length).toBe(preset.points.length)
    })
  }
  it('la rampa «Héroe» va lenta en el centro', () => {
    let { p, a } = setup()
    p = applySpeedPreset(p, a, 'hero')
    const c = clip(p, a)
    expect(speedAt(c, c.duration / 2)).toBeCloseTo(0.3, 2)
    expect(speedAt(c, 0)).toBeCloseTo(3, 2)
  })
  it('la velocidad es animable con keyframes (auto-key en «time.speed»)', () => {
    let { p, a } = setup()
    p = toggleKeyframes(p, a, ['time.speed'], 0)
    p = setPropValue(p, a, 'time.speed', 2, 400)
    expect(clip(p, a).speed!.keyframes!.map((k) => k.v)).toEqual([100, 400])
    p = setPropValue(p, a, 'time.speed', 3, 5000)
    expect(clip(p, a).speed!.keyframes!.at(-1)!.v).toBe(1000) // límite
  })
  it('inverso: mismo fragmento al revés', () => {
    let { p, a } = setup()
    p = setReverse(p, a, true)
    expect(sourceTime(clip(p, a), 0)).toBe(6)
    expect(sourceTime(clip(p, a), 4)).toBe(2)
  })
})

describe('integración con transiciones, audio y beats', () => {
  it('las transiciones usan el tiempo con velocidad', () => {
    let { p, a } = setup()
    p = setConstantSpeed(p, a, 200)
    expect(clampedSourceTime(clip(p, a), 1, 20, 30)).toBe(4)
  })
  it('la zona de crossfade tiene en cuenta la velocidad', () => {
    let { p, a, b } = setup()
    p = setConstantSpeed(p, a, 200) // A [0,2), B [2,6)
    p = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === b ? { ...c, in: 3 } : c)) })) }
    p = setTransition(p, b, 'crossfade', 1)
    const pa = projectAudioPlans(p).find((x) => x.clip.id === a)!
    expect(pa.xOut).toEqual([1.5, 2.5])
  })
  it('los beats siguen a la velocidad', () => {
    let { p, a } = setup()
    p = setConstantSpeed(p, a, 200)
    const a0 = clip(p, a)
    const pts = projectBeatPoints({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === a ? { ...c, beatGrid: 'beats' as const } : c)) })) }, () => ({ bpm: 60, beats: [2, 3, 4, 5, 6], onsets: [] }))
    expect(pts.filter((b) => b.clipId === a0.id).map((b) => b.t)).toEqual([0, 0.5, 1, 1.5, 2])
  })
})
