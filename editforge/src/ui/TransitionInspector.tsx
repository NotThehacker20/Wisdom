import { indexClips } from '@/core/layerTransform'
import { getTransition, listTransitions, maxTransitionDuration, setTransition, TRANSITION_EASES, updateTransition } from '@/core/transitions'
import { removeSelectedTransition } from '@/state/actions'
import { useProject } from '@/state/projectStore'
import { NumberField } from './NumberField'

/** Inspector de la transición seleccionada (id del clip B). */
export function TransitionInspector({ bId }: { bId: string }) {
  const project = useProject((s) => s.project)
  const apply = useProject((s) => s.apply)
  const b = indexClips(project).get(bId)
  const tr = b?.transitionIn
  const track = project.tracks.find((t) => t.clips.some((c) => c.id === bId))
  if (!b || !tr || !track) return <div className="panel-note">La transición ya no existe.</div>
  const m = getTransition(tr.type)
  const i = track.clips.findIndex((c) => c.id === bId)
  const a = track.clips[i - 1]
  const max = maxTransitionDuration(track, bId)
  const key = `${tr.id}`
  return (
    <div className="inspector-section">
      <h3>Transición</h3>
      <div className="muted small">
        {a?.name ?? '—'} → {b.name}
      </div>
      <div className="field-row">
        <span>Tipo</span>
        <select value={tr.type} onChange={(e) => apply('Cambiar transición', (p) => setTransition(p, bId, e.target.value))}>
          {listTransitions().map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <NumberField
        label="Duración"
        value={tr.duration}
        step={1 / project.settings.fps}
        min={2 / project.settings.fps}
        max={max}
        unit="s"
        decimals={2}
        onChange={(v) => apply('Duración de transición', (p) => updateTransition(p, bId, { duration: v }), `${key}|duration`)}
      />
      <div className="field-row">
        <span>Curva</span>
        <select value={tr.ease} onChange={(e) => apply('Curva de transición', (p) => updateTransition(p, bId, { ease: e.target.value }))}>
          {TRANSITION_EASES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </div>
      {m?.params.map((d) => {
        if (d.type === 'number') {
          return (
            <NumberField
              key={d.name}
              label={d.label}
              value={tr.params[d.name] ?? Number(d.default)}
              step={d.step ?? ((d.max ?? 100) - (d.min ?? 0)) / 200}
              min={d.min}
              max={d.max}
              unit={d.unit}
              decimals={d.decimals ?? 2}
              onChange={(v) => apply(`Cambiar ${d.label}`, (p) => updateTransition(p, bId, { params: { [d.name]: v } }), `${key}|${d.name}`)}
            />
          )
        }
        if (d.type === 'enum' || d.type === 'bool') {
          const v = Math.round(tr.params[d.name] ?? Number(d.default))
          const set = (val: number) => apply(`Cambiar ${d.label}`, (p) => updateTransition(p, bId, { params: { [d.name]: val } }))
          return (
            <div key={d.name} className="field-row">
              <span>{d.label}</span>
              {d.type === 'bool' ? (
                <input type="checkbox" checked={v >= 1} onChange={(e) => set(e.target.checked ? 1 : 0)} />
              ) : (
                <select value={v} onChange={(e) => set(Number(e.target.value))}>
                  {d.options!.map((o, k) => (
                    <option key={o} value={k}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        }
        if (d.type === 'color') {
          return (
            <div key={d.name} className="field-row">
              <span>{d.label}</span>
              <input
                type="color"
                value={tr.strings?.[d.name] ?? String(d.default)}
                onChange={(e) => apply(`Cambiar ${d.label}`, (p) => updateTransition(p, bId, { strings: { [d.name]: e.target.value } }), `${key}|${d.name}`)}
              />
            </div>
          )
        }
        return null
      })}
      <div className="panel-note">Arrastra los bordes de la transición en la timeline para cambiar su duración.</div>
      <button className="btn danger-btn" onClick={removeSelectedTransition}>
        Quitar transición
      </button>
    </div>
  )
}
