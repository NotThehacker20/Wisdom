import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { projectDuration } from '@/core/project'
import { formatTimecode } from '@/core/time'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'

const QUALITIES: Array<[string, number]> = [
  ['Completa', 1],
  ['1/2', 0.5],
  ['1/4', 0.25]
]

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const settings = useProject((s) => s.project.settings)
  const duration = useProject((s) => projectDuration(s.project))
  const { time, playing } = usePlayback()
  const { quality, setQuality } = useUi()
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [fps, setFps] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    try {
      playback.attach(canvas)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    return () => playback.detach()
  }, [])

  // Encaja el lienzo dentro del escenario manteniendo la proporción del proyecto.
  useLayoutEffect(() => {
    const stage = stageRef.current!
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect()
      const k = Math.min(r.width / settings.width, r.height / settings.height)
      setBox({ w: Math.floor(settings.width * k), h: Math.floor(settings.height * k) })
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [settings.width, settings.height])

  useEffect(() => {
    const id = setInterval(() => setFps(playback.measuredFps), 500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="preview">
      <div className="preview-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="preview-canvas" style={{ width: box.w, height: box.h }} />
        {error && <div className="preview-error">{error}</div>}
      </div>
      <div className="transport">
        <span className="timecode">{formatTimecode(time, settings.fps)}</span>
        <span className="muted timecode-total">/ {formatTimecode(duration, settings.fps)}</span>
        <div className="transport-buttons">
          <button className="icon-btn" title="Inicio (Home)" onClick={() => playback.seek(0)}>
            ⏮
          </button>
          <button className="icon-btn" title="Fotograma anterior (←)" onClick={() => playback.step(-1)}>
            ◀
          </button>
          <button className="icon-btn play" title="Reproducir / pausa (Espacio)" onClick={() => playback.toggle()}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="icon-btn" title="Fotograma siguiente (→)" onClick={() => playback.step(1)}>
            ▶
          </button>
          <button className="icon-btn" title="Final (End)" onClick={() => playback.seek(duration)}>
            ⏭
          </button>
        </div>
        <div className="transport-right">
          {playing && <span className={`fps ${fps < settings.fps - 2 ? 'warn' : ''}`}>{fps} fps</span>}
          <select value={quality} onChange={(e) => setQuality(parseFloat(e.target.value))} title="Calidad de previsualización">
            {QUALITIES.map(([label, q]) => (
              <option key={q} value={q}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
