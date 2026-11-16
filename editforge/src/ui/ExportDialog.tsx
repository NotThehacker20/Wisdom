import { keepKeysInField } from './keys'
import { useEffect, useMemo, useState } from 'react'
import { basename } from '@/core/paths'
import { projectDuration } from '@/core/project'
import { formatDuration } from '@/core/time'
import { cancelExport, exportFitSize, runExport, useExport } from '@/state/exporter'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { CODEC_INFO, outputSize, type ExportCodec } from '../../electron/ffmpegArgs'

const RESOLUTIONS: Array<[string, number, number]> = [
  ['1080×1920 · vertical (Reels/TikTok)', 1080, 1920],
  ['1920×1080 · horizontal (1080p)', 1920, 1080],
  ['720×1280 · vertical', 720, 1280],
  ['1280×720 · horizontal (720p)', 1280, 720],
  ['1080×1080 · cuadrado', 1080, 1080],
  ['2160×3840 · vertical 4K', 2160, 3840],
  ['3840×2160 · 4K UHD', 3840, 2160]
]

/** Bitrate recomendado (Mbps) para H.264 a 30 fps según los píxeles. */
const suggestedBitrate = (w: number, h: number, fps: number) => Math.round(((w * h) / (1920 * 1080)) * 16 * Math.sqrt(fps / 30))

