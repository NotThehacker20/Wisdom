import { keepKeysInField } from './keys'
import { useEffect, useRef, useState } from 'react'
import { animDuration, TEXT_ANIMATORS } from '@/core/text'
import { patchTextAnim, setTextAnim, setTextContent, setTextStyle } from '@/core/textOps'
import type { Clip, TextAnim } from '@/core/types'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { saveTextPreset } from '@/state/actions'
import { SavePreset } from './SavePreset'
import { FALLBACK_FONTS, listSystemFonts } from './fonts'
import { NumberField } from './NumberField'
import { PropRow } from './PropRow'
import { propDefFor } from '@/core/props'

const WEIGHTS: Array<[number, string]> = [
  [300, 'Fina'],
  [400, 'Normal'],
  [600, 'Semi'],
  [700, 'Negrita'],
  [800, 'Extra'],
  [900, 'Black']
]

/** Inspector de un clip de texto: contenido, fuente, estilo y animaciones. */
export function TextSection({ clip }: { clip: Clip }) {
  const apply = useProject((s) => s.apply)
  const d = clip.text!
  const st = d.style
  const [draft, setDraft] = useState(d.content)
  const [fonts, setFonts] = useState<string[]>(FALLBACK_FONTS)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setDraft(d.content), [d.content, clip.id])
  useEffect(() => {
    const onEdit = (e: Event) => {
      if ((e as CustomEvent).detail === clip.id) {
        area.current?.focus()
        area.current?.select()
      }
    }
    window.addEventListener('editforge:edit-text', onEdit)
    return () => window.removeEventListener('editforge:edit-text', onEdit)
  }, [clip.id])

  const style = (label: string, patch: Parameters<typeof setTextStyle>[2], merge?: string) =>
    apply(label, (p) => setTextStyle(p, clip.id, patch), merge ? `${clip.id}|${merge}` : undefined)
  const color = (label: string, value: string, set: (v: string) => Parameters<typeof setTextStyle>[2], merge: string) => (
    <input type="color" value={value} onChange={(e) => style(label, set(e.target.value), merge)} title={label} />
  )
  const toggle = (label: string, on: boolean, set: (v: boolean) => Parameters<typeof setTextStyle>[2]) => (
    <input type="checkbox" checked={on} onChange={(e) => style(label, set(e.target.checked))} />
  )

  return (
    <>
      <div className="inspector-section">
        <h3>Texto</h3>
        <textarea
          ref={area}
          className="text-area"
          value={draft}
          rows={Math.min(6, Math.max(2, draft.split('\n').length))}
          onChange={(e) => {
            setDraft(e.target.value)
            apply('Editar texto', (p) => setTextContent(p, clip.id, e.target.value), `${clip.id}|content`)
          }}
          onKeyDown={keepKeysInField}
        />
        <div className="field-row">
          <span>Fuente</span>
          <select
            value={st.font}
            onPointerDown={() => void listSystemFonts().then(setFonts)}
            onChange={(e) => style('Fuente', { font: e.target.value })}
            style={{ fontFamily: st.font }}
          >
            {!fonts.includes(st.font) && <option value={st.font}>{st.font}</option>}
            {fonts.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <span>Grosor</span>
          <div className="row-tools">
            <select value={st.weight} onChange={(e) => style('Grosor', { weight: Number(e.target.value) })}>
              {WEIGHTS.map(([w, n]) => (
                <option key={w} value={w}>
                  {n}
                </option>
              ))}
            </select>
            <button className={`tool toggle ${st.italic ? 'on' : ''}`} onClick={() => style('Cursiva', { italic: !st.italic })} title="Cursiva">
              <i>I</i>
            </button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={`tool toggle ${st.align === a ? 'on' : ''}`} onClick={() => style('Alineación', { align: a })} title={a}>
                {a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}
              </button>
            ))}
          </div>
        </div>
        <NumberField label="Tamaño" value={st.size} step={1} min={4} max={2000} unit="px" decimals={0} onChange={(v) => style('Tamaño', { size: v }, 'size')} />
        <NumberField label="Interlineado" value={st.lineHeight} step={0.01} min={0.5} max={4} decimals={2} onChange={(v) => style('Interlineado', { lineHeight: v }, 'lh')} />
        {propDefFor(clip, 'text.tracking') && <PropRow clip={clip} def={{ ...propDefFor(clip, 'text.tracking')!, label: 'Espaciado' }} />}
        <div className="field-row">
          <span>Color</span>
          {color('Color', st.color, (v) => ({ color: v }), 'color')}
        </div>
      </div>

      <div className="inspector-section">
        <h3>Estilo</h3>
        <div className="field-row">
          <span>Contorno</span>
          <div className="row-tools">
            {toggle('Contorno', st.stroke.enabled, (v) => ({ stroke: { enabled: v } }))}
            {color('Color del contorno', st.stroke.color, (v) => ({ stroke: { color: v } }), 'scol')}
          </div>
        </div>
        {st.stroke.enabled && <NumberField label="Grosor" value={st.stroke.width} step={0.25} min={0} max={100} unit="px" decimals={1} onChange={(v) => style('Grosor del contorno', { stroke: { width: v } }, 'sw')} />}
        <div className="field-row">
          <span>Sombra</span>
          <div className="row-tools">
            {toggle('Sombra', st.shadow.enabled, (v) => ({ shadow: { enabled: v } }))}
            {color('Color de la sombra', st.shadow.color, (v) => ({ shadow: { color: v } }), 'shcol')}
          </div>
        </div>
        {st.shadow.enabled && (
          <>
            <NumberField label="Desenfoque" value={st.shadow.blur} step={0.5} min={0} max={200} unit="px" decimals={0} onChange={(v) => style('Sombra', { shadow: { blur: v } }, 'shb')} />
            <NumberField label="Distancia Y" value={st.shadow.y} step={0.5} min={-200} max={200} unit="px" decimals={0} onChange={(v) => style('Sombra', { shadow: { y: v } }, 'shy')} />
            <NumberField label="Opacidad" value={st.shadow.opacity * 100} step={0.5} min={0} max={100} unit="%" decimals={0} onChange={(v) => style('Sombra', { shadow: { opacity: v / 100 } }, 'sho')} />
          </>
        )}
        <div className="field-row">
          <span>Glow</span>
          <div className="row-tools">
            {toggle('Glow', st.glow.enabled, (v) => ({ glow: { enabled: v } }))}
            {color('Color del glow', st.glow.color, (v) => ({ glow: { color: v } }), 'gcol')}
          </div>
        </div>
        {st.glow.enabled && (
          <>
            <NumberField label="Radio" value={st.glow.radius} step={0.5} min={0} max={300} unit="px" decimals={0} onChange={(v) => style('Glow', { glow: { radius: v } }, 'gr')} />
            <NumberField label="Intensidad" value={st.glow.strength} step={0.01} min={0} max={4} decimals={2} onChange={(v) => style('Glow', { glow: { strength: v } }, 'gs')} />
          </>
        )}
        <div className="field-row">
          <span>Caja de fondo</span>
          <div className="row-tools">
            {toggle('Caja', st.box.enabled, (v) => ({ box: { enabled: v } }))}
            {color('Color de la caja', st.box.color, (v) => ({ box: { color: v } }), 'bcol')}
          </div>
        </div>
      </div>

      <AnimEditor clip={clip} which="in" />
      <AnimEditor clip={clip} which="out" />
      <div className="inspector-section">
        <SavePreset label="Guardar estilo de texto…" placeholder="Nombre del estilo" onSave={(name) => saveTextPreset(clip.id, name)} />
      </div>
    </>
  )
}

