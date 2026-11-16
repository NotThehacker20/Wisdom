import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  unit?: string
  decimals?: number
  onChange(v: number): void
}

/** Campo numérico estilo After Effects: arrastra la etiqueta para cambiar el valor (Shift ×10, Alt ×0.1). */
export function NumberField({ label, value, step = 1, min = -Infinity, max = Infinity, unit, decimals = 1, onChange }: Props) {
  const [text, setText] = useState(value.toFixed(decimals))
  const [editing, setEditing] = useState(false)
  const drag = useRef<{ x: number; v: number } | null>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (!editing) setText(value.toFixed(decimals))
  }, [value, decimals, editing])

  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  const commit = () => {
    setEditing(false)
    if (cancelled.current) {
      cancelled.current = false
      setText(value.toFixed(decimals))
      return
    }
    const v = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(v)) onChange(clamp(v))
    else setText(value.toFixed(decimals))
  }

  return (
    <label className="numfield">
      <span
        className="numfield-label"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, v: value }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const k = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
          onChange(clamp(drag.current.v + (e.clientX - drag.current.x) * step * k))
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {label}
      </span>
      <input
        value={text}
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          }
          e.stopPropagation()
        }}
      />
      {unit && <span className="numfield-unit">{unit}</span>}
    </label>
  )
}
