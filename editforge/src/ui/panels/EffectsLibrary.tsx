import { useMemo, useState } from 'react'
import { listEffects, type EffectManifest } from '@/core/effects'
import { listTransitions } from '@/core/transitions'
import { addEffectAction, addTextAction, addTransitionAction, TEXT_PRESETS } from '@/state/actions'
import { useUi } from '@/state/uiStore'
import { EFFECT_DRAG_TYPE, TRANSITION_DRAG_TYPE } from '../dnd'

const CATEGORY_ORDER: EffectManifest['category'][] = ['Movimiento', 'Desenfoque', 'Color', 'Estilizar', 'Distorsión']

const ICONS: Record<string, string> = {
  shake: '〰', zoom: '⊕', motionBlur: '≋', mirrorTile: '⧉', blur: '◌', radialBlur: '✺', sharpen: '◇', color: '◐', lut: '▦',
  vignette: '◎', rgbSplit: '⫴', glow: '✦', flash: '⚡', pixelate: '▩', grain: '⁘', glitch: '⌁', vhs: '▭', wave: '∿'
}

const TRANSITION_ICONS: Record<string, string> = {
  crossfade: '◑', zoomIn: '⊕', zoomOut: '⊖', whipPan: '⇶', slide: '⇥', flash: '☀', lumaFade: '◐', spin: '↻', glitch: '⌁',
  shake: '〰', rgbSplit: '⫴', inkWipe: '✿'
}

function TransitionsLibrary() {
  return (
    <div className="fx-library">
      <div className="panel-note">
        Arrastra una transición al corte entre dos clips seguidos de la timeline, o haz doble clic para ponerla en el corte más cercano al cabezal.
      </div>
      <div className="fx-grid">
        {listTransitions().map((m) => (
          <div
            key={m.id}
            className="fx-item cat-tr"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TRANSITION_DRAG_TYPE, m.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onDoubleClick={() => addTransitionAction(m.id)}
            title={`${m.name}${m.description ? `\n${m.description}` : ''}`}
          >
            <div className="fx-swatch">
              <span>{TRANSITION_ICONS[m.id] ?? '⧓'}</span>
            </div>
            <span>{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EffectsLibrary({ kind }: { kind: 'effects' | 'transitions' }) {
  const [q, setQ] = useState('')
  const selected = useUi((s) => s.selectedClipIds.length)
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = listEffects().filter((m) => !term || m.name.toLowerCase().includes(term) || m.category.toLowerCase().includes(term))
    return CATEGORY_ORDER.map((cat) => ({ cat, items: list.filter((m) => m.category === cat) })).filter((g) => g.items.length)
  }, [q])

  if (kind === 'transitions') return <TransitionsLibrary />

  return (
    <div className="fx-library">
      <div className="panel-toolbar">
        <input className="text-input" placeholder="Buscar efecto…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="panel-note">
        Arrastra un efecto a un clip de la timeline, o haz doble clic para aplicarlo {selected ? `a ${selected === 1 ? 'el clip seleccionado' : `los ${selected} clips seleccionados`}` : 'en una capa de ajuste nueva en el cabezal'}.
      </div>
      {groups.map((g) => (
        <div key={g.cat} className="fx-group">
          <div className="fx-cat">{g.cat}</div>
          <div className="fx-grid">
            {g.items.map((m) => (
              <div
                key={m.id}
                className={`fx-item cat-${CATEGORY_ORDER.indexOf(m.category)}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(EFFECT_DRAG_TYPE, m.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDoubleClick={() => addEffectAction(m.id)}
                title={`${m.name}${m.description ? `\n${m.description}` : ''}${m.kind === 'transform' ? '\n(Transformación: se hereda por parenting)' : ''}`}
              >
                <div className="fx-swatch">
                  <span>{ICONS[m.id] ?? '✱'}</span>
                </div>
                <span>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Estilos de texto predefinidos: doble clic (o «+ Texto») los añade en el cabezal. */
export function TextLibrary() {
  return (
    <div className="fx-library">
      <div className="panel-toolbar">
        <button className="btn primary" onClick={() => addTextAction()}>
          + Texto
        </button>
      </div>
      <div className="panel-note">Doble clic en un estilo para añadirlo en el cabezal (pista nueva arriba). Atajo: T.</div>
      <div className="text-presets">
        {TEXT_PRESETS.map((t) => {
          const s = t.style as Record<string, any>
          return (
            <div key={t.id} className="text-preset" onDoubleClick={() => addTextAction(t.id)} title={`${t.name}${t.animIn ? ' · animado' : ''}`}>
              <span
                style={{
                  fontFamily: s.font ?? 'Arial',
                  fontWeight: s.weight ?? 800,
                  color: s.color ?? '#fff',
                  WebkitTextStroke: s.stroke?.enabled ? `2px ${s.stroke.color}` : undefined,
                  textShadow: s.glow?.enabled ? `0 0 10px ${s.glow.color}, 0 0 20px ${s.glow.color}` : '0 2px 6px rgba(0,0,0,.6)',
                  background: s.box?.enabled ? 'rgba(0,0,0,.55)' : undefined,
                  padding: s.box?.enabled ? '2px 8px' : undefined,
                  borderRadius: 4
                }}
              >
                {t.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
