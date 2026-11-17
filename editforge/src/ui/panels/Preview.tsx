import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { projectDuration } from '@/core/project'
import { formatTimecode } from '@/core/time'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { TransformGizmo } from './TransformGizmo'
import { updateSettings, useSettings } from '@/state/settings'
import { useProxies } from '@/state/proxies'

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
  const showStats = useSettings((s) => s.showStats)
  const useProxiesOn = useSettings((s) => s.useProxies)
  const hasPreviewProxies = useProxies((s) => Object.values(s.jobs).some((j) => j.preview?.state === 'ready'))

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
        <div className="preview-box" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className="preview-canvas" style={{ width: box.w, height: box.h }} />
          {box.w > 0 && <TransformGizmo width={box.w} height={box.h} />}
        </div>
        {error && <div className="preview-error">{error}</div>}
        {showStats && <StatsOverlay />}
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
          {hasPreviewProxies && (
            <button
              className={`btn small toggle ${useProxiesOn ? 'on' : ''}`}
              title="Usar proxies de previsualización (la exportación usa siempre los originales)"
              onClick={() => updateSettings({ useProxies: !useProxiesOn })}
            >
              Proxy
            </button>
          )}
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

/** Panel de rendimiento (F2): fps, coste del render y caché de fotogramas. */
function StatsOverlay() {
  const [s, setS] = useState({ fps: 0, ms: 0, cached: false, frames: 0, mb: 0, hit: 0, layers: 0 })
  useEffect(() => {
    const id = setInterval(() => {
      const r = playback.renderer
      if (!r) return
      const c = r.cache
      const total = c.hits + c.misses
      setS({ fps: playback.measuredFps, ms: playback.stats.renderMs, cached: playback.stats.cached, frames: c.size, mb: c.megabytes, hit: total ? (c.hits / total) * 100 : 0, layers: r.lastStats.layers })
    }, 400)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="stats-overlay">
      <div>{s.fps ? `${s.fps} fps` : 'en pausa'}</div>
      <div>{s.cached ? 'desde caché' : `render ${s.ms.toFixed(1)} ms · ${s.layers} capas`}</div>
      <div>
        caché {s.frames} fot. · {s.mb.toFixed(0)} MB · {s.hit.toFixed(0)} % aciertos
      </div>
    </div>
  )
}
