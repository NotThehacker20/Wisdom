import { useEffect, useState } from 'react'
import { updateSettings, useSettings } from '@/state/settings'
import { useUi } from '@/state/uiStore'
import { ACTIONS, comboFromEvent, conflictsFor, keysOf, prettyCombo, type KeyAction } from './keymap'

const GROUPS: KeyAction['group'][] = ['Reproducción', 'Navegación', 'Edición', 'Keyframes', 'Vista', 'Archivo']

/** Editor de atajos: cambia la combinación de cualquier acción (se guarda en los ajustes). */
export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  const keymap = useSettings((s) => s.keymap)
  const [capture, setCapture] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    useUi.setState({ capturingKey: capture !== null })
    if (!capture) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapture(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // solo un modificador: seguimos esperando
      const clash = conflictsFor(capture, combo, keymap)
      // La combinación pasa a esta acción y se quita de las que la tenían.
      const next = { ...keymap, [capture]: [combo] }
      for (const a of clash) next[a.id] = keysOf(a, keymap).filter((k) => k !== combo)
      updateSettings({ keymap: next })
      setMsg(clash.length ? `«${prettyCombo(combo)}» se ha quitado de: ${clash.map((a) => a.label).join(', ')}` : null)
      setCapture(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capture, keymap])

  if (!open) return null
  const close = () => {
    setCapture(null)
    useUi.setState({ shortcutsOpen: false })
  }
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal shortcuts-dialog" role="dialog" aria-label="Atajos de teclado">
        <h2>Atajos de teclado</h2>
        <div className="muted small">Pulsa «Cambiar» y después la nueva combinación (Esc para cancelar).</div>
        {msg && <div className="panel-note warn-text">{msg}</div>}
        <div className="shortcut-list">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="fx-cat">{g}</div>
              {ACTIONS.filter((a) => a.group === g).map((a) => {
                const keys = keysOf(a, keymap)
                const custom = !!keymap[a.id]
                return (
                  <div key={a.id} className={`sc-row2 ${capture === a.id ? 'capturing' : ''}`} data-action={a.id}>
                    <span className="sc-label">{a.label}</span>
                    <span className="sc-keys">
                      {capture === a.id ? (
                        <kbd className="waiting">Pulsa una combinación…</kbd>
                      ) : keys.length ? (
                        keys.map((k) => <kbd key={k}>{prettyCombo(k)}</kbd>)
                      ) : (
                        <span className="muted small">sin atajo</span>
                      )}
                    </span>
                    <button className="tool" onClick={() => setCapture(a.id)}>
                      Cambiar
                    </button>
                    <button
                      className="tool"
                      disabled={!custom}
                      title="Volver al de serie"
                      onClick={() => {
                        const next = { ...keymap }
                        delete next[a.id]
                        updateSettings({ keymap: next })
                      }}
                    >
                      ↺
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => updateSettings({ keymap: {} })}>
            Restablecer todos
          </button>
          <button className="btn primary" onClick={close}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
