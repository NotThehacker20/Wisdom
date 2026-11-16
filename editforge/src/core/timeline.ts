/**
 * Operaciones de timeline puras e inmutables (Project → Project).
 * Todas las posiciones se ajustan a la rejilla de fotogramas del proyecto.
 *
 * Semántica de solapamiento: modo «sobrescribir» (como Premiere): lo que se
 * coloca encima de otro clip lo recorta, lo divide o lo elimina.
 */
import { uid } from './id'
import { createClipFromAsset, createGeneratorClip, createTrack } from './project'
import type { AnimProp, Clip, ClipKind, Marker, MediaAsset, Project, Track, TrackKind, Transform } from './types'

export const EPS = 1e-6

export const frameRound = (t: number, fps: number): number => Math.round(t * fps) / fps
export const clipEnd = (c: Clip): number => c.start + c.duration

export function trackKindFor(kind: ClipKind): TrackKind {
  return kind === 'audio' ? 'audio' : 'video'
}

const sortClips = (clips: Clip[]): Clip[] => [...clips].sort((a, b) => a.start - b.start)

function mapTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? fn(t) : t)) }
}

export function findTrackOfClip(p: Project, clipId: string): Track | undefined {
  return p.tracks.find((t) => t.clips.some((c) => c.id === clipId))
}

export function allClips(p: Project): Clip[] {
  return p.tracks.flatMap((t) => t.clips)
}

// ───────────────────────────── keyframes ─────────────────────────────

function shiftProp(p: AnimProp, dt: number): AnimProp {
  return p.keyframes ? { ...p, keyframes: p.keyframes.map((k) => ({ ...k, t: k.t + dt })) } : p
}

/** Desplaza los keyframes de un clip (tiempos relativos al inicio del clip). */
export function shiftClipKeyframes(clip: Clip, dt: number): Clip {
  if (dt === 0) return clip
  const tr = {} as Transform
  for (const k of Object.keys(clip.transform) as Array<keyof Transform>) tr[k] = shiftProp(clip.transform[k], dt)
  const effects = clip.effects?.map((fx) => ({
    ...fx,
    params: Object.fromEntries(Object.entries(fx.params).map(([n, p]) => [n, shiftProp(p, dt)]))
  }))
  return { ...clip, transform: tr, ...(effects ? { effects } : {}) }
}

/** Copia de un clip sin transición de entrada (la mitad derecha de un corte empieza en seco). */
function withoutTransition(c: Clip): Clip {
  if (!c.transitionIn) return c
  const { transitionIn: _t, ...rest } = c
  return rest
}

/** Recorta el inicio de un clip `d` segundos (avanza el punto de entrada y los keyframes). */
function trimHead(c: Clip, d: number): Clip {
  return shiftClipKeyframes({ ...c, start: c.start + d, in: c.in + d, duration: c.duration - d }, -d)
}

// ───────────────────────────── sobrescritura ─────────────────────────────

/** Deja libre el rango [start, end) de una pista recortando/dividiendo/eliminando clips. */
export function clearRange(track: Track, start: number, end: number): Track {
  if (end - start <= EPS) return track
  const out: Clip[] = []
  for (const c of track.clips) {
    const ce = clipEnd(c)
    if (ce <= start + EPS || c.start >= end - EPS) {
      out.push(c) // sin solape
    } else if (c.start >= start - EPS && ce <= end + EPS) {
      // totalmente cubierto → se elimina
    } else if (c.start < start && ce > end) {
      out.push({ ...c, duration: start - c.start })
      out.push(withoutTransition({ ...trimHead(c, end - c.start), id: uid('clp_') }))
    } else if (c.start < start) {
      out.push({ ...c, duration: start - c.start })
    } else {
      out.push(trimHead(c, end - c.start))
    }
  }
  return { ...track, clips: sortClips(out) }
}

function placeClip(track: Track, clip: Clip): Track {
  const cleared = clearRange(track, clip.start, clipEnd(clip))
  return { ...cleared, clips: sortClips([...cleared.clips, clip]) }
}

// ───────────────────────────── pistas ─────────────────────────────

export function addTrack(p: Project, kind: TrackKind): { project: Project; trackId: string } {
  const n = p.tracks.filter((t) => t.kind === kind).length + 1
  const track = createTrack(kind, `${kind === 'audio' ? 'Audio' : 'Vídeo'} ${n}`)
  // Las pistas de vídeo nuevas van arriba del todo; las de audio, abajo.
  const tracks = kind === 'video' ? [track, ...p.tracks] : [...p.tracks, track]
  return { project: { ...p, tracks }, trackId: track.id }
}

