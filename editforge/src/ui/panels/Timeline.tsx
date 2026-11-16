import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { projectDuration } from '@/core/project'
import {
  clipEnd, constrainMove, insertAssetClip, moveClips, snap, snapPoints, trimClip, updateMarker, updateTrack, type MoveTarget
} from '@/core/timeline'
import { formatTimecode } from '@/core/time'
import { clipKeyTimes } from '@/core/props'
import { isRamp } from '@/core/speed'
import { indexClips } from '@/core/layerTransform'
import type { Clip, MediaAsset, Project, Track } from '@/core/types'
import {
  addEffectAction, addGenerator, addTransitionAction, removeSelectedTransition, setBeatGrid, addMarkerAtPlayhead, copyEffectsOf, createNullParentAction, hasCopiedEffects, pasteEffectsTo, setParentAction, addTrackAction, deleteSelection, duplicateSelection, removeTrackAction, splitAtPlayhead,
  zoomBy, zoomToFit
} from '@/state/actions'
import { importPaths, pathsFromDrop } from '@/state/importMedia'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { openContextMenu, type MenuItem } from '../ContextMenu'
import { ASSET_DRAG_TYPE, EFFECT_DRAG_TYPE, TRANSITION_DRAG_TYPE } from '../dnd'
import { findCuts, getTransition, trackTransitions, updateTransition } from '@/core/transitions'
import { getEffect } from '@/core/effects'
import { projectBeatPoints } from '@/core/audio/beatMarkers'
import type { Peaks } from '@/core/audio/peaks'
import { useAudioAnalysis } from '@/state/audioAnalysis'
import { Waveform } from '../Waveform'


const HEADER_W = 176
const RULER_H = 28
const trackHeight = (t: Track) => (t.kind === 'audio' ? 50 : 64)
/** Píxeles a partir de los que un clic se convierte en arrastre. */
const DRAG_START_PX = 3
/** Distancia de snap en píxeles. */
const SNAP_PX = 8

type Drag =
  | { kind: 'move'; ids: string[]; x0: number; y0: number; anchorTrack: number; started: boolean; target: MoveTarget; snapAt: number | null; clickId: string }
  | { kind: 'trim'; id: string; edge: 'start' | 'end'; time: number; edge0: number; x0: number; snapAt: number | null }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; mode: 'replace' | 'add' }
  | { kind: 'marker'; id: string; t: number; t0: number; started: boolean; x0: number; snapAt: number | null }
  | { kind: 'scrub' }

