import { useEffect, useRef } from 'react'
import { projectDuration } from '@/core/project'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'

const HEADER_W = 140

function pickStep(pxPerSec: number): number {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
  return steps.find((s) => s * pxPerSec >= 70) ?? 600
}

/**
 * Timeline básica (fase 1): pistas, clips, regla y cabezal con scrubbing.
 * Cortar/mover/snap/ripple llegan en la fase 2.
 */
export function Timeline() {
  const project = useProject((s) => s.project)
  const time = usePlayback((s) => s.time)
  const { timelineZoom: pps, setTimelineZoom, selectedClipId, selectClip } = useUi()
  const scrollRef = useRef<HTMLDivElement>(null)
  const duration = projectDuration(project)
  const width = Math.max(duration + 10, 30) * pps
  const step = pickStep(pps)

  const timeFromEvent = (e: React.PointerEvent) => {
    const el = scrollRef.current!
    const r = el.getBoundingClientRect()
    return Math.max(0, (e.clientX - r.left + el.scrollLeft - HEADER_W) / pps)
  }

  // Ctrl/Alt + rueda = zoom (listener nativo no pasivo para poder hacer preventDefault).
  useEffect(() => {
    const el = scrollRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.altKey) return
      e.preventDefault()
      const ui = useUi.getState()
      ui.setTimelineZoom(ui.timelineZoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const ticks: number[] = []
  for (let t = 0; t * pps < width; t += step) ticks.push(t)

  return (
    <div className="timeline">
      <div className="panel-toolbar">
        <span className="muted small">Zoom</span>
        <input type="range" min={5} max={800} value={pps} onChange={(e) => setTimelineZoom(Number(e.target.value))} />
      </div>
      <div
        className="tl-scroll"
        ref={scrollRef}
      >
        <div className="tl-content" style={{ width: width + HEADER_W }}>
          <div
            className="tl-ruler"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              playback.pause()
              playback.seek(timeFromEvent(e))
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) playback.seek(timeFromEvent(e))
            }}
          >
            <div className="tl-corner" style={{ width: HEADER_W }} />
            {ticks.map((t) => (
              <div key={t} className="tl-tick" style={{ left: HEADER_W + t * pps }}>
                <span>{t >= 60 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : `${+t.toFixed(2)}s`}</span>
              </div>
            ))}
          </div>
          {project.tracks.map((track) => (
            <div key={track.id} className={`tl-track tl-track-${track.kind}`}>
              <div className="tl-track-header" style={{ width: HEADER_W }}>
                {track.name}
              </div>
              <div className="tl-track-body" onPointerDown={() => selectClip(null)}>
                {track.clips.map((c) => (
                  <div
                    key={c.id}
                    className={`tl-clip tl-clip-${c.kind} ${selectedClipId === c.id ? 'selected' : ''}`}
                    style={{ left: c.start * pps, width: Math.max(2, c.duration * pps) }}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      selectClip(c.id)
                    }}
                    title={c.name}
                  >
                    <span>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="tl-playhead" style={{ left: HEADER_W + time * pps }} />
        </div>
      </div>
    </div>
  )
}