/** Inserta una pista de vídeo justo encima de otra (o abajo del grupo de vídeo si `aboveId` es null). */
export function insertTrackAt(p: Project, kind: TrackKind, index: number): { project: Project; trackId: string } {
  const n = p.tracks.filter((t) => t.kind === kind).length + 1
  const track = createTrack(kind, `${kind === 'audio' ? 'Audio' : 'Vídeo'} ${n}`)
  const tracks = [...p.tracks]
  tracks.splice(Math.max(0, Math.min(index, tracks.length)), 0, track)
  return { project: normalizeTrackOrder({ ...p, tracks }), trackId: track.id }
}

/** Pistas de vídeo siempre encima de las de audio. */
export function normalizeTrackOrder(p: Project): Project {
  const v = p.tracks.filter((t) => t.kind !== 'audio')
  const a = p.tracks.filter((t) => t.kind === 'audio')
  return { ...p, tracks: [...v, ...a] }
}

export function removeTrack(p: Project, trackId: string): Project {
  return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }
}

export function updateTrack(p: Project, trackId: string, patch: Partial<Pick<Track, 'name' | 'hidden' | 'muted' | 'locked'>>): Project {
  return mapTrack(p, trackId, (t) => ({ ...t, ...patch }))
}

// ───────────────────────────── clips ─────────────────────────────

/** Coloca un clip de medio en una pista (o en una pista nueva si no es compatible). */
export function insertAssetClip(
  p: Project,
  asset: MediaAsset,
  trackId: string | null,
  t: number
): { project: Project; clipId: string } {
  const clip = createClipFromAsset(asset, Math.max(0, frameRound(t, p.settings.fps)))
  clip.duration = frameRound(clip.duration, p.settings.fps) || 1 / p.settings.fps
  return insertClip(p, clip, trackId)
}

export function insertClip(p: Project, clip: Clip, trackId: string | null): { project: Project; clipId: string } {
  const kind = trackKindFor(clip.kind)
  let track = trackId ? p.tracks.find((t) => t.id === trackId) : undefined
  if (!track || track.kind !== kind || track.locked) {
    const r = addTrack(p, kind)
    p = r.project
    track = p.tracks.find((t) => t.id === r.trackId)!
  }
  return { project: mapTrack(p, track.id, (tr) => placeClip(tr, clip)), clipId: clip.id }
}

/** Crea un clip generador (null object o adjustment layer) en una pista nueva encima de todo. */
export function insertGeneratorClip(p: Project, kind: 'null' | 'adjustment', t: number, duration = 5): { project: Project; clipId: string } {
  const r = addTrack(p, 'video')
  return insertClip(r.project, createGeneratorClip(kind, frameRound(t, p.settings.fps), duration), r.trackId)
}

/** Divide un clip en t. Devuelve el id de la mitad derecha (o null si t no cae dentro). */
export function splitClip(p: Project, clipId: string, t: number): { project: Project; rightId: string | null } {
  const track = findTrackOfClip(p, clipId)
  if (!track || track.locked) return { project: p, rightId: null }
  const c = track.clips.find((x) => x.id === clipId)!
  const at = frameRound(t, p.settings.fps)
  if (at <= c.start + EPS || at >= clipEnd(c) - EPS) return { project: p, rightId: null }
  const left: Clip = { ...c, duration: at - c.start }
  const right: Clip = withoutTransition({ ...trimHead(c, at - c.start), id: uid('clp_') })
  return {
    project: mapTrack(p, track.id, (tr) => ({ ...tr, clips: sortClips(tr.clips.flatMap((x) => (x.id === clipId ? [left, right] : [x]))) })),
    rightId: right.id
  }
}

/**
 * Corta en el cabezal: los clips seleccionados que cruza, o si no hay
 * selección, todos los clips que cruza en pistas desbloqueadas.
 */
export function splitAt(p: Project, t: number, selected: string[]): { project: Project; rightIds: string[] } {
  const sel = new Set(selected)
  const targets = p.tracks
    .filter((tr) => !tr.locked)
    .flatMap((tr) => tr.clips)
    .filter((c) => c.start < t - EPS && clipEnd(c) > t + EPS)
    .filter((c) => sel.size === 0 || sel.has(c.id))
  const rightIds: string[] = []
  for (const c of targets) {
    const r = splitClip(p, c.id, t)
    p = r.project
    if (r.rightId) rightIds.push(r.rightId)
  }
  return { project: p, rightIds }
}

export function deleteClips(p: Project, ids: string[]): Project {
  const set = new Set(ids)
  return { ...p, tracks: p.tracks.map((t) => (t.locked ? t : { ...t, clips: t.clips.filter((c) => !set.has(c.id)) })) }
}