function pickStep(pps: number, fps: number): number {
  const steps = [1 / fps, 2 / fps, 5 / fps, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return steps.find((s) => s * pps >= 64) ?? 1200
}

function tickLabel(t: number, step: number, fps: number): string {
  if (step < 0.25) {
    const f = Math.round(t * fps) % fps
    if (f !== 0) return `${f}f`
  }
  const m = Math.floor(t / 60)
  const s = Math.round(t % 60)
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

// ───────────────────────────── Clip ─────────────────────────────

interface ClipViewProps {
  clip: Clip
  pps: number
  selected: boolean
  thumb?: string
  asset?: MediaAsset
  locked: boolean
  /** Relación con el clip seleccionado: su padre o uno de sus hijos. */
  relation: 'parent' | 'child' | null
  parentName?: string
  pickTarget: boolean
  fxTarget: boolean
  peaks?: Peaks
  onPointerDown(e: React.PointerEvent, clip: Clip, part: 'body' | 'start' | 'end'): void
  onContextMenu(e: React.MouseEvent, clip: Clip): void
  onPickStart(e: React.PointerEvent, clip: Clip): void
}

const ClipView = memo(function ClipView({
  clip, pps, selected, thumb, asset, locked, relation, parentName, pickTarget, fxTarget, peaks, onPointerDown, onContextMenu, onPickStart
}: ClipViewProps) {
  const w = Math.max(2, clip.duration * pps)
  const missing = asset?.missing
  const keyTimes = useMemo(() => clipKeyTimes(clip).filter((t) => t >= 0 && t <= clip.duration), [clip])
  return (
    <div
      className={`tl-clip tl-clip-${clip.kind} ${selected ? 'selected' : ''} ${missing ? 'missing' : ''} ${locked ? 'locked' : ''} ${relation ? `rel-${relation}` : ''} ${pickTarget ? 'pick-target' : ''} ${fxTarget ? 'fx-target' : ''}`}
      style={{ left: clip.start * pps, width: w }}
      data-clip-id={clip.id}
      onPointerDown={(e) => onPointerDown(e, clip, 'body')}
      onContextMenu={(e) => {
        // Sin esto el menú de la pista (más abajo en el DOM) sustituye al del clip.
        e.stopPropagation()
        onContextMenu(e, clip)
      }}
      title={`${clip.name}\n${clip.duration.toFixed(2)} s${missing ? '\n⚠ Medio no encontrado' : ''}`}
    >
      {thumb && clip.kind !== 'audio' && <div className="tl-clip-thumbs" style={{ backgroundImage: `url(${thumb})` }} />}
      {peaks && (
        <div className={`tl-wave ${clip.kind === 'audio' ? 'full' : 'strip'} ${clip.muted ? 'muted' : ''}`}>
          <Waveform
            peaks={peaks}
            from={clip.in}
            to={clip.in + clip.duration}
            width={w}
            height={clip.kind === 'audio' ? 34 : 16}
            color={clip.kind === 'audio' ? 'rgba(170,255,200,.85)' : 'rgba(200,230,255,.7)'}
            gain={clip.volume}
          />
        </div>
      )}
      {(clip.fadeIn ?? 0) > 0 && <div className="tl-fade in" style={{ width: (clip.fadeIn ?? 0) * pps }} />}
      {(clip.fadeOut ?? 0) > 0 && <div className="tl-fade out" style={{ width: (clip.fadeOut ?? 0) * pps }} />}
      <div className="tl-clip-head">
        {clip.kind !== 'audio' && !locked && w > 40 && (
          <span
            className={`tl-pick ${clip.parentId ? 'linked' : ''}`}
            title="Pick whip: arrastra hasta otro clip para emparentar"
            onPointerDown={(e) => onPickStart(e, clip)}
          >
            ⊚
          </span>
        )}
        <span className="tl-clip-label">
          {missing && '⚠ '}
          {clip.name}
        </span>
        {parentName && w > 90 && <span className="tl-parent-badge" title={`Padre: ${parentName}`}>↳ {parentName}</span>}
        {(clip.reverse || isRamp(clip) || (clip.speed && clip.speed.value !== 100)) && (
          <span className="tl-speed-badge" title="Velocidad">
            {clip.reverse ? '◀ ' : ''}
            {isRamp(clip) ? '↯ curva' : clip.speed && clip.speed.value !== 100 ? `${+(clip.speed.value / 100).toFixed(2)}×` : ''}
          </span>
        )}
        {clip.effects?.length ? (
          <span className="tl-fx-badge" title={clip.effects.map((f) => getEffect(f.type)?.name ?? f.type).join(', ')}>
            fx{clip.effects.length > 1 ? ` ${clip.effects.length}` : ''}
          </span>
        ) : null}
      </div>
      {keyTimes.length > 0 && (
        <div className="tl-keys">
          {keyTimes.map((t) => (
            <span
              key={t}
              className="tl-key"
              style={{ left: t * pps }}
              title={`Keyframe ${t.toFixed(2)} s`}
              onPointerDown={(e) => {
                e.stopPropagation()
                useUi.getState().selectClips([clip.id])
                playback.pause()
                playback.seek(clip.start + t)
              }}
            />
          ))}
        </div>
      )}
      {!locked && w > 14 && (
        <>
          <div className="tl-handle start" onPointerDown={(e) => onPointerDown(e, clip, 'start')} />
          <div className="tl-handle end" onPointerDown={(e) => onPointerDown(e, clip, 'end')} />
        </>
      )}
    </div>
  )
})

// ───────────────────────────── Cabecera de pista ─────────────────────────────

function TrackHeader({ track, height }: { track: Track; height: number }) {
  const apply = useProject((s) => s.apply)
  const [editing, setEditing] = useState(false)
  const toggle = (k: 'hidden' | 'muted' | 'locked') => apply('Cambiar pista', (p) => updateTrack(p, track.id, { [k]: !track[k] }))
  return (
    <div
      className="tl-track-header"
      style={{ width: HEADER_W, height }}
      onContextMenu={(e) =>
        openContextMenu(e, [
          { label: 'Renombrar', action: () => setEditing(true) },
          { separator: true, label: '' },
          { label: 'Eliminar pista', danger: true, action: () => removeTrackAction(track.id) }
        ])
      }
    >
      {editing ? (
        <input
          className="tl-track-name-input"
          autoFocus
          defaultValue={track.name}
          onBlur={(e) => {
            setEditing(false)
            const name = e.target.value.trim()
            if (name && name !== track.name) apply('Renombrar pista', (p) => updateTrack(p, track.id, { name }))
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span className="tl-track-name" onDoubleClick={() => setEditing(true)}>
          {track.name}
        </span>
      )}
      <div className="tl-track-buttons">
        {track.kind !== 'audio' && (
          <button className={`tl-tbtn ${track.hidden ? 'off' : ''}`} title={track.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => toggle('hidden')}>
            {track.hidden ? '◌' : '◉'}
          </button>
        )}
        <button className={`tl-tbtn ${track.muted ? 'off' : ''}`} title={track.muted ? 'Activar sonido' : 'Silenciar'} onClick={() => toggle('muted')}>
          {track.muted ? '🔇' : '🔊'}
        </button>
        <button className={`tl-tbtn ${track.locked ? 'on' : ''}`} title={track.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => toggle('locked')}>
          {track.locked ? '🔒' : '🔓'}
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────── Barra de herramientas ─────────────────────────────

function Toolbar() {
  const { timelineZoom, setTimelineZoom, snapEnabled, setSnap, selectedClipIds, selectedMarkerId } = useUi()
  const hasSel = selectedClipIds.length > 0
  return (
    <div className="panel-toolbar tl-toolbar">
      <button className="tool" title="Cortar en el cabezal (C)" onClick={splitAtPlayhead}>
        ✂ Cortar
      </button>
      <button className="tool" title="Eliminar (Supr)" disabled={!hasSel && !selectedMarkerId} onClick={() => deleteSelection(false)}>
        🗑
      </button>
      <button className="tool" title="Eliminar cerrando el hueco (Mayús+Supr)" disabled={!hasSel} onClick={() => deleteSelection(true)}>
        ⇤ Ripple
      </button>
      <button className="tool" title="Duplicar (Ctrl+D)" disabled={!hasSel} onClick={duplicateSelection}>
        ⧉
      </button>
      <button className="tool" title="Marcador en el cabezal (M)" onClick={addMarkerAtPlayhead}>
        ⚑
      </button>
      <span className="tool-sep" />
      <button className="tool" title="Nueva pista de vídeo" onClick={() => addTrackAction('video')}>
        + Vídeo
      </button>
      <button className="tool" title="Nueva pista de audio" onClick={() => addTrackAction('audio')}>
        + Audio
      </button>
      <button className="tool" title="Null object en el cabezal" onClick={() => addGenerator('null')}>
        + Null
      </button>
      <button className="tool" title="Null padre para los clips seleccionados (Mayús+N)" onClick={createNullParentAction}>
        ◇ Null padre
      </button>
      <button className="tool" title="Capa de ajuste en el cabezal" onClick={() => addGenerator('adjustment')}>
        + Ajuste
      </button>
      <span className="tool-sep" />
      <button className={`tool toggle ${snapEnabled ? 'on' : ''}`} title="Imán / snap (S)" onClick={() => setSnap(!snapEnabled)}>
        🧲 Snap
      </button>
      <div className="tool-spacer" />
      <button className="tool" title="Alejar (-)" onClick={() => zoomBy(1 / 1.4)}>
        −
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round((Math.log(timelineZoom / 2) / Math.log(750)) * 1000)}
        onChange={(e) => setTimelineZoom(2 * Math.pow(750, Number(e.target.value) / 1000))}
        title="Zoom (Ctrl+rueda)"
      />
      <button className="tool" title="Acercar (+)" onClick={() => zoomBy(1.4)}>
        +
      </button>
      <button className="tool" title="Ajustar a la ventana" onClick={zoomToFit}>
        ⤢
      </button>
    </div>
  )
}

// ───────────────────────────── Timeline ─────────────────────────────

export function Timeline() {
  const project = useProject((s) => s.project)
  const apply = useProject((s) => s.apply)
  const time = usePlayback((s) => s.time)
  const playing = usePlayback((s) => s.playing)
  const { timelineZoom: pps, selectedClipIds, selectClips, selectedMarkerId, selectMarker, thumbnails, snapEnabled } = useUi()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const tracksRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [dropAt, setDropAt] = useState<{ track: number; t: number } | null>(null)
  const [fxDrop, setFxDrop] = useState<string | null>(null)
  const [transDrop, setTransDrop] = useState<{ track: number; bId: string; t: number } | null>(null)
  const selectedTransition = useUi((s) => s.selectedTransition)

  /** Clic en una transición: la selecciona; arrastrar un borde cambia su duración (simétrica respecto al corte). */
  const onTransitionDown = (e: React.PointerEvent, bId: string, cut: number, locked: boolean, edge: boolean) => {
    if (e.button !== 0) return
    e.stopPropagation()
    useUi.getState().selectTransition(bId)
    if (!edge || locked) return
    const tr = useProject.getState().beginTransient()
    let changed = false
    const move = (ev: PointerEvent) => {
      changed = true
      const d = 2 * Math.abs(timeAt(ev.clientX) - cut)
      tr.update((p) => updateTransition(p, bId, { duration: d }))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      tr.end(changed ? 'Duración de transición' : null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null)
  const selected = useMemo(() => new Set(selectedClipIds), [selectedClipIds])
  const analysis = useAudioAnalysis((s) => s.entries)
  const beats = useMemo(() => projectBeatPoints(project, (id) => analysis[id]?.beats), [project, analysis])
  const beatTimes = useMemo(() => beats.map((b) => b.t), [beats])
  const [pick, setPick] = useState<{ ids: string[]; x0: number; y0: number; x: number; y: number; target: string | null } | null>(null)

  // Padre e hijos del clip seleccionado (se resaltan en la timeline).
  const index = useMemo(() => indexClips(project), [project])
  const relations = useMemo(() => {
    const m = new Map<string, 'parent' | 'child'>()
    if (selectedClipIds.length !== 1) return m
    const sel = index.get(selectedClipIds[0])
    if (sel?.parentId) m.set(sel.parentId, 'parent')
    for (const c of index.values()) if (c.parentId === selectedClipIds[0]) m.set(c.id, 'child')
    return m
  }, [index, selectedClipIds])

  /** Pick whip: arrastrar desde ⊚ hasta otro clip para emparentar (todos los seleccionados si el origen lo está). */
  const onPickStart = useCallback((e: React.PointerEvent, clip: Clip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const sel = useUi.getState().selectedClipIds
    const ids = sel.includes(clip.id) ? sel : [clip.id]
    if (!sel.includes(clip.id)) useUi.getState().selectClips([clip.id])
    const targetAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-clip-id]') as HTMLElement | null
      const id = el?.dataset.clipId ?? null
      return id && !ids.includes(id) ? id : null
    }
    setPick({ ids, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, target: null })
    const move = (ev: PointerEvent) => setPick((p) => (p ? { ...p, x: ev.clientX, y: ev.clientY, target: targetAt(ev.clientX, ev.clientY) } : p))
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPick(null)
      const target = targetAt(ev.clientX, ev.clientY)
      if (target) setParentAction(ids, target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [])

  const updateDrag = (d: Drag | null) => {
    dragRef.current = d
    setDrag(d)
  }

  // Proyecto que se muestra: con la vista previa del arrastre en curso aplicada.
  const view: Project = useMemo(() => {
    if (!drag) return project
    if (drag.kind === 'move' && drag.started) return moveClips(project, drag.ids, drag.target)
    if (drag.kind === 'trim') return trimClip(project, drag.id, drag.edge, drag.time)
    if (drag.kind === 'marker' && drag.started) return updateMarker(project, drag.id, { t: drag.t })
    return project
  }, [project, drag])

  const duration = projectDuration(view)
  const width = Math.max(duration + 20, 30) * pps
  const step = pickStep(pps, project.settings.fps)
  const fps = project.settings.fps

  // ── geometría ──
  const timeAt = useCallback(
    (clientX: number) => {
      const r = contentRef.current!.getBoundingClientRect()
      return (clientX - r.left - HEADER_W) / pps
    },
    [pps]
  )

  /** Índice de pista bajo la coordenada Y (-1 = encima de todas, n = debajo). */
  const trackIndexAt = useCallback(
    (clientY: number) => {
      const y = clientY - tracksRef.current!.getBoundingClientRect().top
      if (y < 0) return -1
      let acc = 0
      for (let i = 0; i < project.tracks.length; i++) {
        acc += trackHeight(project.tracks[i])
        if (y < acc) return i
      }
      return project.tracks.length
    },
    [project.tracks]
  )

  const snapThreshold = SNAP_PX / pps
  const doSnap = (candidates: number[], exclude: string[], e: { altKey: boolean }) => {
    if (!snapEnabled || e.altKey) return { delta: 0, point: null }
    return snap(candidates, snapPoints(project, exclude, playback.currentTime, beatTimes), snapThreshold)
  }

  // ── arrastres (listeners globales mientras dura el gesto) ──
  const beginGesture = (d: Drag) => {
    updateDrag(d)
    const move = (e: PointerEvent) => onGestureMove(e)
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      onGestureEnd(e)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const onGestureMove = (e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    autoScroll(e)
    if (d.kind === 'scrub') {
      let t = Math.max(0, timeAt(e.clientX))
      // Mayús: el cabezal se pega a beats, marcadores y bordes de clips.
      if (e.shiftKey) t += snap([t], snapPoints(project, [], -1, beatTimes), snapThreshold).delta
      playback.scrub(t)
    } else if (d.kind === 'move') {
      const dx = e.clientX - d.x0
      if (!d.started && Math.hypot(dx, e.clientY - d.y0) < DRAG_START_PX) return
      const clips = project.tracks.flatMap((t) => t.clips).filter((c) => d.ids.includes(c.id))
      let dt = dx / pps
      const s = doSnap(clips.flatMap((c) => [c.start + dt, clipEnd(c) + dt]), d.ids, e)
      dt += s.delta
      const cur = trackIndexAt(e.clientY)
      const raw: MoveTarget =
        cur < 0 ? { dt, dTrack: 0, newTrack: 'top' } : cur >= project.tracks.length ? { dt, dTrack: 0, newTrack: 'bottom' } : { dt, dTrack: cur - d.anchorTrack }
      updateDrag({ ...d, started: true, target: constrainMove(project, d.ids, raw), snapAt: s.point })
    } else if (d.kind === 'trim') {
      // Delta relativo: el borde no salta aunque se agarre el tirador unos píxeles dentro.
      let t = d.edge0 + (e.clientX - d.x0) / pps
      const s = doSnap([t], [d.id], e)
      t += s.delta
      updateDrag({ ...d, time: t, snapAt: s.point })
    } else if (d.kind === 'marquee') {
      const r = contentRef.current!.getBoundingClientRect()
      updateDrag({ ...d, x1: e.clientX - r.left, y1: e.clientY - r.top })
    } else if (d.kind === 'marker') {
      if (!d.started && Math.abs(e.clientX - d.x0) < DRAG_START_PX) return
      let t = Math.max(0, d.t0 + (e.clientX - d.x0) / pps)
      const s = doSnap([t], [], e)
      t += s.delta
      updateDrag({ ...d, started: true, t, snapAt: s.point })
    }
  }

  const onGestureEnd = (e: PointerEvent) => {
    const d = dragRef.current
    updateDrag(null)
    if (!d) return
    if (d.kind === 'move') {
      if (d.started) {
        if (d.target.dt !== 0 || d.target.dTrack !== 0 || d.target.newTrack) {
          apply(d.ids.length > 1 ? 'Mover clips' : 'Mover clip', (p) => moveClips(p, d.ids, d.target))
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        selectClips([d.clickId]) // clic simple dentro de una selección múltiple
      }
    } else if (d.kind === 'trim') {
      apply('Recortar clip', (p) => trimClip(p, d.id, d.edge, d.time))
    } else if (d.kind === 'marker' && d.started) {
      apply('Mover marcador', (p) => updateMarker(p, d.id, { t: d.t }))
    } else if (d.kind === 'marquee') {
      const x0 = Math.min(d.x0, d.x1) - HEADER_W
      const x1 = Math.max(d.x0, d.x1) - HEADER_W
      const y0 = Math.min(d.y0, d.y1) - RULER_H
      const y1 = Math.max(d.y0, d.y1) - RULER_H
      if (x1 - x0 < DRAG_START_PX && y1 - y0 < DRAG_START_PX) return
      const hits: string[] = []
      let top = 0
      for (const tr of project.tracks) {
        const h = trackHeight(tr)
        if (top + h > y0 && top < y1 && !tr.locked) {
          for (const c of tr.clips) if (clipEnd(c) * pps > x0 && c.start * pps < x1) hits.push(c.id)
        }
        top += h
      }
      selectClips(hits, d.mode)
    }
  }

  /** Desplaza la vista si el puntero se acerca a los bordes durante un arrastre. */
  const autoScroll = (e: PointerEvent) => {
    const el = scrollRef.current!
    const r = el.getBoundingClientRect()
    const edge = 40
    if (e.clientX > r.right - edge) el.scrollLeft += 20
    else if (e.clientX < r.left + HEADER_W + edge && el.scrollLeft > 0) el.scrollLeft -= 20
  }

  // ── manejadores ──
  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clip: Clip, part: 'body' | 'start' | 'end') => {
      if (e.button !== 0) return
      e.stopPropagation()
      const st = useProject.getState().project
      const track = st.tracks.find((t) => t.clips.some((c) => c.id === clip.id))
      if (!track || track.locked) return
      if (part !== 'body') {
        selectClips([clip.id])
        const edge0 = part === 'start' ? clip.start : clipEnd(clip)
        beginGesture({ kind: 'trim', id: clip.id, edge: part, time: edge0, edge0, x0: e.clientX, snapAt: null })
        return
      }
      let ids = useUi.getState().selectedClipIds
      if (e.ctrlKey || e.metaKey) {
        selectClips([clip.id], 'toggle')
        ids = useUi.getState().selectedClipIds
        if (!ids.includes(clip.id)) return
      } else if (e.shiftKey) {
        selectClips([clip.id], 'add')
        ids = useUi.getState().selectedClipIds
      } else if (!ids.includes(clip.id)) {
        selectClips([clip.id])
        ids = [clip.id]
      }
      // Solo se arrastran clips de pistas desbloqueadas.
      const movable = ids.filter((id) => st.tracks.some((t) => !t.locked && t.clips.some((c) => c.id === id)))
      beginGesture({
        kind: 'move',
        ids: movable,
        x0: e.clientX,
        y0: e.clientY,
        anchorTrack: trackIndexAt(e.clientY),
        started: false,
        target: { dt: 0, dTrack: 0 },
        snapAt: null,
        clickId: clip.id
      })
    },
    [pps, project, snapEnabled]
  )

  const onClipContextMenu = useCallback((e: React.MouseEvent, clip: Clip) => {
    if (!useUi.getState().selectedClipIds.includes(clip.id)) useUi.getState().selectClips([clip.id])
    const ids = useUi.getState().selectedClipIds
    const n = ids.length
    const hasParent = ids.some((id) => indexClips(useProject.getState().project).get(id)?.parentId)
    const items: MenuItem[] = [
      { label: 'Cortar en el cabezal', shortcut: 'C', action: splitAtPlayhead },
      { separator: true, label: '' },
      { label: n > 1 ? `Crear null padre para ${n} clips` : 'Crear null padre', shortcut: 'Mayús+N', action: createNullParentAction },
      { label: 'Quitar padre', disabled: !hasParent, action: () => setParentAction(ids, null) },
      { separator: true, label: '' },
      ...(clip.assetId && useProject.getState().project.assets[clip.assetId]?.hasAudio
        ? ([
            { label: 'Beats: cada beat', action: () => setBeatGrid(ids, 'beats') },
            { label: 'Beats: cada 2', action: () => setBeatGrid(ids, 'half') },
            { label: 'Beats: cada compás (4)', action: () => setBeatGrid(ids, 'bars') },
            { label: 'Beats: golpes (onsets)', action: () => setBeatGrid(ids, 'onsets') },
            { label: 'Beats: ocultar', action: () => setBeatGrid(ids, 'off') }
          ] as MenuItem[])
        : []),
      { separator: true, label: '' },
      { label: 'Copiar efectos', disabled: !clip.effects?.length, action: () => copyEffectsOf(clip.id) },
      { label: n > 1 ? `Pegar efectos en ${n} clips` : 'Pegar efectos', disabled: !hasCopiedEffects(), action: () => pasteEffectsTo(ids) },
      { label: n > 1 ? `Duplicar ${n} clips` : 'Duplicar', shortcut: 'Ctrl+D', action: duplicateSelection },
      { separator: true, label: '' },
      { label: 'Eliminar', shortcut: 'Supr', action: () => deleteSelection(false) },
      { label: 'Eliminar con ripple', shortcut: 'Mayús+Supr', danger: true, action: () => deleteSelection(true) }
    ]
    openContextMenu(e, items)
  }, [])

  const onEmptyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const r = contentRef.current!.getBoundingClientRect()
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    if (!additive) selectClips([])
    selectMarker(null)
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    beginGesture({ kind: 'marquee', x0: x, y0: y, x1: x, y1: y, mode: additive ? 'add' : 'replace' })
  }

  const onRulerPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    playback.scrub(Math.max(0, timeAt(e.clientX)))
    beginGesture({ kind: 'scrub' })
  }

  const onMarkerPointerDown = (e: React.PointerEvent, id: string, t: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    selectMarker(id)
    useUi.setState({ selectedClipIds: [] })
    beginGesture({ kind: 'marker', id, t, t0: t, started: false, x0: e.clientX, snapAt: null })
  }

  // ── soltar medios desde la biblioteca o el explorador ──
  const clipAtPoint = (x: number, y: number): string | null =>
    ((document.elementFromPoint(x, y)?.closest('[data-clip-id]') as HTMLElement | null)?.dataset.clipId ?? null)

  const onDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types
    if (types.includes(TRANSITION_DRAG_TYPE)) {
      // Resalta el corte más cercano de la pista bajo el puntero.
      e.preventDefault()
      const ti = trackIndexAt(e.clientY)
      const track = project.tracks[ti]
      const t = timeAt(e.clientX)
      const cut = track ? findCuts(track).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0] : undefined
      const near = cut && Math.abs(cut.t - t) * pps < 40 && !track.locked
      e.dataTransfer.dropEffect = near ? 'copy' : 'none'
      setTransDrop(near ? { track: ti, bId: cut.b.id, t: cut.t } : null)
      return
    }
    if (types.includes(EFFECT_DRAG_TYPE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const id = clipAtPoint(e.clientX, e.clientY)
      setFxDrop(id)
      setDropAt(id ? null : { track: -1, t: Math.max(0, timeAt(e.clientX)) })
      return
    }
    if (!types.includes(ASSET_DRAG_TYPE) && !types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    let t = Math.max(0, timeAt(e.clientX))
    const s = doSnap([t], [], e)
    t += s.delta
    setDropAt({ track: trackIndexAt(e.clientY), t })
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const at = dropAt
    setDropAt(null)
    const trType = e.dataTransfer.getData(TRANSITION_DRAG_TYPE)
    if (trType) {
      const target = transDrop
      setTransDrop(null)
      if (target) addTransitionAction(trType, target.bId)
      return
    }
    const fxType = e.dataTransfer.getData(EFFECT_DRAG_TYPE)
    if (fxType) {
      const target = clipAtPoint(e.clientX, e.clientY)
      setFxDrop(null)
      if (target) addEffectAction(fxType, [target])
      else {
        // Soltar un efecto en una zona vacía crea una capa de ajuste en ese instante.
        playback.seek(Math.max(0, timeAt(e.clientX)))
        addEffectAction(fxType, [])
      }
      return
    }
    if (!at) return
    const trackId = project.tracks[at.track]?.id ?? null
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE)
    let assets: MediaAsset[] = []
    if (assetId) {
      const a = project.assets[assetId]
      if (a) assets = [a]
    } else {
      assets = await importPaths(pathsFromDrop(e))
    }
    if (!assets.length) return
    let lastId = ''
    apply(assets.length > 1 ? `Añadir ${assets.length} clips` : `Añadir ${assets[0].name}`, (p) => {
      let t = at.t
      let tid = trackId
      for (const a of assets) {
        // Si la pista no es compatible (p. ej. audio sobre vídeo) se crea una nueva.
        const r = insertAssetClip(p, a, tid, t)
        p = r.project
        lastId = r.clipId
        const placed = p.tracks.find((tr) => tr.clips.some((c) => c.id === r.clipId))!
        tid = placed.id
        t = clipEnd(placed.clips.find((c) => c.id === r.clipId)!)
      }
      return p
    })
    if (lastId) selectClips([lastId])
  }

  // ── zoom con Ctrl+rueda alrededor del puntero ──
  useEffect(() => {
    const el = scrollRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey) return
      e.preventDefault()
      const ui = useUi.getState()
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left - HEADER_W
      zoomAnchor.current = { t: (x + el.scrollLeft) / ui.timelineZoom, x }
      ui.setTimelineZoom(ui.timelineZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Mantiene el instante bajo el puntero (o el cabezal) fijo al cambiar el zoom.
  const prevPps = useRef(pps)
  useLayoutEffect(() => {
    if (prevPps.current === pps) return
    const el = scrollRef.current!
    const anchor = zoomAnchor.current ?? { t: playback.currentTime, x: playback.currentTime * prevPps.current - el.scrollLeft }
    el.scrollLeft = Math.max(0, anchor.t * pps - anchor.x)
    zoomAnchor.current = null
    prevPps.current = pps
  }, [pps])

  // Ancho visible (para «ajustar a la ventana»).
  useEffect(() => {
    const el = scrollRef.current!
    const ro = new ResizeObserver(() => useUi.setState({ timelineViewportWidth: el.clientWidth - HEADER_W - 20 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Durante la reproducción, la vista sigue al cabezal por páginas.
  useEffect(() => {
    if (!playing) return
    const el = scrollRef.current!
    const x = time * pps
    const visible = el.clientWidth - HEADER_W
    if (x < el.scrollLeft || x > el.scrollLeft + visible - 20) el.scrollLeft = Math.max(0, x - 40)
  }, [time, playing, pps])

  // ── render ──
  const ticks: number[] = []
  for (let i = 0; i * step * pps < width; i++) ticks.push(i * step)
  const totalTracksH = view.tracks.reduce((s, t) => s + trackHeight(t), 0)
  const snapLine = drag && 'snapAt' in drag ? drag.snapAt : null
  // Tiempo real del borde recortado (ya limitado por vecinos y duración del medio).
  const trimInfo = (() => {
    if (drag?.kind !== 'trim') return null
    const c = view.tracks.flatMap((t) => t.clips).find((x) => x.id === drag.id)
    return c ? { time: drag.edge === 'start' ? c.start : clipEnd(c) } : null
  })()

  return (
    <div className="timeline">
      <Toolbar />
      <div className="tl-scroll" ref={scrollRef} onDragOver={onDragOver} onDragLeave={() => {
          setDropAt(null)
          setFxDrop(null)
          setTransDrop(null)
        }} onDrop={(e) => void onDrop(e)}>
        <div className="tl-content" ref={contentRef} style={{ width: width + HEADER_W }}>
          <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={onRulerPointerDown}>
            <div className="tl-corner" style={{ width: HEADER_W }}>
              <span className="tl-corner-tc">{formatTimecode(time, fps)}</span>
            </div>
            {ticks.map((t) => (
              <div key={t} className="tl-tick" style={{ left: HEADER_W + t * pps }}>
                <span>{tickLabel(t, step, fps)}</span>
              </div>
            ))}
            {beats.map((b, k) => (
              <div key={`b${k}`} className={`tl-beat ${b.strong ? 'strong' : ''}`} style={{ left: HEADER_W + b.t * pps }} />
            ))}
            {view.markers.map((m) => (
              <div
                key={m.id}
                className={`tl-marker ${m.id === selectedMarkerId ? 'selected' : ''} ${m.kind}`}
                style={{ left: HEADER_W + m.t * pps, ['--mk' as string]: m.color }}
                title={`${m.label || 'Marcador'} · ${formatTimecode(m.t, fps)}`}
                onPointerDown={(e) => onMarkerPointerDown(e, m.id, m.t)}
                onDoubleClick={() => {
                  playback.pause()
                  playback.seek(m.t)
                }}
              />
            ))}
          </div>

          <div className="tl-tracks" ref={tracksRef}>
            {view.tracks.map((track, i) => (
              <div key={track.id} className={`tl-track tl-track-${track.kind} ${track.locked ? 'locked' : ''} ${track.hidden ? 'hidden' : ''}`} style={{ height: trackHeight(track) }}>
                <TrackHeader track={track} height={trackHeight(track)} />
                <div
                  className={`tl-track-body ${dropAt?.track === i ? 'drop-target' : ''}`}
                  onPointerDown={onEmptyPointerDown}
                  onContextMenu={(e) =>
                    openContextMenu(e, [
                      {
                        label: 'Añadir marcador aquí',
                        action: () => {
                          playback.seek(Math.max(0, timeAt(e.clientX)))
                          addMarkerAtPlayhead()
                        }
                      }
                    ])
                  }
                >
                  {track.clips.map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      pps={pps}
                      selected={selected.has(c.id)}
                      thumb={c.assetId ? thumbnails[c.assetId] : undefined}
                      asset={c.assetId ? view.assets[c.assetId] : undefined}
                      locked={track.locked}
                      relation={relations.get(c.id) ?? null}
                      parentName={c.parentId ? index.get(c.parentId)?.name : undefined}
                      pickTarget={pick?.target === c.id}
                      fxTarget={fxDrop === c.id}
                      peaks={c.assetId ? analysis[c.assetId]?.peaks : undefined}
                      onPointerDown={onClipPointerDown}
                      onContextMenu={onClipContextMenu}
                      onPickStart={onPickStart}
                    />
                  ))}
                  {trackTransitions(track).map((tr) => (
                    <div
                      key={tr.b.id}
                      className={`tl-trans ${selectedTransition === tr.b.id ? 'selected' : ''}`}
                      style={{ left: tr.start * pps, width: Math.max(10, (tr.end - tr.start) * pps) }}
                      title={`${getTransition(tr.trans.type)?.name ?? tr.trans.type} · ${tr.trans.duration.toFixed(2)} s`}
                      onPointerDown={(e) => onTransitionDown(e, tr.b.id, tr.t, track.locked, false)}
                      onContextMenu={(e) => {
                        e.stopPropagation()
                        useUi.getState().selectTransition(tr.b.id)
                        openContextMenu(e, [{ label: 'Quitar transición', danger: true, action: removeSelectedTransition }])
                      }}
                    >
                      <div className="tl-trans-h start" onPointerDown={(e) => onTransitionDown(e, tr.b.id, tr.t, track.locked, true)} />
                      <span className="tl-trans-icon">⧓</span>
                      <div className="tl-trans-h end" onPointerDown={(e) => onTransitionDown(e, tr.b.id, tr.t, track.locked, true)} />
                    </div>
                  ))}
                  {transDrop?.track === i && <div className="tl-cut-target" style={{ left: transDrop.t * pps }} />}
                </div>
              </div>
            ))}
            <div className={`tl-empty-zone ${dropAt && dropAt.track >= view.tracks.length ? 'drop-target' : ''}`} onPointerDown={onEmptyPointerDown}>
              {view.tracks.every((t) => t.clips.length === 0) && (
                <span className="muted">Arrastra medios aquí desde la biblioteca o el explorador de archivos</span>
              )}
            </div>
          </div>

          {view.markers.map((m) => (
            <div key={m.id} className="tl-marker-line" style={{ left: HEADER_W + m.t * pps, top: RULER_H, height: totalTracksH, ['--mk' as string]: m.color }} />
          ))}
          {snapLine !== null && <div className="tl-snap-line" style={{ left: HEADER_W + snapLine * pps }} />}
          {dropAt && <div className="tl-drop-line" style={{ left: HEADER_W + dropAt.t * pps }} />}
          {drag?.kind === 'marquee' && (
            <div
              className="tl-marquee"
              style={{
                left: Math.min(drag.x0, drag.x1),
                top: Math.min(drag.y0, drag.y1),
                width: Math.abs(drag.x1 - drag.x0),
                height: Math.abs(drag.y1 - drag.y0)
              }}
            />
          )}
          {trimInfo && (
            <div className="tl-trim-tip" style={{ left: HEADER_W + trimInfo.time * pps, top: RULER_H + 2 }}>
              {formatTimecode(trimInfo.time, fps)}
            </div>
          )}
          <div className="tl-playhead" style={{ left: HEADER_W + time * pps }} />
        </div>
      </div>
      {pick && (
        <svg className="pick-overlay">
          <line x1={pick.x0} y1={pick.y0} x2={pick.x} y2={pick.y} />
          <circle cx={pick.x} cy={pick.y} r={4} />
        </svg>
      )}
    </div>
  )
}
