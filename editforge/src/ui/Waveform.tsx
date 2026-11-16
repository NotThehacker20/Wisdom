import { memo, useEffect, useRef } from 'react'
import { peaksRange, type Peaks } from '@/core/audio/peaks'

interface Props {
  peaks: Peaks
  /** Rango del medio (s) que cubre el clip. */
  from: number
  to: number
  /** Ancho en píxeles del clip en la timeline. */
  width: number
  height: number
  color: string
  /** Escala de amplitud (volumen del clip). */
  gain?: number
}

/** Forma de onda (mín/máx por columna) dibujada en un canvas; a zoom extremo se estira para no superar 4096 px. */
export const Waveform = memo(function Waveform({ peaks, from, to, width, height, color, gain = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cols = Math.max(1, Math.min(4096, Math.round(width)))
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = cols
    c.height = Math.max(1, Math.round(height * dpr))
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    const { min, max } = peaksRange(peaks, from, to, cols)
    const mid = c.height / 2
    const k = mid * 0.95 * Math.min(4, gain)
    ctx.fillStyle = color
    for (let x = 0; x < cols; x++) {
      const top = Math.max(0, mid - max[x] * k)
      const bot = Math.min(c.height, mid - min[x] * k)
      ctx.fillRect(x, top, 1, Math.max(1, bot - top))
    }
  }, [peaks, from, to, cols, height, color, gain])
  return <canvas ref={ref} className="waveform" style={{ width: '100%', height }} />
})
