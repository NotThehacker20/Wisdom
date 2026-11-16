import { describe, expect, it } from 'vitest'
import { emptyHistory, execute, redo, undo } from '@/core/commands'
import { fitContain, layerMatrix, resolveTransform } from '@/core/layerTransform'
import { chain, invert, rotation, scaling, transformPoint, translation } from '@/core/mat3'
import { addAssetsCmd, appendAssetCmd, setTransformValueCmd } from '@/core/ops'
import { clipAt, createClipFromAsset, createProject, projectDuration, snapToFrame, sourceTime } from '@/core/project'
import { formatTimecode } from '@/core/time'
import type { MediaAsset } from '@/core/types'
import { rotationFromMatrix } from '@/engine/media/mp4'
import { uvRotation } from '@/engine/Renderer'

const asset = (id: string, duration = 4): MediaAsset => ({
  id, kind: 'video', name: `${id}.mp4`, path: `/m/${id}.mp4`, duration, width: 1920, height: 1080, hasAudio: true, hasVideo: true
})

const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 5)
  expect(a[1]).toBeCloseTo(b[1], 5)
}

describe('mat3', () => {
  it('compone traslación, rotación y escala en orden', () => {
    const m = chain(translation(10, 0), rotation(Math.PI / 2), scaling(2, 2))
    // (1,0) → escala (2,0) → rota 90° horario con y hacia abajo (0,2) → traslada (10,2)
    close(transformPoint(m, 1, 0), [10, 2])
  })
  it('invierte correctamente', () => {
    const m = chain(translation(5, -3), rotation(0.7), scaling(3, 0.5))
    const p = transformPoint(m, 2, 7)
    close(transformPoint(invert(m), p[0], p[1]), [2, 7])
  })
})

describe('transformación de capa', () => {
  it('el anclaje es el pivote de rotación y escala', () => {
    const clip = createClipFromAsset(asset('a'), 0)
    clip.transform.anchorX.value = 50
    clip.transform.rotation.value = 90
    clip.transform.scale.value = 200
    const m = layerMatrix(resolveTransform(clip, 0))
    // El punto de anclaje cae en la posición de la capa.
    close(transformPoint(m, 50, 0), [0, 0])
  })
  it('encaja (contain) en el lienzo', () => {
    expect(fitContain(1920, 1080, 1080, 1920)).toEqual([1080, 607.5])
    expect(fitContain(1080, 1920, 1080, 1920)).toEqual([1080, 1920])
  })
  it('opacidad y escala se normalizan', () => {
    const clip = createClipFromAsset(asset('a'), 0)
    clip.transform.opacity.value = 150
    const r = resolveTransform(clip, 0)
    expect(r.opacity).toBe(1)
    expect(r.scale).toBe(1)
  })
})

describe('rotación de metadatos', () => {
  it('lee la matriz de un vídeo vertical de móvil', () => {
    expect(rotationFromMatrix([0, 65536, 0, -65536, 0, 0, 0, 0, 0x40000000])).toBe(90)
    expect(rotationFromMatrix([65536, 0, 0, 0, 65536, 0, 0, 0, 0x40000000])).toBe(0)
    expect(rotationFromMatrix([-65536, 0, 0, 0, -65536, 0, 0, 0, 0x40000000])).toBe(180)
  })
  it('uv de 90°: la esquina sup. izq. visible viene de la inf. izq. del fotograma', () => {
    close(transformPoint(uvRotation(1), 0, 0), [0, 1])
    close(transformPoint(uvRotation(1), 1, 0), [0, 0])
    close(transformPoint(uvRotation(2), 0, 0), [1, 1])
    close(transformPoint(uvRotation(0), 0.3, 0.7), [0.3, 0.7])
  })
})

describe('proyecto y timeline', () => {
  it('añade clips en secuencia y calcula la duración', () => {
    let p = createProject()
    let h = emptyHistory()
    const a = asset('a', 4)
    const b = asset('b', 2.5)
    ;({ project: p, history: h } = execute(p, h, addAssetsCmd([a, b])))
    ;({ project: p, history: h } = execute(p, h, appendAssetCmd(a, p)!))
    ;({ project: p, history: h } = execute(p, h, appendAssetCmd(b, p)!))
    const track = p.tracks[0]
    expect(track.clips.map((c) => c.start)).toEqual([0, 4])
    expect(projectDuration(p)).toBe(6.5)
    expect(clipAt(track, 4)?.assetId).toBe('b')
    expect(clipAt(track, 3.99)?.assetId).toBe('a')
    expect(clipAt(track, 6.5)).toBeUndefined()
    expect(sourceTime(track.clips[1], 5)).toBe(1)
  })

  it('deshace y rehace en orden', () => {
    let p = createProject()
    let h = emptyHistory()
    const a = asset('a')
    ;({ project: p, history: h } = execute(p, h, addAssetsCmd([a])))
    ;({ project: p, history: h } = execute(p, h, appendAssetCmd(a, p)!))
    const withClip = p
    let r = undo(p, h)!
    expect(r.project.tracks[0].clips).toHaveLength(0)
    r = undo(r.project, r.history)!
    expect(Object.keys(r.project.assets)).toHaveLength(0)
    expect(undo(r.project, r.history)).toBeNull()
    r = redo(r.project, r.history)!
    r = redo(r.project, r.history)!
    expect(r.project).toEqual(withClip)
  })

  it('fusiona cambios continuos de la misma propiedad en un solo paso', () => {
    let p = createProject()
    let h = emptyHistory()
    const a = asset('a')
    ;({ project: p, history: h } = execute(p, h, addAssetsCmd([a])))
    ;({ project: p, history: h } = execute(p, h, appendAssetCmd(a, p)!))
    const id = p.tracks[0].clips[0].id
    for (const v of [10, 20, 30]) ({ project: p, history: h } = execute(p, h, setTransformValueCmd(p, id, 'x', v)!))
    expect(h.past).toHaveLength(3)
    expect(p.tracks[0].clips[0].transform.x.value).toBe(30)
    const r = undo(p, h)!
    expect(r.project.tracks[0].clips[0].transform.x.value).toBe(0)
  })

  it('ajusta a fotograma y formatea timecode', () => {
    expect(snapToFrame(1.02, 30)).toBeCloseTo(1.0333, 3)
    expect(formatTimecode(65.5, 30)).toBe('00:01:05:15')
  })
})
