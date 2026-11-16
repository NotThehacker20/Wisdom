import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_IN, DEFAULT_OUT, evalProp } from '@/core/anim'
import { EASING_MENU } from '@/core/easing'
import { findClip } from '@/core/project'
import {
  clipPropPaths, getProp, keyRefId, moveKeys, propDefFor, setKeyHandle, toggleKeyframes, type KeyRef, type PropPath
} from '@/core/props'
import { frameRound } from '@/core/timeline'
import type { AnimProp, Clip, Keyframe } from '@/core/types'
import { easeSelectedKeys } from '@/state/actions'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'

const LIST_W = 190
const RULER_H = 22
const PAD_Y = 18
const KEY_R = 5

interface View {
  t0: number
  t1: number
  /** Rango de valores (o 0..1 si está normalizado). */
  v0: number
  v1: number
}

type Gesture =
  | { kind: 'keys'; x0: number; y0: number; started: boolean; axis: 'free' | 'x' | 'y' }
  | { kind: 'handle'; ref: KeyRef; side: 'in' | 'out' }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: 'scrub' }
  | { kind: 'pan'; x0: number; y0: number; view: View }

/** Rango de valores de una propiedad en un intervalo (muestreado + keyframes). */
function valueRange(prop: AnimProp, t0: number, t1: number): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  const n = 120
  for (let i = 0; i <= n; i++) {
    const v = evalProp(prop, t0 + ((t1 - t0) * i) / n)
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  for (const k of prop.keyframes ?? []) {
    lo = Math.min(lo, k.v)
    hi = Math.max(hi, k.v)
  }
  if (!isFinite(lo)) return [0, 1]
  if (hi - lo < 1e-6) return [lo - 1, hi + 1]
  return [lo, hi]
}

function niceStep(range: number, px: number, minPx: number): number {
  const raw = (range * minPx) / Math.max(1, px)
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow
  return 10 * pow
}

export function GraphEditor() {
  const project = useProject((s) => s.project)
  const time = usePlayback((s) => s.time)
  const { selectedClipIds, graphPaths, setGraphPaths, selectedKeys, selectKeys, setActiveProp, activeProp } = useUi()
  const clip: Clip | undefined = selectedClipIds.length === 1 ? findClip(project, selectedClipIds[0])?.clip : undefined

  if (!clip || clipPropPaths(clip).length === 0) {
    return (
      <div className="graph-editor empty">
        <div className="panel-note">Selecciona un clip para editar sus curvas. Las propiedades animadas aparecen marcadas con ◆.</div>
      </div>
    )
  }

  const paths = clipPropPaths(clip)
  const visible = graphPaths.filter((p) => paths.includes(p))
  return (
    <div className="graph-editor">
      <div className="ge-list" style={{ width: LIST_W }}>
        {paths.map((path) => {
          const def = propDefFor(clip, path)!
          const prop = getProp(clip, path)!
          const on = visible.includes(path)
          return (
            <div
              key={path}
              className={`ge-prop ${on ? 'on' : ''} ${activeProp?.clipId === clip.id && activeProp.path === path ? 'active' : ''}`}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  setGraphPaths(on ? visible.filter((p) => p !== path) : [...visible, path])
                  useUi.setState({ activeProp: { clipId: clip.id, path } })
                } else setActiveProp(clip.id, path)
              }}
              title="Clic: ver esta curva · Ctrl+clic: añadir/quitar"
            >
              <span className="ge-dot" style={{ background: def.color, opacity: on ? 1 : 0.3 }} />
              <span className="ge-label">{def.label}</span>
              {prop.keyframes?.length ? <span className="ge-anim">◆ {prop.keyframes.length}</span> : null}
            </div>
          )
        })}
      </div>
      <GraphCanvas clip={clip} paths={visible} time={time} selectedKeys={selectedKeys} selectKeys={selectKeys} />
    </div>
  )
}

interface CanvasProps {
  clip: Clip
  paths: PropPath[]
  time: number
  selectedKeys: KeyRef[]
  selectKeys: (k: KeyRef[], mode?: 'replace' | 'toggle' | 'add') => void
}

