import { useState } from 'react'
import { keepKeysInField } from './keys'

/** «Guardar como preset…»: pide un nombre en línea (window.prompt no existe en Electron). */
export function SavePreset({ label, placeholder, onSave }: { label: string; placeholder: string; onSave: (name: string) => boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  if (!editing) {
    return (
      <button className="btn small-btn save-preset" onClick={() => setEditing(true)}>
        {label}
      </button>
    )
  }
  const commit = () => {
    if (onSave(name)) {
      setEditing(false)
      setName('')
    }
  }
  return (
    <div className="save-preset-row">
      <input
        className="text-input"
        autoFocus
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          keepKeysInField(e)
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <button className="btn primary small-btn" disabled={!name.trim()} onClick={commit}>
        Guardar
      </button>
    </div>
  )
}