/** Borra y cierra el hueco en cada pista afectada (los huecos previos se conservan). */
export function rippleDelete(p: Project, ids: string[]): Project {
  const set = new Set(ids)
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      if (t.locked) return t
      const removed = t.clips.filter((c) => set.has(c.id))
      if (!removed.length) return t
      const kept = t.clips
        .filter((c) => !set.has(c.id))
        .map((c) => {
          const shift = removed.filter((r) => r.start < c.start).reduce((s, r) => s + r.duration, 0)
          return shift ? { ...c, start: Math.max(0, c.start - shift) } : c
        })
      return { ...t, clips: sortClips(kept) }
    })
  }
}

export interface MoveTarget {
  /** Desplazamiento temporal (s). */
  dt: number
  /** Desplazamiento en índices de pista (negativo = hacia arriba). */
  dTrack: number
  /** Crear una pista nueva para los clips (solo si vienen todos de la misma pista). */
  newTrack?: 'top' | 'bottom'
}

/** Comprueba/ajusta un movimiento para que sea válido (sin tiempo negativo, pistas compatibles y desbloqueadas). */
export function constrainMove(p: Project, ids: string[], m: MoveTarget): MoveTarget {
  const moving = p.tracks.flatMap((t, ti) => t.clips.filter((c) => ids.includes(c.id)).map((c) => ({ c, ti })))
  if (!moving.length) return { dt: 0, dTrack: 0 }
  const minStart = Math.min(...moving.map((x) => x.c.start))
  const dt = Math.max(m.dt, -minStart) || 0 // evita -0
  if (m.newTrack) {
    const srcTracks = new Set(moving.map((x) => x.ti))
    if (srcTracks.size === 1) return { dt, dTrack: 0, newTrack: m.newTrack }
  }
  const ok = moving.every(({ c, ti }) => {
    const dst = p.tracks[ti + m.dTrack]
    return dst && dst.kind === trackKindFor(c.kind) && !dst.locked
  })
  return { dt, dTrack: ok ? m.dTrack : 0 }
}

export function moveClips(p: Project, ids: string[], target: MoveTarget): Project {
  const m = constrainMove(p, ids, target)
  const fps = p.settings.fps
  const set = new Set(ids)
  const moved: Array<{ clip: Clip; ti: number }> = []
  p.tracks.forEach((t, ti) => {
    if (t.locked) return
    for (const c of t.clips) if (set.has(c.id)) moved.push({ clip: { ...c, start: frameRound(c.start + m.dt, fps) }, ti: ti + m.dTrack })
  })
  if (!moved.length) return p
  let next: Project = { ...p, tracks: p.tracks.map((t) => (t.locked ? t : { ...t, clips: t.clips.filter((c) => !set.has(c.id)) })) }
  if (m.newTrack) {
    const kind = trackKindFor(moved[0].clip.kind)
    const groupIdx = next.tracks.map((t, i) => (t.kind === kind ? i : -1)).filter((i) => i >= 0)
    const index = m.newTrack === 'top' ? (groupIdx[0] ?? 0) : (groupIdx[groupIdx.length - 1] ?? next.tracks.length - 1) + 1
    const r = insertTrackAt(next, kind, index)
    next = r.project
    const ti = next.tracks.findIndex((t) => t.id === r.trackId)
    moved.forEach((x) => (x.ti = ti))
  }
  const tracks = [...next.tracks]
  for (const { clip, ti } of moved) tracks[ti] = placeClip(tracks[ti], clip)
  return { ...next, tracks }
}

/**
 * Recorta un borde de un clip. No invade clips vecinos y no se sale del
 * medio de origen (las imágenes y generadores se pueden alargar sin límite).
 */
export function trimClip(p: Project, clipId: string, edge: 'start' | 'end', time: number): Project {
  const track = findTrackOfClip(p, clipId)
  if (!track || track.locked) return p
  const fps = p.settings.fps
  const minDur = 1 / fps
  const c = track.clips.find((x) => x.id === clipId)!
  const asset = c.assetId ? p.assets[c.assetId] : undefined
  const srcDur = asset && asset.kind !== 'image' ? asset.duration : Infinity
  const others = track.clips.filter((x) => x.id !== clipId)
  let t = frameRound(time, fps)
  if (edge === 'end') {
    const nextStart = Math.min(Infinity, ...others.filter((o) => o.start >= clipEnd(c) - EPS).map((o) => o.start))
    t = Math.min(t, nextStart, c.start + (srcDur - c.in))
    t = Math.max(t, c.start + minDur)
    return mapTrack(p, track.id, (tr) => ({ ...tr, clips: tr.clips.map((x) => (x.id === clipId ? { ...x, duration: t - c.start } : x)) }))
  }
  const prevEnd = Math.max(0, ...others.filter((o) => clipEnd(o) <= c.start + EPS).map(clipEnd))
  t = Math.max(t, prevEnd, c.start - c.in)
  t = Math.min(t, clipEnd(c) - minDur)
  const d = t - c.start
  return mapTrack(p, track.id, (tr) => ({ ...tr, clips: sortClips(tr.clips.map((x) => (x.id === clipId ? trimHead(x, d) : x))) }))
}

