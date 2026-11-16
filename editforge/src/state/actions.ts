import { projectDuration } from '@/core/project'
import { indexClips } from '@/core/layerTransform'
import { createNullParent, deleteClipsKeepChildren, setParent } from '@/core/parenting'
import {
  addMarker, addTrack, allClips, duplicateClips, editPoints, insertGeneratorClip, removeAsset, removeMarker,
  removeTrack, splitAt
} from '@/core/timeline'
import {
  clipKeyTimes, clipPropPaths, copyKeys, getProp, pasteKeys, removeKeys, setKeysEase, toggleKeyframes, type EaseChoice, type KeyClipboard,
  type KeyRef
} from '@/core/props'
import type { Clip, TrackKind } from '@/core/types'
import { playback } from './playback'
import { useProject } from './projectStore'
import { useUi } from './uiStore'

/** Acciones de edición compartidas por la barra de herramientas, los atajos y los menús contextuales. */

const proj = () => useProject.getState()
const ui = () => useUi.getState()

export function splitAtPlayhead(): void {
  const t = playback.currentTime
  let right: string[] = []
  proj().apply('Cortar', (p) => {
    const r = splitAt(p, t, ui().selectedClipIds)
    right = r.rightIds
    return r.project
  })
  // Si había selección, la mitad derecha queda seleccionada (como en CapCut).
  if (ui().selectedClipIds.length && right.length) ui().selectClips(right)
}

export function deleteSelection(ripple: boolean): void {
  const { selectedClipIds, selectedMarkerId } = ui()
  if (selectedClipIds.length) {
    // Los hijos de los clips borrados pasan al abuelo sin moverse en pantalla.
    const t = playback.currentTime
    proj().apply(ripple ? 'Eliminar con ripple' : 'Eliminar', (p) => deleteClipsKeepChildren(p, selectedClipIds, t, ripple))
    ui().selectClips([])
  } else if (selectedMarkerId) {
    proj().apply('Eliminar marcador', (p) => removeMarker(p, selectedMarkerId))
    ui().selectMarker(null)
  }
}

export function duplicateSelection(): void {
  const ids = ui().selectedClipIds
  if (!ids.length) return
  let newIds: string[] = []
  proj().apply('Duplicar', (p) => {
    const r = duplicateClips(p, ids)
    newIds = r.newIds
    return r.project
  })
  ui().selectClips(newIds)
}

export function addMarkerAtPlayhead(): void {
  let id = ''
  proj().apply('Añadir marcador', (p) => {
    const r = addMarker(p, playback.currentTime)
    id = r.markerId
    return r.project
  })
  if (id) ui().selectMarker(id)
}

export function addTrackAction(kind: TrackKind): void {
  proj().apply(kind === 'audio' ? 'Añadir pista de audio' : 'Añadir pista de vídeo', (p) => addTrack(p, kind).project)
}

export function removeTrackAction(trackId: string): void {
  const t = playback.currentTime
  proj().apply('Eliminar pista', (p) => {
    const ids = p.tracks.find((tr) => tr.id === trackId)?.clips.map((c) => c.id) ?? []
    // Desbloqueamos la pista un instante para que sus clips se puedan borrar sin dejar hijos huérfanos.
    const unlocked = { ...p, tracks: p.tracks.map((tr) => (tr.id === trackId ? { ...tr, locked: false } : tr)) }
    return removeTrack(deleteClipsKeepChildren(unlocked, ids, t), trackId)
  })
}

export function addGenerator(kind: 'null' | 'adjustment'): void {
  let id = ''
  proj().apply(kind === 'null' ? 'Añadir null object' : 'Añadir capa de ajuste', (p) => {
    const r = insertGeneratorClip(p, kind, playback.currentTime)
    id = r.clipId
    return r.project
  })
  ui().selectClips([id])
}

export function removeAssetAction(assetId: string): void {
  const a = proj().project.assets[assetId]
  if (!a) return
  proj().apply(`Quitar ${a.name}`, (p) => removeAsset(p, assetId))
  ui().selectAsset(null)
}

export function selectAll(): void {
  ui().selectClips(allClips(proj().project).map((c) => c.id))
}

/** Salta al punto de edición anterior/siguiente (↑/↓). */
export function jumpEdit(dir: 1 | -1): void {
  const t = playback.currentTime
  const pts = editPoints(proj().project)
  const eps = 1e-4
  const target = dir > 0 ? pts.find((x) => x > t + eps) : [...pts].reverse().find((x) => x < t - eps)
  if (target !== undefined) {
    playback.pause()
    playback.seek(target)
  }
}

export function zoomBy(factor: number): void {
  ui().setTimelineZoom(ui().timelineZoom * factor)
}

export function zoomToFit(): void {
  const dur = projectDuration(proj().project)
  const w = ui().timelineViewportWidth
  if (dur > 0 && w > 0) ui().setTimelineZoom(w / (dur * 1.05))
}

