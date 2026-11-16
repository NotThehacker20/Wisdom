/** 00:00:05:12 (hh:mm:ss:ff) */
export function formatTimecode(t: number, fps: number): string {
  const totalFrames = Math.max(0, Math.round(t * fps))
  const f = totalFrames % Math.round(fps)
  const s = Math.floor(totalFrames / Math.round(fps))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`
}

/** 1:05.3 — formato corto para duraciones. */
export function formatDuration(t: number): string {
  if (!isFinite(t)) return '—'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}