function AnimEditor({ clip, which }: { clip: Clip; which: 'in' | 'out' }) {
  const apply = useProject((s) => s.apply)
  const d = clip.text!
  const anim = which === 'in' ? d.animIn : d.animOut
  const prog = which === 'in' ? d.progressIn : d.progressOut
  const dur = animDuration(prog) || (which === 'in' ? 0.6 : 0.4)
  const set = (a: TextAnim | null, duration = dur) => apply(which === 'in' ? 'Animación de entrada' : 'Animación de salida', (p) => setTextAnim(p, clip.id, which, a, duration))
  const patch = (pt: Partial<TextAnim>) => apply('Animación de texto', (p) => patchTextAnim(p, clip.id, which, pt))
  const path = which === 'in' ? 'text.in' : 'text.out'
  return (
    <div className="inspector-section">
      <h3>{which === 'in' ? 'Animación de entrada' : 'Animación de salida'}</h3>
      <div className="field-row">
        <span>Tipo</span>
        <select
          value={anim?.type ?? ''}
          onChange={(e) => {
            const preset = TEXT_ANIMATORS.find((x) => x.type === e.target.value)
            set(preset ? { type: preset.type, unit: anim?.unit ?? preset.unit, overlap: anim?.overlap ?? preset.overlap, direction: anim?.direction ?? 'up' } : null, preset?.type === 'typewriter' && !anim ? 1.2 : dur)
          }}
        >
          <option value="">Ninguna</option>
          {TEXT_ANIMATORS.map((a) => (
            <option key={a.type} value={a.type}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {anim && (
        <>
          <div className="field-row">
            <span>Por</span>
            <select value={anim.unit} onChange={(e) => patch({ unit: e.target.value as TextAnim['unit'] })}>
              <option value="char">Carácter</option>
              <option value="word">Palabra</option>
              <option value="line">Línea</option>
            </select>
          </div>
          {anim.type === 'slide' && (
            <div className="field-row">
              <span>Desde</span>
              <select value={anim.direction ?? 'up'} onChange={(e) => patch({ direction: e.target.value as TextAnim['direction'] })}>
                <option value="up">Abajo (sube)</option>
                <option value="down">Arriba (baja)</option>
                <option value="left">Derecha</option>
                <option value="right">Izquierda</option>
              </select>
            </div>
          )}
          <NumberField label="Duración" value={dur} step={1 / 30} min={1 / 30} max={clip.duration} unit="s" decimals={2} onChange={(v) => set(anim, v)} />
          <NumberField label="Solapamiento" value={anim.overlap * 100} step={0.5} min={0} max={95} unit="%" decimals={0} onChange={(v) => patch({ overlap: v / 100 })} />
          <PropRow clip={clip} def={{ ...propDefFor(clip, path)!, label: 'Progreso' }} />
          <button className="btn small-btn" onClick={() => { useUi.getState().setActiveProp(clip.id, path); useUi.getState().setBottomTab('graph') }}>
            Editar ritmo en el graph editor…
          </button>
        </>
      )}
    </div>
  )
}

