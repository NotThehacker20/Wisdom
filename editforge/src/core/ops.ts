import { createClipFromAsset, trackEnd } from './project'
import type { Command } from './commands'
import type { Clip, MediaAsset, Project } from './types'

/** Operaciones de edición expresadas como comandos deshacibles. */

export function addAssetsCmd(assets: MediaAsset[]): Command {
  return {
    label: assets.length === 1 ? `Importar ${assets[0].name}` : `Importar ${assets.length} medios`,
    do: (p) => {
      const next = { ...p.assets }
      for (const a of assets) next[a.id] = a
      return { ...p, assets: next }
    },
    undo: (p) => {
      const next = { ...p.assets }
      for (const a of assets) delete next[a.id]
      return { ...p, assets: next }
    }
  }
}

/** Añade un clip del medio al final de la primera pista compatible. */
export function appendAssetCmd(asset: MediaAsset, project: Project): Command | null {
  const wantKind = asset.kind === 'audio' ? 'audio' : 'video'
  const track = project.tracks.find((t) => t.kind === wantKind)
  if (!track) return null
  const clip: Clip = createClipFromAsset(asset, trackEnd(track))
  const trackId = track.id
  return {
    label: `Añadir ${asset.name} a la timeline`,
    do: (p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t))
    }),
    undo: (p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clip.id) } : t))
    })
  }
}

export function setSettingsCmd(settings: Partial<Project['settings']>, project: Project): Command {
  const before = project.settings
  return {
    label: 'Ajustes del proyecto',
    do: (p) => ({ ...p, settings: { ...p.settings, ...settings } }),
    undo: (p) => ({ ...p, settings: before })
  }
}

type TransformKey = keyof import('./types').Transform

/**
 * Cambia el valor estático de una propiedad de transformación.
 * Los cambios consecutivos sobre la misma propiedad se fusionan en un solo paso de deshacer.
 */
export function setTransformValueCmd(project: Project, clipId: string, key: TransformKey, value: number): Command | null {
  let before: number | undefined
  for (const t of project.tracks) {
    const c = t.clips.find((c) => c.id === clipId)
    if (c) before = c.transform[key].value
  }
  if (before === undefined) return null
  const apply = (p: Project, v: number): Project => ({
    ...p,
    tracks: p.tracks.map((t) =>
      t.clips.some((c) => c.id === clipId)
        ? {
            ...t,
            clips: t.clips.map((c) =>
              c.id === clipId ? { ...c, transform: { ...c.transform, [key]: { ...c.transform[key], value: v } } } : c
            )
          }
        : t
    )
  })
  const oldValue = before
  const cmd: Command & { meta: { clipId: string; key: string; before: number; at: number } } = {
    label: `Cambiar ${key}`,
    meta: { clipId, key, before: oldValue, at: Date.now() },
    do: (p) => apply(p, value),
    undo: (p) => apply(p, oldValue),
    merge: (prev) => {
      const m = (prev as typeof cmd).meta
      if (!m || m.clipId !== clipId || m.key !== key || Date.now() - m.at > 1500) return null
      return { ...cmd, meta: { ...cmd.meta, before: m.before }, undo: (p: Project) => apply(p, m.before) }
    }
  }
  return cmd
}