// ───────────────────────────── keyframes ─────────────────────────────

/** Propiedades que se animan con Alt+K si no hay ninguna propiedad activa. */
const DEFAULT_KEY_PATHS = ['transform.x', 'transform.y', 'transform.scale', 'transform.rotation', 'transform.opacity']

let keyClipboard: KeyClipboard | null = null

function selectedClip(): Clip | undefined {
  const ids = ui().selectedClipIds
  if (ids.length !== 1) return undefined
  return allClips(proj().project).find((c) => c.id === ids[0])
}

/** Tiempo local del cabezal dentro de un clip. */
export const localTime = (clip: Clip): number => playback.currentTime - clip.start

/**
 * Alt+K: alterna un keyframe en el cabezal en la propiedad activa; sin propiedad
 * activa, en las propiedades ya animadas o, si no hay, en posición/escala/rotación/opacidad.
 */
export function toggleKeyAtPlayhead(): void {
  const clip = selectedClip()
  if (!clip) {
    ui().toast('info', 'Selecciona un clip para poner keyframes (Alt+K).')
    return
  }
  const valid = clipPropPaths(clip)
  const active = ui().activeProp
  let paths: string[]
  if (active && active.clipId === clip.id && valid.includes(active.path)) paths = [active.path]
  else {
    const animated = valid.filter((p) => getProp(clip, p)?.keyframes?.length)
    paths = animated.length ? animated : DEFAULT_KEY_PATHS.filter((p) => valid.includes(p))
  }
  proj().apply('Keyframe', (p) => toggleKeyframes(p, clip.id, paths, localTime(clip)))
}

export function deleteSelectedKeys(): boolean {
  const keys = ui().selectedKeys
  if (!keys.length) return false
  proj().apply('Eliminar keyframes', (p) => removeKeys(p, keys))
  ui().selectKeys([])
  return true
}

export function copySelectedKeys(): boolean {
  const keys = ui().selectedKeys
  if (!keys.length) return false
  keyClipboard = copyKeys(proj().project, keys)
  if (keyClipboard) ui().toast('info', `${keyClipboard.items.length} keyframe(s) copiados`)
  return true
}

export function pasteKeysAtPlayhead(): boolean {
  const clip = selectedClip()
  if (!keyClipboard || !clip) return false
  const cb = keyClipboard
  const active = ui().activeProp
  const target = active && active.clipId === clip.id ? active.path : undefined
  let refs: KeyRef[] = []
  proj().apply('Pegar keyframes', (p) => {
    const r = pasteKeys(p, clip.id, localTime(clip), cb, target)
    refs = r.refs
    return r.project
  })
  ui().selectKeys(refs)
  return true
}

export function easeSelectedKeys(choice: EaseChoice): void {
  const keys = ui().selectedKeys
  if (!keys.length) {
    ui().toast('info', 'Selecciona keyframes en el graph editor o en el inspector.')
    return
  }
  proj().apply('Cambiar curva', (p) => setKeysEase(p, keys, choice))
}

/** Salta al keyframe anterior/siguiente del clip seleccionado (Alt+←/→). */
export function jumpKey(dir: 1 | -1): void {
  const clip = selectedClip()
  if (!clip) return
  const local = localTime(clip)
  const times = clipKeyTimes(clip)
  const eps = 1e-4
  const t = dir > 0 ? times.find((x) => x > local + eps) : [...times].reverse().find((x) => x < local - eps)
  if (t !== undefined) {
    playback.pause()
    playback.seek(clip.start + t)
  }
}

// ───────────────────────────── parenting ─────────────────────────────

/** Emparenta clips (sin salto: se compensa la transformación en el cabezal). */
export function setParentAction(childIds: string[], parentId: string | null): void {
  if (!childIds.length) return
  const t = playback.currentTime
  const label = parentId ? 'Emparentar' : 'Quitar padre'
  proj().apply(label, (p) => setParent(p, childIds, parentId, t))
  const p = proj().project
  if (parentId) {
    const idx = indexClips(p)
    const skipped = childIds.filter((id) => idx.get(id)?.parentId !== parentId && id !== parentId)
    if (skipped.length) ui().toast('info', 'Algunos clips no se emparentaron: crearían un ciclo o son de audio.')
  }
}

/** Crea un null padre para la selección (el caso de uso clave: animar el null y que todo lo herede). */
export function createNullParentAction(): void {
  const ids = ui().selectedClipIds
  if (!ids.length) {
    ui().toast('info', 'Selecciona los clips que quieres agrupar bajo un null.')
    return
  }
  let nullId: string | null = null
  proj().apply('Crear null padre', (p) => {
    const r = createNullParent(p, ids, playback.currentTime)
    nullId = r.nullId
    return r.project
  })
  if (nullId) ui().selectClips([nullId])
}
