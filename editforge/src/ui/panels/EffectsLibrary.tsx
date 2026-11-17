import { keepKeysInField } from '../keys'
import { useMemo, useState } from 'react'
import { listEffects, type EffectManifest } from '@/core/effects'
import { listTransitions } from '@/core/transitions'
import { addEffectAction, addTextAction, addTransitionAction, applyEffectPreset, applyTextPreset, deleteEffectPreset, deleteTextPreset, TEXT_PRESETS } from '@/state/actions'
import { useSettings } from '@/state/settings'
import { getEffect } from '@/core/effects'
import { openContextMenu } from '../ContextMenu'
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
  const userPresets = useSettings((s) => s.effectPresets)
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = listEffects().filter((m) => !term || m.name.toLowerCase().includes(term) || m.category.toLowerCase().includes(term))
    return CATEGORY_ORDER.map((cat) => ({ cat, items: list.filter((m) => m.category === cat) })).filter((g) => g.items.length)
  }, [q])

  if (kind === 'transitions') return <TransitionsLibrary />

  return (
    <div className="fx-library">
      <div className="panel-toolbar">
        <input className="text-input" placeholder="Buscar efecto…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keepKeysInField} />
      </div>
      <div className="panel-note">
        Arrastra un efecto a un clip de la timeline, o haz doble clic para aplicarlo {selected ? `a ${selected === 1 ? 'el clip seleccionado' : `los ${selected} clips seleccionados`}` : 'en una capa de ajuste nueva en el cabezal'}.
      </div>
      {userPresets.length > 0 && (
        <div className="fx-group">
          <div className="fx-cat">Mis presets</div>
          <div className="fx-grid">
            {userPresets.map((pr) => (
              <div
                key={pr.id}
                className="fx-item cat-user"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(EFFECT_DRAG_TYPE, `preset:${pr.id}`)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onDoubleClick={() => applyEffectPreset(pr.id)}
                onContextMenu={(e) => openContextMenu(e, [{ label: `Borrar «${pr.name}»`, danger: true, action: () => deleteEffectPreset(pr.id) }])}
                title={`${pr.name}\n${pr.effects.map((f) => getEffect(f.type)?.name ?? f.type).join(' + ')}`}
              >
                <div className="fx-swatch">
                  <span>★</span>
                </div>
                <span>{pr.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const myStyles = useSettings((s) => s.textPresets)
  return (
    <div className="fx-library">
      <div className="panel-toolbar">
        <button className="btn primary" onClick={() => addTextAction()}>
          + Texto
        </button>
      </div>
      <div className="panel-note">Doble clic en un estilo para añadirlo en el cabezal (pista nueva arriba). Atajo: T.</div>
      {myStyles.length > 0 && (
        <>
          <div className="fx-cat">Mis estilos</div>
          <div className="text-presets">
            {myStyles.map((t) => (
              <div
                key={t.id}
                className="text-preset"
                onDoubleClick={() => applyTextPreset(t.id)}
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    { label: 'Aplicar a los textos seleccionados', action: () => applyTextPreset(t.id, true) },
                    { label: `Borrar «${t.name}»`, danger: true, action: () => deleteTextPreset(t.id) }
                  ])
                }
                title={t.name}
              >
                <span style={{ fontFamily: t.style.font, fontWeight: t.style.weight, fontStyle: t.style.italic ? 'italic' : undefined, color: t.style.color, WebkitTextStroke: t.style.stroke.enabled ? `2px ${t.style.stroke.color}` : undefined, textShadow: t.style.glow.enabled ? `0 0 10px ${t.style.glow.color}` : '0 2px 6px rgba(0,0,0,.6)' }}>
                  {t.name}
                </span>
              </div>
            ))}
          </div>
          <div className="fx-cat">Estilos de serie</div>
        </>
      )}
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