export function ExportDialog() {
  const open = useUi((s) => s.exportOpen)
  const project = useProject((s) => s.project)
  const progress = useExport((s) => s.progress)
  const { width: W, height: H, fps: pfps } = project.settings
  const [codec, setCodec] = useState<ExportCodec>('h264')
  const [res, setRes] = useState(`${W}x${H}`)
  const [fps, setFps] = useState(pfps)
  const [bitrate, setBitrate] = useState(suggestedBitrate(W, H, pfps))
  const [audio, setAudio] = useState(true)
  const [ffmpeg, setFfmpeg] = useState<{ ok: boolean; version: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setRes(`${W}x${H}`)
    setFps(pfps)
    void window.editforge?.ffmpegInfo().then(setFfmpeg)
  }, [open, W, H, pfps])

  const [outW, outH] = useMemo(() => {
    const [w, h] = res.split('x').map(Number)
    return outputSize({ codec, width: w, height: h })
  }, [res, codec])
  useEffect(() => setBitrate(suggestedBitrate(outW, outH, fps)), [outW, outH, fps])

  if (!open) return null
  const running = progress.phase === 'audio' || progress.phase === 'video' || progress.phase === 'finishing'
  const finished = progress.phase === 'done' || progress.phase === 'error' || progress.phase === 'cancelled'
  const close = () => {
    if (running) return
    useUi.setState({ exportOpen: false })
    useExport.setState({ progress: { ...progress, phase: 'idle' } })
  }
  const [fw, fh] = exportFitSize(project, outW, outH)
  const letterbox = fw !== outW || fh !== outH
  const duration = projectDuration(project)
  const frames = Math.ceil(duration * fps - 1e-6)
  const info = CODEC_INFO[codec]
  const estMB = codec === 'h264' || codec === 'h265' ? ((bitrate + (audio ? 0.192 : 0)) * duration) / 8 : null

  const start = async () => {
    const override = (window as unknown as { __efExportPath?: string }).__efExportPath
    const name = (project.name || 'edit').replace(/[\\/:*?"<>|]/g, '_')
    const output = override ?? (await window.editforge?.exportFileDialog(name, info.ext))
    if (!output) return
    await runExport({ codec, width: outW, height: outH, fps, bitrate, audio: audio && info.audio, output })
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal export-dialog" role="dialog" aria-label="Exportar">
        <h2>Exportar</h2>
        {progress.phase === 'idle' ? (
          <>
            <div className="field-row">
              <span>Formato</span>
              <select value={codec} onChange={(e) => setCodec(e.target.value as ExportCodec)}>
                {(Object.keys(CODEC_INFO) as ExportCodec[]).map((c) => (
                  <option key={c} value={c}>
                    {CODEC_INFO[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <span>Resolución</span>
              <select value={res} onChange={(e) => setRes(e.target.value)}>
                {!RESOLUTIONS.some(([, w, h]) => `${w}x${h}` === `${W}x${H}`) && <option value={`${W}x${H}`}>{`${W}×${H} · proyecto`}</option>}
                {RESOLUTIONS.map(([label, w, h]) => (
                  <option key={label} value={`${w}x${h}`}>
                    {label}
                    {w === W && h === H ? ' · proyecto' : ''}
                  </option>
                ))}
              </select>
            </div>
            {letterbox && (
              <div className="panel-note warn-text">
                El proyecto es {W}×{H}: se encajará con bandas negras. Para llenar el encuadre cambia el formato del proyecto en el inspector.
              </div>
            )}
            <div className="field-row">
              <span>FPS</span>
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                {[24, 25, 30, 50, 60].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            {(codec === 'h264' || codec === 'h265') && (
              <div className="field-row">
                <span>Bitrate</span>
                <div className="row-tools">
                  <input className="text-input num" type="number" min={1} max={200} step={1} value={bitrate} onChange={(e) => setBitrate(Math.max(1, Number(e.target.value)))} onKeyDown={keepKeysInField} />
                  <span className="muted small">Mbps</span>
                </div>
              </div>
            )}
            <div className="field-row">
              <span>Audio</span>
              <input type="checkbox" checked={audio && info.audio} disabled={!info.audio} onChange={(e) => setAudio(e.target.checked)} />
            </div>
            <div className="muted small export-summary">
              {formatDuration(duration)} · {frames} fotogramas · {outW}×{outH} a {fps} fps{estMB ? ` · ~${estMB.toFixed(0)} MB` : ''}
              {codec === 'png' ? ' · se te pedirá una carpeta' : ''}
            </div>
            {ffmpeg && !ffmpeg.ok && <div className="panel-note warn-text">No se encuentra FFmpeg: reinstala las dependencias (ffmpeg-static) o define EDITFORGE_FFMPEG.</div>}
            <div className="modal-actions">
              <button className="btn" onClick={close}>
                Cancelar
              </button>
              <button className="btn primary" disabled={duration <= 0 || (ffmpeg !== null && !ffmpeg.ok)} onClick={() => void start()}>
                Exportar…
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="export-file" title={progress.output}>
              {basename(progress.output)}
            </div>
            <div className="progress">
              <div className={`progress-bar ${progress.phase}`} style={{ width: `${(progress.frame / Math.max(1, progress.total)) * 100}%` }} />
            </div>
            <div className="muted small export-summary">
              {progress.phase === 'audio' && 'Mezclando el audio…'}
              {progress.phase === 'video' && `Fotograma ${progress.frame} de ${progress.total} · ${progress.speed.toFixed(1)} fps · quedan ${formatDuration(progress.eta)}`}
              {progress.phase === 'finishing' && 'Terminando el archivo…'}
              {progress.phase === 'done' && `✓ Exportado en ${formatDuration(progress.elapsed)} (${progress.total} fotogramas)`}
              {progress.phase === 'cancelled' && 'Exportación cancelada (se ha borrado el archivo incompleto).'}
              {progress.phase === 'error' && `✕ ${progress.message}`}
            </div>
            {progress.log && <pre className="export-log">{progress.log}</pre>}
            <div className="modal-actions">
              {running && (
                <button className="btn danger-btn" onClick={cancelExport}>
                  Cancelar exportación
                </button>
              )}
              {progress.phase === 'done' && (
                <button className="btn" onClick={() => window.editforge?.showItemInFolder(progress.output)}>
                  Mostrar en la carpeta
                </button>
              )}
              {finished && (
                <button className="btn primary" onClick={close}>
                  Cerrar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
