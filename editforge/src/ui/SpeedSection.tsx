import { SPEED_PATH } from '@/core/props'
import { isRamp, SPEED_PRESETS, sourceOutOfRange, sourceSpan } from '@/core/speed'
import { applySpeedPreset, resetSpeed, setConstantSpeed, setFrameInterp, setPreservePitch, setReverse } from '@/core/speedOps'
import type { Clip } from '@/core/types'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { NumberField } from './NumberField'

/** Velocidad del clip: constante, curva (speed ramp), inverso e interpolación de fotogramas. */
export function SpeedSection({ clip }: { clip: Clip }) {
  const apply = useProject((s) => s.apply)
  const asset = useProject((s) => (clip.assetId ? s.project.assets[clip.assetId] : undefined))
  if (!asset || (clip.kind !== 'video' && clip.kind !== 'audio')) return null
  const ramp = isRamp(clip)
  const pct = clip.speed?.value ?? 100
  const out = sourceOutOfRange(clip, asset.duration)
  const editCurve = () => {
    useUi.getState().setActiveProp(clip.id, SPEED_PATH)
    useUi.getState().setBottomTab('graph')
  }
  return (
    <div className="inspector-section">
      <div className="section-head">
        <h3>Velocidad</h3>
        {(ramp || pct !== 100 || clip.reverse) && (
          <button className="kf-btn small" onClick={() => apply('Velocidad normal', (p) => resetSpeed(setReverse(p, clip.id, false), clip.id))}>
            Restablecer
          </button>
        )}
      </div>
      {ramp ? (
        <div className="field-row">
          <span>Curva de velocidad</span>
          <button className="btn small-btn" onClick={editCurve}>
            Editar curva…
          </button>
        </div>
      ) : (
        <NumberField
          label="Velocidad"
          value={pct}
          step={1}
          min={1}
          max={1000}
          unit="%"
          decimals={0}
          onChange={(v) => apply('Velocidad', (p) => setConstantSpeed(p, clip.id, v), `${clip.id}|speed`)}
        />
      )}
      <div className="field-row">
        <span>Curva (speed ramp)</span>
        <select value="" onChange={(e) => e.target.value && apply('Curva de velocidad', (p) => applySpeedPreset(p, clip.id, e.target.value))}>
          <option value="">{ramp ? 'Cambiar…' : 'Elegir…'}</option>
          {SPEED_PRESETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <span>Al revés</span>
        <input type="checkbox" checked={!!clip.reverse} onChange={(e) => apply(e.target.checked ? 'Invertir' : 'Quitar inverso', (p) => setReverse(p, clip.id, e.target.checked))} />
      </div>
      {(clip.kind === 'audio' || asset.hasAudio) && (
        <div className="field-row">
          <span title={ramp ? 'Solo con velocidad constante: en las rampas el tono sigue a la velocidad' : 'Estira el audio sin cambiar el tono (WSOLA)'}>Mantener tono</span>
          <input
            type="checkbox"
            disabled={ramp}
            checked={!!clip.preservePitch && !ramp}
            onChange={(e) => apply(e.target.checked ? 'Mantener tono' : 'Tono libre', (p) => setPreservePitch(p, clip.id, e.target.checked))}
          />
        </div>
      )}
      {clip.kind === 'video' && (
        <div className="field-row">
          <span title="Cómo se generan los fotogramas intermedios en cámara lenta">Interpolación</span>
          <select value={clip.frameInterp ?? 'none'} onChange={(e) => apply('Interpolación de fotogramas', (p) => setFrameInterp(p, clip.id, e.target.value as NonNullable<Clip['frameInterp']>))}>
            <option value="none">Ninguna (repetir)</option>
            <option value="blend">Mezcla de fotogramas</option>
            <option value="flow">Flujo óptico (sencillo)</option>
          </select>
        </div>
      )}
      <div className={`muted small ${out ? 'warn-text' : ''}`}>
        {out ? '⚠ El clip pide más material del que tiene el medio: se congela el último fotograma.' : `Usa ${sourceSpan(clip).toFixed(2)} s del medio.`}
      </div>
      {!ramp && <div className="panel-note">Cambiar la velocidad ajusta la duración y desplaza los clips de detrás. Para una rampa propia, pon keyframes en la velocidad (◆ en el graph editor).</div>}
    </div>
  )
}
