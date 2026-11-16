import { setSettingsCmd, setTransformValueCmd } from '@/core/ops'
import { findClip, PRESETS } from '@/core/project'
import { formatDuration } from '@/core/time'
import type { Transform } from '@/core/types'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { NumberField } from '../NumberField'

const FIELDS: Array<{ key: keyof Transform; label: string; step: number; unit?: string; min?: number; max?: number }> = [
  { key: 'x', label: 'Posición X', step: 1, unit: 'px' },
  { key: 'y', label: 'Posición Y', step: 1, unit: 'px' },
  { key: 'scale', label: 'Escala', step: 0.5, unit: '%', min: 0 },
  { key: 'rotation', label: 'Rotación', step: 0.5, unit: '°' },
  { key: 'anchorX', label: 'Anclaje X', step: 1, unit: 'px' },
  { key: 'anchorY', label: 'Anclaje Y', step: 1, unit: 'px' },
  { key: 'opacity', label: 'Opacidad', step: 0.5, unit: '%', min: 0, max: 100 }
]

function ProjectSettingsView() {
  const project = useProject((s) => s.project)
  const dispatch = useProject((s) => s.dispatch)
  const { width, height, fps } = project.settings
  const presetKey = Object.entries(PRESETS).find(([, v]) => v.width === width && v.height === height)?.[0] ?? ''
  return (
    <div className="inspector-section">
      <h3>Proyecto</h3>
      <div className="field-row">
        <span>Formato</span>
        <select
          value={presetKey}
          onChange={(e) => dispatch(setSettingsCmd(PRESETS[e.target.value], useProject.getState().project))}
        >
          {!presetKey && <option value="">Personalizado ({width}×{height})</option>}
          {Object.keys(PRESETS).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <span>FPS</span>
        <select value={fps} onChange={(e) => dispatch(setSettingsCmd({ fps: Number(e.target.value) }, useProject.getState().project))}>
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function Inspector() {
  const project = useProject((s) => s.project)
  const dispatch = useProject((s) => s.dispatch)
  const selectedClipId = useUi((s) => s.selectedClipId)
  const selectedAssetId = useUi((s) => s.selectedAssetId)
  const found = selectedClipId ? findClip(project, selectedClipId) : undefined
  const asset = found?.clip.assetId ? project.assets[found.clip.assetId] : selectedAssetId ? project.assets[selectedAssetId] : undefined

  return (
    <div className="inspector">
      {found ? (
        <>
          <div className="inspector-section">
            <h3>{found.clip.name}</h3>
            <div className="muted small">
              Inicio {formatDuration(found.clip.start)} · Duración {formatDuration(found.clip.duration)}
            </div>
          </div>
          {found.clip.kind !== 'audio' && (
            <div className="inspector-section">
              <h3>Transformación</h3>
              {FIELDS.map((f) => (
                <NumberField
                  key={f.key}
                  label={f.label}
                  value={found.clip.transform[f.key].value}
                  step={f.step}
                  unit={f.unit}
                  min={f.min}
                  max={f.max}
                  onChange={(v) => dispatch(setTransformValueCmd(useProject.getState().project, found.clip.id, f.key, v))}
                />
              ))}
              <div className="panel-note">Keyframes y curvas: fase 3.</div>
            </div>
          )}
        </>
      ) : (
        <ProjectSettingsView />
      )}
      {asset && (
        <div className="inspector-section">
          <h3>Medio</h3>
          <dl className="meta">
            <dt>Archivo</dt>
            <dd title={asset.path}>{asset.name}</dd>
            {asset.hasVideo && (
              <>
                <dt>Resolución</dt>
                <dd>
                  {asset.width}×{asset.height}
                  {asset.rotation ? ` (rot. ${asset.rotation}°)` : ''}
                </dd>
              </>
            )}
            {asset.fps && (
              <>
                <dt>FPS</dt>
                <dd>{asset.fps}</dd>
              </>
            )}
            {asset.codec && (
              <>
                <dt>Códec</dt>
                <dd>{asset.codec}</dd>
              </>
            )}
            <dt>Duración</dt>
            <dd>{formatDuration(asset.duration)}</dd>
            {asset.size !== undefined && (
              <>
                <dt>Tamaño</dt>
                <dd>{(asset.size / 1048576).toFixed(1)} MB</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
