import { CurvesEditor } from './CurvesEditor'
import { useState } from 'react'
import { applyPreset, moveEffect, removeEffect, setEffectEnabled, setEffectString } from '@/core/effectOps'
import { getEffect, type ParamDef } from '@/core/effects'
import { basename } from '@/core/paths'
import { fxPath, getProp, propDefFor, setPropValue } from '@/core/props'
import { frameRound } from '@/core/timeline'
import { evalProp } from '@/core/anim'
import type { Clip, EffectInstance } from '@/core/types'
import { pickEffectFile, saveEffectPreset } from '@/state/actions'
import { SavePreset } from './SavePreset'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { PropRow } from './PropRow'

/** Pila de efectos de un clip en el inspector: activar, reordenar, presets y parámetros animables. */
export function EffectStack({ clip }: { clip: Clip }) {
  const effects = clip.effects ?? []
  if (!effects.length) return null
  return (
    <div className="inspector-section">
      <h3>Efectos</h3>
      {effects.map((fx, i) => (
        <EffectCard key={fx.id} clip={clip} fx={fx} first={i === 0} last={i === effects.length - 1} />
      ))}
      <SavePreset label="Guardar efectos como preset…" placeholder="Nombre del preset" onSave={(name) => saveEffectPreset(clip.id, name)} />
    </div>
  )
}

function EffectCard({ clip, fx, first, last }: { clip: Clip; fx: EffectInstance; first: boolean; last: boolean }) {
  const apply = useProject((s) => s.apply)
  const fps = useProject((s) => s.project.settings.fps)
  const time = usePlayback((s) => s.time)
  const [open, setOpen] = useState(true)
  const m = getEffect(fx.type)
  if (!m) {
    return (
      <div className="fx-card unknown">
        <div className="fx-card-head">
          <span>Efecto desconocido: {fx.type}</span>
          <button className="fx-icon" onClick={() => apply('Quitar efecto', (p) => removeEffect(p, clip.id, fx.id))}>
            ✕
          </button>
        </div>
      </div>
    )
  }
  const local = frameRound(time, fps) - clip.start

  const otherParam = (d: ParamDef) => {
    if (d.type === 'enum' || d.type === 'bool') {
      const prop = getProp(clip, fxPath(fx.id, d.name))
      const v = Math.round(prop ? evalProp(prop, local) : Number(d.default))
      const set = (val: number) => apply(`Cambiar ${d.label}`, (p) => setPropValue(p, clip.id, fxPath(fx.id, d.name), local, val))
      return (
        <div key={d.name} className="field-row fx-field">
          <span>{d.label}</span>
          {d.type === 'bool' ? (
            <input type="checkbox" checked={v >= 1} onChange={(e) => set(e.target.checked ? 1 : 0)} />
          ) : (
            <select value={v} onChange={(e) => set(Number(e.target.value))}>
              {d.options!.map((o, i) => (
                <option key={o} value={i}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </div>
      )
    }
    const value = fx.strings?.[d.name] ?? String(d.default)
    if (d.type === 'curves') {
      return (
        <CurvesEditor
          key={d.name}
          value={value}
          onChange={(v) => apply(`Cambiar ${d.label}`, (p) => setEffectString(p, clip.id, fx.id, d.name, v), `${fx.id}|${d.name}`)}
        />
      )
    }
    if (d.type === 'color') {
      return (
        <div key={d.name} className="field-row fx-field">
          <span>{d.label}</span>
          <input type="color" value={value} onChange={(e) => apply(`Cambiar ${d.label}`, (p) => setEffectString(p, clip.id, fx.id, d.name, e.target.value), `${fx.id}|${d.name}`)} />
        </div>
      )
    }
    return (
      <div key={d.name} className="field-row fx-field">
        <span>{d.label}</span>
        <button className="btn small-btn" title={value || 'Sin archivo'} onClick={() => void pickEffectFile(clip.id, fx.id, d.name, d.label, d.extensions ?? [])}>
          {value ? basename(value) : 'Elegir…'}
        </button>
      </div>
    )
  }

  return (
    <div className={`fx-card ${fx.enabled ? '' : 'off'}`}>
      <div className="fx-card-head">
        <button className="fx-icon" onClick={() => setOpen(!open)} title={open ? 'Plegar' : 'Desplegar'}>
          {open ? '▾' : '▸'}
        </button>
        <input
          type="checkbox"
          checked={fx.enabled}
          title="Activar / desactivar"
          onChange={(e) => apply(e.target.checked ? 'Activar efecto' : 'Desactivar efecto', (p) => setEffectEnabled(p, clip.id, fx.id, e.target.checked))}
        />
        <span className="fx-card-name" title={m.description}>
          {m.name}
        </span>
        {m.presets?.length ? (
          <select
            className="fx-presets"
            value=""
            title="Presets"
            onChange={(e) => {
              const preset = m.presets!.find((x) => x.name === e.target.value)
              if (preset) apply(`Preset ${preset.name}`, (p) => applyPreset(p, clip.id, fx.id, preset, frameRound(playback.currentTime, fps) - clip.start))
            }}
          >
            <option value="">Presets</option>
            {m.presets.map((pr) => (
              <option key={pr.name} value={pr.name}>
                {pr.name}
              </option>
            ))}
          </select>
        ) : null}
        <button className="fx-icon" disabled={first} onClick={() => apply('Reordenar efectos', (p) => moveEffect(p, clip.id, fx.id, -1))} title="Subir">
          ↑
        </button>
        <button className="fx-icon" disabled={last} onClick={() => apply('Reordenar efectos', (p) => moveEffect(p, clip.id, fx.id, 1))} title="Bajar">
          ↓
        </button>
        <button className="fx-icon danger" onClick={() => apply('Quitar efecto', (p) => removeEffect(p, clip.id, fx.id))} title="Quitar">
          ✕
        </button>
      </div>
      {open && (
        <div className="fx-card-body">
          {m.params.map((d) => {
            if (d.type !== 'number') return otherParam(d)
            const def = propDefFor(clip, fxPath(fx.id, d.name))
            return def ? <PropRow key={d.name} clip={clip} def={{ ...def, label: d.label }} /> : null
          })}
        </div>
      )}
    </div>
  )
}
