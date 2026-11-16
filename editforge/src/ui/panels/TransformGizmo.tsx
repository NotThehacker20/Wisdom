import { useRef, useState } from 'react'
import { hitTestLayers, layerGeometry } from '@/core/layerTransform'
import { invert, transformPoint } from '@/core/mat3'
import { findClip } from '@/core/project'
import { setPropValue } from '@/core/props'
import { frameRound } from '@/core/timeline'
import type { Project } from '@/core/types'
import { usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'

type Mode = 'move' | 'scale' | 'rotate' | 'anchor'

/**
 * Gizmo de transformación sobre el visor. Trabaja directamente en píxeles de
 * proyecto (viewBox centrado), así que los tamaños de los tiradores se
 * dividen por la escala de pantalla `k`.
 *
 * - Arrastrar dentro: mover (Mayús: solo un eje)
 * - Esquinas: escala uniforme respecto al anclaje
 * - Tirador superior: rotar (Mayús: pasos de 15°)
 * - Alt+arrastrar: mover el punto de anclaje sin desplazar la capa (como «pan behind» en AE)
 * Si la propiedad está animada, se crea/actualiza el keyframe en el cabezal.
 */
export function TransformGizmo({ width, height }: { width: number; height: number }) {
  const project = useProject((s) => s.project)
  const time = usePlayback((s) => s.time)
  const playing = usePlayback((s) => s.playing)
  const selectedClipIds = useUi((s) => s.selectedClipIds)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Mode | null>(null)
  const { width: W, height: H } = project.settings
  const k = width / W
  const t = frameRound(time, project.settings.fps)

  const found = selectedClipIds.length === 1 ? findClip(project, selectedClipIds[0]) : undefined
  const clip = found && t >= found.clip.start && t < found.clip.start + found.clip.duration && found.clip.kind !== 'audio' ? found.clip : undefined
  const locked = found?.track.locked

  const toProject = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect()
    return [(e.clientX - r.left) / k - W / 2, (e.clientY - r.top) / k - H / 2]
  }

  const startGesture = (e: React.PointerEvent, mode: Mode, clipId: string) => {
    e.stopPropagation()
    e.preventDefault()
    const proj = useProject.getState().project
    const c = findClip(proj, clipId)!.clip
    const local = t - c.start
    const g = layerGeometry(proj, c, local)
    const r0 = g.resolved
    const p0 = toProject(e)
    // Con padre, la posición vive en el espacio del padre: trabajamos en pantalla y convertimos.
    const invParent = invert(g.parent)
    const invLocal = invert(g.local)
    const pos = transformPoint(g.parent, r0.x, r0.y) // anclaje en coordenadas de proyecto
    const ang0 = Math.atan2(p0[1] - pos[1], p0[0] - pos[0])
    const dist0 = Math.max(1e-3, Math.hypot(p0[0] - pos[0], p0[1] - pos[1]))
    const tr = useProject.getState().beginTransient()
    let moved = false

    const set = (p: Project, path: string, v: number) => setPropValue(p, clipId, path, local, v)
    const move = (ev: PointerEvent) => {
      const p = toProject(ev)
      if (!moved && Math.hypot(p[0] - p0[0], p[1] - p0[1]) * k < 2) return
      moved = true
      if (mode === 'move') {
        let dx = p[0] - p0[0]
        let dy = p[1] - p0[1]
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        const [nx, ny] = transformPoint(invParent, pos[0] + dx, pos[1] + dy)
        tr.update((q) => set(set(q, 'transform.x', nx), 'transform.y', ny))
      } else if (mode === 'scale') {
        const d = Math.hypot(p[0] - pos[0], p[1] - pos[1])
        tr.update((q) => set(q, 'transform.scale', Math.max(0, r0.scale * 100 * (d / dist0))))
      } else if (mode === 'rotate') {
        let deg = r0.rotation + ((Math.atan2(p[1] - pos[1], p[0] - pos[0]) - ang0) * 180) / Math.PI
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15
        tr.update((q) => set(q, 'transform.rotation', deg))
      } else {
        // El nuevo anclaje es el punto de la capa bajo el puntero, y la posición pasa a ese
        // mismo punto (en el espacio del padre), así la capa no se mueve.
        const [ax, ay] = transformPoint(invLocal, p[0], p[1])
        const [nx, ny] = transformPoint(invParent, p[0], p[1])
        tr.update((q) => set(set(set(set(q, 'transform.anchorX', ax), 'transform.anchorY', ay), 'transform.x', nx), 'transform.y', ny))
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const labels: Record<Mode, string> = { move: 'Mover capa', scale: 'Escalar capa', rotate: 'Rotar capa', anchor: 'Mover anclaje' }
      tr.end(moved ? labels[mode] : null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Clic en el visor: selecciona la capa visible más alta bajo el puntero. */
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || playing) return
    const [px, py] = toProject(e)
    const proj = useProject.getState().project
    const hit = hitTestLayers(proj, t, px, py)
    if (!hit) {
      useUi.getState().selectClips([])
      return
    }
    useUi.getState().selectClips([hit])
    startGesture(e, e.altKey ? 'anchor' : 'move', hit)
  }

  let overlay: React.ReactNode = null
  if (clip && !playing) {
    const g = layerGeometry(project, clip, t - clip.start)
    const corners = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5]
    ].map(([u, v]) => transformPoint(g.matrix, u, v))
    const pts = corners.map((c) => c.join(',')).join(' ')
    const [ax, ay] = transformPoint(g.parent, g.resolved.x, g.resolved.y)
    const parentClip = clip.parentId ? findClip(project, clip.parentId)?.clip : undefined
    const pg = parentClip ? layerGeometry(project, parentClip, t - parentClip.start) : null
    const parentPos = pg ? transformPoint(pg.parent, pg.resolved.x, pg.resolved.y) : null
    const topMid = transformPoint(g.matrix, 0, -0.5)
    // Tirador de rotación: 28 px de pantalla por encima del borde superior, en la dirección de la capa.
    const up = transformPoint(g.local, 0, -1)
    const origin = transformPoint(g.local, 0, 0)
    let dirX = up[0] - origin[0]
    let dirY = up[1] - origin[1]
    const len = Math.hypot(dirX, dirY) || 1
    dirX /= len
    dirY /= len
    let rotH: [number, number] = [topMid[0] + (dirX * 28) / k, topMid[1] + (dirY * 28) / k]
    // Si queda fuera del lienzo (capa a pantalla completa), lo ponemos hacia dentro para que se pueda agarrar.
    const margin = 4 / k
    if (Math.abs(rotH[0]) > W / 2 - margin || Math.abs(rotH[1]) > H / 2 - margin) {
      rotH = [topMid[0] - (dirX * 28) / k, topMid[1] - (dirY * 28) / k]
    }
    const hs = 5 / k
    const interactive = !locked
    overlay = (
      <g className={`gizmo ${clip.kind === 'null' ? 'null' : ''}`}>
        {parentPos && parentClip && (
          <g className="gz-parent">
            <line x1={ax} y1={ay} x2={parentPos[0]} y2={parentPos[1]} style={{ strokeWidth: 1.5 / k, strokeDasharray: `${6 / k} ${4 / k}` }} />
            <rect x={parentPos[0] - hs} y={parentPos[1] - hs} width={hs * 2} height={hs * 2} transform={`rotate(45 ${parentPos[0]} ${parentPos[1]})`} style={{ strokeWidth: 1.5 / k }} />
            <text x={parentPos[0] + hs * 2} y={parentPos[1] - hs * 2} style={{ fontSize: 11 / k }}>
              {parentClip.name}
            </text>
          </g>
        )}
        <polygon
          points={pts}
          className="gz-box"
          onPointerDown={interactive ? (e) => startGesture(e, e.altKey ? 'anchor' : 'move', clip.id) : undefined}
          onPointerEnter={() => setHover('move')}
          onPointerLeave={() => setHover(null)}
          style={{ strokeWidth: 1.5 / k, cursor: interactive ? 'move' : 'default' }}
        />
        {interactive && (
          <>
            <line x1={topMid[0]} y1={topMid[1]} x2={rotH[0]} y2={rotH[1]} className="gz-line" style={{ strokeWidth: 1 / k }} />
            <circle cx={rotH[0]} cy={rotH[1]} r={hs * 1.1} className="gz-rot" style={{ strokeWidth: 1.5 / k }} onPointerDown={(e) => startGesture(e, 'rotate', clip.id)}>
              <title>Rotar (Mayús: pasos de 15°)</title>
            </circle>
            {corners.map(([x, y], i) => (
              <rect key={i} x={x - hs} y={y - hs} width={hs * 2} height={hs * 2} className="gz-handle" style={{ strokeWidth: 1.5 / k }} onPointerDown={(e) => startGesture(e, 'scale', clip.id)}>
                <title>Escalar</title>
              </rect>
            ))}
            <g className="gz-anchor" style={{ strokeWidth: 1.5 / k }}>
              <circle cx={ax} cy={ay} r={hs * 1.2} />
              <line x1={ax - hs * 2.4} x2={ax + hs * 2.4} y1={ay} y2={ay} />
              <line x1={ax} x2={ax} y1={ay - hs * 2.4} y2={ay + hs * 2.4} />
            </g>
          </>
        )}
      </g>
    )
  }

  return (
    <svg
      ref={svgRef}
      className={`gizmo-layer ${hover ? `hover-${hover}` : ''}`}
      width={width}
      height={height}
      viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`}
      onPointerDown={onBackgroundDown}
    >
      {overlay}
    </svg>
  )
}
