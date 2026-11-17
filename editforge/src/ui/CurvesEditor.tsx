import { useRef, useState } from 'react'
import { CURVE_PRESETS, DEFAULT_CURVES, parseCurves, sampleCurve, type CurveChannel, type CurvePoint, type Curves } from '@/core/curves'

const SIZE = 200
const COLORS: Record<CurveChannel, string> = { m: '#e5e7eb', r: '#f87171', g: '#4ade80', b: '#60a5fa' }
const LABELS: Record<CurveChannel, string> = { m: 'RGB', r: 'R', g: 'G', b: 'B' }

/**
 * Editor de curvas: clic en vacío añade un punto, arrastrar lo mueve,
 * doble clic (o clic derecho) lo quita. Los extremos solo se mueven en vertical.
 */
export function CurvesEditor({ value, onChange }: { value: string; onChange: (v: string, final: boolean) => void }) {
  const curves = parseCurves(value)
  const [ch, setCh] = useState<CurveChannel>('m')
  const svg = useRef<SVGSVGElement>(null)
  const pts = curves[ch]

  const emit = (c: Curves, final: boolean) => onChange(JSON.stringify(c), final)
  const setPts = (p: CurvePoint[], final: boolean) => emit({ ...curves, [ch]: p }, final)
  const toUnit = (e: { clientX: number; clientY: number }): CurvePoint => {
    const r = svg.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))]
  }

  const drag = (e: React.PointerEvent, index: number, start: CurvePoint[]) => {
    e.preventDefault()
    e.stopPropagation()
    let cur = start
    const move = (ev: PointerEvent) => {
      const [x, y] = toUnit(ev)
      const next = cur.map((p) => [...p] as CurvePoint)
      const lo = index === 0 ? 0 : next[index - 1][0] + 0.01
      const hi = index === next.length - 1 ? 1 : next[index + 1][0] - 0.01
      next[index] = [index === 0 ? next[0][0] : index === next.length - 1 ? next[index][0] : Math.min(hi, Math.max(lo, x)), y]
      cur = next
      setPts(next, false)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPts(cur, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onBackground = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const [x] = toUnit(e)
    const yOnCurve = sampleAt(pts, x)
    const next = [...pts, [x, yOnCurve] as CurvePoint].sort((a, b) => a[0] - b[0])
    const index = next.findIndex((p) => p[0] === x)
    setPts(next, false)
    drag(e, index, next)
  }

  const remove = (i: number) => {
    if (i === 0 || i === pts.length - 1) return
    setPts(
      pts.filter((_, k) => k !== i),
      true
    )
  }

  const path = (c: CurvePoint[]) => {
    const s = sampleCurve(c, 64)
    return Array.from(s, (v, i) => `${i ? 'L' : 'M'}${((i / 63) * SIZE).toFixed(1)},${((1 - v) * SIZE).toFixed(1)}`).join('')
  }

  return (
    <div className="curves-editor">
      <div className="curves-tabs">
        {(['m', 'r', 'g', 'b'] as CurveChannel[]).map((c) => (
          <button key={c} className={`curves-tab ${c === ch ? 'on' : ''}`} style={{ color: COLORS[c] }} onClick={() => setCh(c)}>
            {LABELS[c]}
          </button>
        ))}
        <select
          value=""
          title="Presets de curva"
          onChange={(e) => {
            const p = CURVE_PRESETS.find((x) => x.name === e.target.value)
            if (p) emit({ ...DEFAULT_CURVES, ...p.curves }, true)
          }}
        >
          <option value="">Presets</option>
          {CURVE_PRESETS.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
        </select>
        <button className="fx-icon" title="Restablecer este canal" onClick={() => setPts(DEFAULT_CURVES[ch], true)}>
          ↺
        </button>
      </div>
      <svg ref={svg} className="curves-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} onPointerDown={onBackground} onContextMenu={(e) => e.preventDefault()}>
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} className="curves-grid">
            <line x1={g * SIZE} x2={g * SIZE} y1={0} y2={SIZE} />
            <line y1={g * SIZE} y2={g * SIZE} x1={0} x2={SIZE} />
          </g>
        ))}
        <line className="curves-diag" x1={0} y1={SIZE} x2={SIZE} y2={0} />
        {(['m', 'r', 'g', 'b'] as CurveChannel[])
          .filter((c) => c !== ch)
          .map((c) => (
            <path key={c} d={path(curves[c])} stroke={COLORS[c]} className="curves-path dim" />
          ))}
        <path d={path(pts)} stroke={COLORS[ch]} className="curves-path" />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x * SIZE}
            cy={(1 - y) * SIZE}
            r={5}
            className="curves-pt"
            style={{ stroke: COLORS[ch] }}
            onPointerDown={(e) => (e.button === 2 ? (e.stopPropagation(), remove(i)) : drag(e, i, pts))}
            onDoubleClick={(e) => {
              e.stopPropagation()
              remove(i)
            }}
          />
        ))}
      </svg>
    </div>
  )
}

function sampleAt(pts: CurvePoint[], x: number): number {
  const s = sampleCurve(pts, 256)
  return s[Math.round(x * 255)]
}
