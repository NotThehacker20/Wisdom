import { useRef } from 'react'

interface Props {
  dir: 'x' | 'y'
  onDrag(delta: number): void
}

/** Separador arrastrable entre paneles. */
export function Splitter({ dir, onDrag }: Props) {
  const last = useRef(0)
  return (
    <div
      className={`splitter splitter-${dir}`}
      onPointerDown={(e) => {
        last.current = dir === 'x' ? e.clientX : e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        const pos = dir === 'x' ? e.clientX : e.clientY
        onDrag(pos - last.current)
        last.current = pos
      }}
    />
  )
}
