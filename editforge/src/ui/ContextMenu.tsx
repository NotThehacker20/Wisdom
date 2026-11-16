import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'

export interface MenuItem {
  label: string
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  action?: () => void
  separator?: boolean
}

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null
}

const useMenu = create<MenuState>(() => ({ menu: null }))

export function openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void }, items: MenuItem[]): void {
  e.preventDefault()
  useMenu.setState({ menu: { x: e.clientX, y: e.clientY, items } })
}

export function closeContextMenu(): void {
  useMenu.setState({ menu: null })
}

/** Menú contextual único de la app (se monta una vez en App). */
export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 4), y: Math.min(menu.y, window.innerHeight - r.height - 4) })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      closeContextMenu()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('blur', closeContextMenu)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', closeContextMenu)
    }
  }, [menu])

  if (!menu) return null
  return (
    <div className="context-menu" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="cm-sep" />
        ) : (
          <button
            key={i}
            className={`cm-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              closeContextMenu()
              it.action?.()
            }}
          >
            <span>{it.label}</span>
            {it.shortcut && <kbd>{it.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  )
}