/**
 * Duplica los clips justo después del final de la selección, en sus mismas
 * pistas, desplazando a la derecha lo que hubiera detrás (como CapCut).
 */
export function duplicateClips(p: Project, ids: string[]): { project: Project; newIds: string[] } {
  const set = new Set(ids)
  const sel = allClips(p).filter((c) => set.has(c.id))
  if (!sel.length) return { project: p, newIds: [] }
  const selEnd = Math.max(...sel.map(clipEnd))
  const offset = selEnd - Math.min(...sel.map((c) => c.start))
  const newIds: string[] = []
  const tracks = p.tracks.map((t) => {
    const mine = t.clips.filter((c) => set.has(c.id))
    if (t.locked || !mine.length) return t
    const shifted = t.clips.map((c) => (!set.has(c.id) && c.start >= selEnd - EPS ? { ...c, start: c.start + offset } : c))
    let tr: Track = { ...t, clips: shifted }
    for (const c of mine) {
      const copy = { ...c, id: uid('clp_'), start: c.start + offset }
      newIds.push(copy.id)
      tr = placeClip(tr, copy)
    }
    return tr
  })
  return { project: { ...p, tracks }, newIds }
}

/** Puntos de edición (inicios y finales de clip) ordenados, para saltar con ↑/↓. */
export function editPoints(p: Project): number[] {
  const s = new Set<number>([0])
  for (const c of allClips(p)) {
    s.add(c.start)
    s.add(clipEnd(c))
  }
  return [...s].sort((a, b) => a - b)
}

// ───────────────────────────── snap ─────────────────────────────

export interface SnapResult {
  delta: number
  point: number | null
}

export function snapPoints(p: Project, exclude: string[], playhead: number): number[] {
  const ex = new Set(exclude)
  const pts = [0, playhead, ...p.markers.map((m) => m.t)]
  for (const c of allClips(p)) {
    if (ex.has(c.id)) continue
    pts.push(c.start, clipEnd(c))
  }
  return pts
}

/** Busca el punto de snap más cercano a cualquiera de los tiempos candidatos. */
export function snap(candidates: number[], points: number[], threshold: number): SnapResult {
  let best: SnapResult = { delta: 0, point: null }
  let bestDist = threshold
  for (const t of candidates) {
    for (const pt of points) {
      const d = Math.abs(pt - t)
      if (d <= bestDist) {
        bestDist = d
        best = { delta: pt - t, point: pt }
      }
    }
  }
  return best
}

// ───────────────────────────── marcadores ─────────────────────────────

export const MARKER_COLORS = ['#f5a524', '#22d3c5', '#f05252', '#8b5cf6', '#4ade80']

export function addMarker(p: Project, t: number, label = ''): { project: Project; markerId: string } {
  const at = frameRound(t, p.settings.fps)
  const existing = p.markers.find((m) => Math.abs(m.t - at) < EPS)
  if (existing) return { project: p, markerId: existing.id }
  const marker: Marker = { id: uid('mrk_'), t: at, label, color: MARKER_COLORS[0], kind: 'manual' }
  return { project: { ...p, markers: [...p.markers, marker].sort((a, b) => a.t - b.t) }, markerId: marker.id }
}

export function updateMarker(p: Project, id: string, patch: Partial<Omit<Marker, 'id'>>): Project {
  const fps = p.settings.fps
  return {
    ...p,
    markers: p.markers
      .map((m) => (m.id === id ? { ...m, ...patch, t: patch.t !== undefined ? Math.max(0, frameRound(patch.t, fps)) : m.t } : m))
      .sort((a, b) => a.t - b.t)
  }
}

export function removeMarker(p: Project, id: string): Project {
  return { ...p, markers: p.markers.filter((m) => m.id !== id) }
}

// ───────────────────────────── medios ─────────────────────────────

/** Quita un medio del proyecto y todos sus clips. */
export function removeAsset(p: Project, assetId: string): Project {
  const assets = { ...p.assets }
  delete assets[assetId]
  return { ...p, assets, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.assetId !== assetId) })) }
}
