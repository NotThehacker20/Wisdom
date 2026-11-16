import { setSettingsCmd, setTransformValueCmd } from '@/core/ops'
import { findClip, PRESETS } from '@/core/project'
import { formatDuration, formatTimecode } from '@/core/time'
import { MARKER_COLORS, removeMarker, updateMarker } from '@/core/timeline'
import type { Transform } from '@/core/types'
import { removeAssetAction } from '@/state/actions'
import { relinkAsset } from '@/state/projectFile'
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
  const selectedClipIds = useUi((s) => s.selectedClipIds)
  const selectedAssetId = useUi((s) => s.selectedAssetId)
  const selectedMarkerId = useUi((s) => s.selectedMarkerId)
  const found = selectedClipIds.length === 1 ? findClip(project, selectedClipIds[0]) : undefined
  const asset = found?.clip.assetId ? project.assets[found.clip.assetId] : !found && selectedAssetId ? project.assets[selectedAssetId] : undefined
  const marker = selectedMarkerId ? project.markers.find((m) => m.id === selectedMarkerId) : undefined

  return (
    <div className="inspector">
      {marker ? (
        <MarkerView markerId={marker.id} />
      ) : selectedClipIds.length > 1 ? (
        <div className="inspector-section">
          <h3>{selectedClipIds.length} clips seleccionados</h3>
          <div className="muted small">Arrástralos juntos en la timeline o usa Cortar / Duplicar / Eliminar.</div>
        </div>
      ) : found ? (
        <>
          <div className="inspector-section">
            <h3>{found.clip.name}</h3>
            <div className="muted small">
              Inicio {formatDuration(found.clip.start)} · Duración {formatDuration(found.clip.duration)}
            </div>
          </div>
          {found.clip.kind === 'adjustment' && <div className="panel-note">Los efectos de la capa de ajuste llegan en la fase 5.</div>}
          {found.clip.kind !== 'audio' && found.clip.kind !== 'adjustment' && (
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
          {asset.missing && (
            <div className="missing-box">
              ⚠ No se encuentra el archivo.
              <button className="btn" onClick={() => void relinkAsset(asset.id)}>
                Revincular…
              </button>
            </div>
          )}
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
          {!found && (
            <button className="btn danger-btn" onClick={() => removeAssetAction(asset.id)}>
              Quitar del proyecto
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MarkerView({ markerId }: { markerId: string }) {
  const project = useProject((s) => s.project)
  const apply = useProject((s) => s.apply)
  const m = project.markers.find((x) => x.id === markerId)
  if (!m) return null
  return (
    <div className="inspector-section">
      <h3>Marcador</h3>
      <div className="muted small">{formatTimecode(m.t, project.settings.fps)}</div>
      <div className="field-row">
        <span>Nombre</span>
        <input
          className="text-input"
          key={m.id}
          defaultValue={m.label}
          placeholder="Sin nombre"
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          onBlur={(e) => {
            const label = e.target.value
            if (label !== m.label) apply('Renombrar marcador', (p) => updateMarker(p, m.id, { label }))
          }}
        />
      </div>
      <div className="field-row">
        <span>Color</span>
        <div className="swatches">
          {MARKER_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${c === m.color ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => apply('Color de marcador', (p) => updateMarker(p, m.id, { color: c }))}
            />
          ))}
        </div>
      </div>
      <button
        className="btn danger-btn"
        onClick={() => {
          apply('Eliminar marcador', (p) => removeMarker(p, m.id))
          useUi.getState().selectMarker(null)
        }}
      >
        Eliminar marcador
      </button>
    </div>
  )
}
