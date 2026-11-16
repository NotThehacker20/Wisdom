import { describe, expect, it } from 'vitest'
import { basename, dirname, relativePath, resolvePath } from '@/core/paths'
import { createProject } from '@/core/project'
import { migrate, parseProject, serializeProject } from '@/core/serialize'
import { addMarker, insertAssetClip } from '@/core/timeline'
import type { MediaAsset } from '@/core/types'

describe('rutas', () => {
  it('POSIX', () => {
    expect(dirname('/home/u/p/x.efproj')).toBe('/home/u/p')
    expect(relativePath('/home/u/p', '/home/u/media/a.mp4')).toBe('../media/a.mp4')
    expect(relativePath('/home/u/p', '/home/u/p/clips/a.mp4')).toBe('clips/a.mp4')
    expect(resolvePath('/home/u/p', '../media/a.mp4')).toBe('/home/u/media/a.mp4')
  })
  it('Windows (mayúsculas, separadores mezclados, unidades distintas)', () => {
    expect(dirname('C:\\Users\\Ana\\Edits\\x.efproj')).toBe('C:\\Users\\Ana\\Edits')
    expect(relativePath('C:\\Users\\Ana\\Edits', 'c:/users/ana/Videos/a.mp4')).toBe('../Videos/a.mp4')
    expect(relativePath('C:\\Edits', 'D:\\a.mp4')).toBeNull()
    expect(resolvePath('E:\\Proyecto', '../Videos/a.mp4')).toBe('E:\\Videos\\a.mp4')
    expect(basename('C:\\a\\b.mp4')).toBe('b.mp4')
  })
})

describe('serialización .efproj', () => {
  const asset: MediaAsset = {
    id: 'A', kind: 'video', name: 'a.mp4', path: '/home/u/media/a.mp4', duration: 5, width: 1920, height: 1080,
    hasAudio: true, hasVideo: true, missing: true
  }
  const img: MediaAsset = { ...asset, id: 'I', kind: 'image', name: 'i.png', path: '/home/u/media/i.png', duration: Infinity }

  it('ida y vuelta conserva el proyecto y reubica los medios si se mueve la carpeta', () => {
    let p = createProject('Mi edit')
    p = { ...p, assets: { A: asset, I: img } }
    p = insertAssetClip(p, asset, p.tracks[0].id, 0).project
    p = addMarker(p, 1.5).project
    const json = serializeProject(p, '/home/u/proj/edit.efproj')
    const raw = JSON.parse(json)
    expect(raw.format).toBe('editforge-project')
    expect(raw.version).toBe(1)
    expect(raw.assets.A.relPath).toBe('../media/a.mp4')
    expect(raw.assets.A.missing).toBeUndefined()

    // Toda la carpeta se movió a otro disco/usuario.
    const { project, candidates } = parseProject(json, '/mnt/backup/proj/edit.efproj')
    expect(candidates.A).toEqual(['/mnt/backup/media/a.mp4', '/home/u/media/a.mp4'])
    expect(project.assets.A.path).toBe('/mnt/backup/media/a.mp4')
    expect(project.assets.I.duration).toBe(Infinity)
    expect(project.tracks).toEqual(p.tracks)
    expect(project.markers).toEqual(p.markers)
    expect(project.name).toBe('Mi edit')
  })

  it('rechaza archivos ajenos o de versiones futuras', () => {
    expect(() => parseProject('{"a":1}', '/x.efproj')).toThrow(/no es un proyecto/)
    expect(() => parseProject('nope', '/x.efproj')).toThrow(/JSON/)
    expect(() => migrate({ format: 'editforge-project', version: 99 })).toThrow(/más nueva/)
  })
})
