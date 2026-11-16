import { setSettingsCmd } from '@/core/ops'
import { clipPropPaths, propDef, toggleKeyframes } from '@/core/props'
import { frameRound } from '@/core/timeline'
import { findClip, PRESETS } from '@/core/project'
import { formatDuration, formatTimecode } from '@/core/time'
import { MARKER_COLORS, removeMarker, updateMarker } from '@/core/timeline'
import { removeAssetAction } from '@/state/actions'
import { relinkAsset } from '@/state/projectFile'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { playback } from '@/state/playback'
import { PropRow } from '../PropRow'

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
  const apply = useProject((s) => s.apply)
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
          {clipPropPaths(found.clip).length > 0 && (
            <div className="inspector-section">
              <div className="section-head">
                <h3>{found.clip.kind === 'null' ? 'Null object' : 'Transformación'}</h3>
                <button
                  className="kf-btn small"
                  title="Keyframe en todas las propiedades"
                  onClick={() => {
                    const c = found.clip
                    const local = frameRound(playback.currentTime, project.settings.fps) - c.start
                    apply('Keyframes', (p) => toggleKeyframes(p, c.id, clipPropPaths(c), local))
                  }}
                >
                  ◆ todo
                </button>
              </div>
              {clipPropPaths(found.clip).map((path) => {
                const def = propDef(path)
                return def ? <PropRow key={path} clip={found.clip} def={def} /> : null
              })}
              <div className="panel-note">
                Clic en una propiedad para verla en el graph editor (Ctrl+clic añade). Doble clic en el nombre la restablece. En el visor: arrastra para mover, esquinas para escalar, el círculo para rotar y Alt+arrastrar para mover el anclaje.
              </div>
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
