import { useMemo, useState } from 'react'
import { listEffects, type EffectManifest } from '@/core/effects'
import { listTransitions } from '@/core/transitions'
import { addEffectAction, addTransitionAction } from '@/state/actions'
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