function GraphCanvas({ clip, paths, time, selectedKeys, selectKeys }: CanvasProps) {
  const fps = useProject((s) => s.project.settings.fps)
  const apply = useProject((s) => s.apply)
  const beginTransient = useProject((s) => s.beginTransient)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 200 })
  const [normalize, setNormalize] = useState(true)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const norm = normalize && paths.length > 1

  // Rangos de valor por propiedad (para normalizar y para «ajustar»).
  const fitTimes = useMemo((): [number, number] => {
    let lo = 0
    let hi = clip.duration
    for (const p of paths) for (const k of getProp(clip, p)?.keyframes ?? []) {
      lo = Math.min(lo, k.t)
      hi = Math.max(hi, k.t)
    }
    const pad = (hi - lo) * 0.05 || 0.5
    return [lo - pad, hi + pad]
    // Se recalcula al cambiar de clip o de propiedades visibles, no en cada edición.
  }, [clip.id, paths.join(',')])

  const ranges = useMemo(() => {
    const r: Record<string, [number, number]> = {}
    for (const p of paths) r[p] = valueRange(getProp(clip, p)!, fitTimes[0], fitTimes[1])
    return r
  }, [clip.id, paths.join(','), fitTimes, gesture === null])

  const fitView = (): View => {
    if (norm) return { t0: fitTimes[0], t1: fitTimes[1], v0: -0.1, v1: 1.1 }
    let lo = Infinity
    let hi = -Infinity
    for (const p of paths) {
      lo = Math.min(lo, ranges[p][0])
      hi = Math.max(hi, ranges[p][1])
    }
    if (!isFinite(lo)) [lo, hi] = [0, 1]
    const pad = (hi - lo) * 0.1
    return { t0: fitTimes[0], t1: fitTimes[1], v0: lo - pad, v1: hi + pad }
  }
  const [view, setView] = useState<View>(fitView)

  useLayoutEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── conversiones ──
  const plotH = Math.max(20, size.h - RULER_H - PAD_Y * 2)
  const xOf = (t: number) => ((t - view.t0) / (view.t1 - view.t0)) * size.w
  const tOf = (x: number) => view.t0 + (x / size.w) * (view.t1 - view.t0)
  const toN = (path: PropPath, v: number) => {
    if (!norm) return v
    const [lo, hi] = ranges[path] ?? [0, 1]
    return (v - lo) / (hi - lo || 1)
  }
  const fromN = (path: PropPath, n: number) => {
    if (!norm) return n
    const [lo, hi] = ranges[path] ?? [0, 1]
    return lo + n * (hi - lo || 1)
  }
  const yOfN = (n: number) => RULER_H + PAD_Y + (1 - (n - view.v0) / (view.v1 - view.v0)) * plotH
  const nOfY = (y: number) => view.v0 + (1 - (y - RULER_H - PAD_Y) / plotH) * (view.v1 - view.v0)
  const yOf = (path: PropPath, v: number) => yOfN(toN(path, v))
  /** Unidades de valor (de la propiedad) por píxel vertical. */
  const valuePerPx = (path: PropPath) => {
    const nPerPx = (view.v1 - view.v0) / plotH
    if (!norm) return nPerPx
    const [lo, hi] = ranges[path] ?? [0, 1]
    return nPerPx * (hi - lo || 1)
  }

  const local = frameRound(time, fps) - clip.start
  const selectedSet = useMemo(() => new Set(selectedKeys.map(keyRefId)), [selectedKeys])

  // ── gestos ──
  const updateGesture = (g: Gesture | null) => {
    gestureRef.current = g
    setGesture(g)
  }
  const pointIn = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const run = (g: Gesture, onMove: (e: PointerEvent, g: Gesture) => void, onEnd: (e: PointerEvent, g: Gesture) => void) => {
    updateGesture(g)
    const move = (e: PointerEvent) => onMove(e, gestureRef.current!)
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onEnd(e, gestureRef.current!)
      updateGesture(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startKeysDrag = (e: React.PointerEvent, refs: KeyRef[]) => {
    const tr = beginTransient()
    const p0 = pointIn(e)
    run(
      { kind: 'keys', x0: p0.x, y0: p0.y, started: false, axis: 'free' },
      (ev, g) => {
        if (g.kind !== 'keys') return
        const p = pointIn(ev)
        let dx = p.x - g.x0
        let dy = p.y - g.y0
        if (!g.started && Math.hypot(dx, dy) < 3) return
        let axis = g.axis
        if (ev.shiftKey && axis === 'free') axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        if (!ev.shiftKey) axis = 'free'
        if (axis === 'x') dy = 0
        if (axis === 'y') dx = 0
        const dt = (dx / size.w) * (view.t1 - view.t0)
        const dv: Record<string, number> = {}
        for (const r of refs) dv[r.path] = -dy * valuePerPx(r.path)
        tr.update((proj) => moveKeys(proj, refs, dt, dv))
        updateGesture({ ...g, started: true, axis })
      },
      (_ev, g) => tr.end(g.kind === 'keys' && g.started ? 'Mover keyframes' : null)
    )
  }

  const onKeyDown = (e: React.PointerEvent, ref: KeyRef) => {
    if (e.button !== 0) return
    e.stopPropagation()
    let refs = useUi.getState().selectedKeys
    const id = keyRefId(ref)
    if (e.ctrlKey || e.metaKey) {
      selectKeys([ref], 'toggle')
      return
    }
    if (e.shiftKey) selectKeys([ref], 'add')
    else if (!refs.some((r) => keyRefId(r) === id)) selectKeys([ref])
    refs = useUi.getState().selectedKeys
    useUi.setState({ activeProp: { clipId: ref.clipId, path: ref.path } })
    startKeysDrag(e, refs)
  }

  const onHandleDown = (e: React.PointerEvent, ref: KeyRef, side: 'in' | 'out', seg: { k0: Keyframe; k1: Keyframe }) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const tr = beginTransient()
    run(
      { kind: 'handle', ref, side },
      (ev) => {
        const p = pointIn(ev)
        const t = tOf(p.x)
        const v = fromN(ref.path, nOfY(p.y))
        const span = seg.k1.t - seg.k0.t || 1
        const dvv = seg.k1.v - seg.k0.v
        const hx = (t - seg.k0.t) / span
        // Si el tramo es plano, la altura de la tangente no tiene efecto: la dejamos donde estaba.
        const hy = Math.abs(dvv) < 1e-9 ? (side === 'out' ? (seg.k0.outY ?? DEFAULT_OUT.y) : (seg.k1.inY ?? DEFAULT_IN.y)) : (v - seg.k0.v) / dvv
        tr.update((proj) => setKeyHandle(proj, ref, side, hx, hy))
      },
      () => tr.end('Editar curva')
    )
  }

  const onBgDown = (e: React.PointerEvent) => {
    const p = pointIn(e)
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault()
      run(
        { kind: 'pan', x0: p.x, y0: p.y, view },
        (ev, g) => {
          if (g.kind !== 'pan') return
          const q = pointIn(ev)
          const dt = ((q.x - g.x0) / size.w) * (g.view.t1 - g.view.t0)
          const dn = ((q.y - g.y0) / plotH) * (g.view.v1 - g.view.v0)
          setView({ t0: g.view.t0 - dt, t1: g.view.t1 - dt, v0: g.view.v0 + dn, v1: g.view.v1 + dn })
        },
        () => undefined
      )
      return
    }
    if (e.button !== 0) return
    if (p.y < RULER_H) {
      const scrub = (x: number) => playback.scrub(Math.max(0, clip.start + tOf(x)))
      scrub(p.x)
      run({ kind: 'scrub' }, (ev) => scrub(pointIn(ev).x), () => undefined)
      return
    }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    if (!additive) selectKeys([])
    run(
      { kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive },
      (ev, g) => {
        if (g.kind !== 'marquee') return
        const q = pointIn(ev)
        updateGesture({ ...g, x1: q.x, y1: q.y })
      },
      (_ev, g) => {
        if (g.kind !== 'marquee') return
        const [x0, x1] = [Math.min(g.x0, g.x1), Math.max(g.x0, g.x1)]
        const [y0, y1] = [Math.min(g.y0, g.y1), Math.max(g.y0, g.y1)]
        if (x1 - x0 < 3 && y1 - y0 < 3) return
        const hits: KeyRef[] = []
        for (const path of paths) {
          for (const k of getProp(clip, path)?.keyframes ?? []) {
            const x = xOf(k.t)
            const y = yOf(path, k.v)
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) hits.push({ clipId: clip.id, path, id: k.id })
          }
        }
        selectKeys(hits, g.additive ? 'add' : 'replace')
      }
    )
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = pointIn(e)
    if (p.y < RULER_H) return
    // Añade un keyframe en la curva más cercana al puntero.
    const t = frameRound(tOf(p.x), fps)
    let best: { path: string; d: number } | null = null
    for (const path of paths) {
      const d = Math.abs(yOf(path, evalProp(getProp(clip, path)!, t)) - p.y)
      if (!best || d < best.d) best = { path, d }
    }
    if (best && best.d < 30) {
      const path = best.path
      apply('Añadir keyframe', (proj) => toggleKeyframes(proj, clip.id, [path], t))
    }
  }

  // Rueda: zoom de tiempo (Mayús: de valor) alrededor del puntero.
  useEffect(() => {
    const el = wrapRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      const k = e.deltaY < 0 ? 1 / 1.15 : 1.15
      setView((v) => {
        if (e.shiftKey) {
          const n = v.v0 + (1 - (y - RULER_H - PAD_Y) / plotH) * (v.v1 - v.v0)
          return { ...v, v0: n - (n - v.v0) * k, v1: n + (v.v1 - n) * k }
        }
        const t = v.t0 + (x / size.w) * (v.t1 - v.t0)
        return { ...v, t0: t - (t - v.t0) * k, t1: t + (v.t1 - t) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [size.w, plotH])

  // ── dibujo ──
  const tStep = niceStep(view.t1 - view.t0, size.w, 70)
  const tTicks: number[] = []
  for (let t = Math.ceil(view.t0 / tStep) * tStep; t <= view.t1; t += tStep) tTicks.push(t)
  const vStep = niceStep(view.v1 - view.v0, plotH, 28)
  const vTicks: number[] = []
  for (let v = Math.ceil(view.v0 / vStep) * vStep; v <= view.v1; v += vStep) vTicks.push(v)

  const curves = paths.map((path) => {
    const prop = getProp(clip, path)!
    const n = Math.max(2, Math.ceil(size.w / 2))
    let d = ''
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * size.w
      const y = yOf(path, evalProp(prop, tOf(x)))
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    }
    return { path, d, color: propDefFor(clip, path)!.color, keys: prop.keyframes ?? [] }
  })

  const selCount = selectedKeys.length
  return (
    <div className="ge-main">
      <div className="panel-toolbar ge-toolbar">
        {EASING_MENU.map((m) => (
          <button key={m.id} className="tool" disabled={!selCount} onClick={() => easeSelectedKeys(m.id)} title={`${m.label} en el tramo que sale de los keyframes seleccionados`}>
            {m.label}
          </button>
        ))}
        <div className="tool-spacer" />
        {paths.length > 1 && (
          <button className={`tool toggle ${normalize ? 'on' : ''}`} onClick={() => setNormalize(!normalize)} title="Cada curva en su propia escala">
            Normalizar
          </button>
        )}
        <button className="tool" onClick={() => setView(fitView())} title="Ajustar la vista">
          ⤢
        </button>
      </div>
      <div className="ge-canvas" ref={wrapRef} onPointerDown={onBgDown} onDoubleClick={onDoubleClick} onContextMenu={(e) => e.preventDefault()}>
        <svg width={size.w} height={size.h}>
          {/* zona del clip */}
          <rect x={xOf(0)} y={RULER_H} width={Math.max(0, xOf(clip.duration) - xOf(0))} height={size.h - RULER_H} className="ge-cliprange" />
          {!norm &&
            vTicks.map((v) => (
              <g key={v}>
                <line x1={0} x2={size.w} y1={yOfN(v)} y2={yOfN(v)} className="ge-grid" />
                <text x={4} y={yOfN(v) - 3} className="ge-axis">
                  {+v.toFixed(3)}
                </text>
              </g>
            ))}
          <rect x={0} y={0} width={size.w} height={RULER_H} className="ge-ruler" />
          {tTicks.map((t) => (
            <g key={t}>
              <line x1={xOf(t)} x2={xOf(t)} y1={RULER_H - 6} y2={size.h} className="ge-grid v" />
              <text x={xOf(t) + 3} y={13} className="ge-axis">
                {tStep < 1 ? `${+t.toFixed(2)}s` : `${+t.toFixed(0)}s`}
              </text>
            </g>
          ))}

          {curves.map((c) => (
            <path key={c.path} d={c.d} stroke={c.color} className="ge-curve" />
          ))}

          {/* tangentes de los keyframes seleccionados */}
          {curves.map((c) =>
            c.keys.map((k, i) => {
              const ref = { clipId: clip.id, path: c.path, id: k.id }
              if (!selectedSet.has(keyRefId(ref))) return null
              const out: React.ReactNode[] = []
              const next = c.keys[i + 1]
              const prev = c.keys[i - 1]
              if (next && k.interp === 'bezier' && (k.ease ?? 'custom') === 'custom') {
                const hx = xOf(k.t + (k.outX ?? DEFAULT_OUT.x) * (next.t - k.t))
                const hy = yOf(c.path, k.v + (k.outY ?? DEFAULT_OUT.y) * (next.v - k.v))
                out.push(
                  <g key={`${k.id}o`}>
                    <line x1={xOf(k.t)} y1={yOf(c.path, k.v)} x2={hx} y2={hy} className="ge-hline" />
                    <circle cx={hx} cy={hy} r={4.5} className="ge-handle" onPointerDown={(e) => onHandleDown(e, ref, 'out', { k0: k, k1: next })} />
                  </g>
                )
              }
              if (prev && prev.interp === 'bezier' && (prev.ease ?? 'custom') === 'custom') {
                const hx = xOf(prev.t + (k.inX ?? DEFAULT_IN.x) * (k.t - prev.t))
                const hy = yOf(c.path, prev.v + (k.inY ?? DEFAULT_IN.y) * (k.v - prev.v))
                out.push(
                  <g key={`${k.id}i`}>
                    <line x1={xOf(k.t)} y1={yOf(c.path, k.v)} x2={hx} y2={hy} className="ge-hline" />
                    <circle cx={hx} cy={hy} r={4.5} className="ge-handle" onPointerDown={(e) => onHandleDown(e, ref, 'in', { k0: prev, k1: k })} />
                  </g>
                )
              }
              return out
            })
          )}

          {curves.map((c) =>
            c.keys.map((k) => {
              const ref = { clipId: clip.id, path: c.path, id: k.id }
              const sel = selectedSet.has(keyRefId(ref))
              const x = xOf(k.t)
              const y = yOf(c.path, k.v)
              const r = KEY_R + (sel ? 1 : 0)
              return (
                <polygon
                  key={k.id}
                  points={k.interp === 'hold' ? `${x - r},${y - r} ${x + r},${y - r} ${x + r},${y + r} ${x - r},${y + r}` : `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
                  className={`ge-key ${sel ? 'sel' : ''}`}
                  style={{ ['--kc' as string]: c.color }}
                  onPointerDown={(e) => onKeyDown(e, ref)}
                >
                  <title>{`${propDefFor(clip, c.path)?.label}: ${+k.v.toFixed(2)} @ ${+k.t.toFixed(3)} s · ${k.interp === 'bezier' ? (k.ease === 'custom' || !k.ease ? 'bézier' : k.ease) : k.interp}`}</title>
                </polygon>
              )
            })
          )}

          <line x1={xOf(local)} x2={xOf(local)} y1={0} y2={size.h} className="ge-playhead" />
          {gesture?.kind === 'marquee' && (
            <rect
              x={Math.min(gesture.x0, gesture.x1)}
              y={Math.min(gesture.y0, gesture.y1)}
              width={Math.abs(gesture.x1 - gesture.x0)}
              height={Math.abs(gesture.y1 - gesture.y0)}
              className="ge-marquee"
            />
          )}
        </svg>
        {curves.every((c) => c.keys.length === 0) && (
          <div className="ge-hint">Sin keyframes: pulsa ◆ en el inspector, Alt+K o doble clic sobre la curva para crear uno.</div>
        )}
      </div>
    </div>
  )
}
