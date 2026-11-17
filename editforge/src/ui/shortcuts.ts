import { useEffect } from 'react'
import { useUi } from '@/state/uiStore'
import { actionFor, comboFromEvent } from './keymap'

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/** Atajos globales, a partir del mapa de teclas (configurable en «Atajos de teclado»). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useUi.getState()
      if (s.capturingKey) return // el editor de atajos está esperando una combinación
      const combo = comboFromEvent(e)
      if (!combo) return
      const action = actionFor(combo)
      // Escribiendo en un campo: solo las acciones «de aplicación» (guardar, exportar…).
      if (isTyping(e) && !action?.app) return
      if (s.exportOpen || s.shortcutsOpen) {
        if (e.key === 'Escape') useUi.setState({ exportOpen: false, shortcutsOpen: false })
        return // con un diálogo abierto, sin atajos de edición
      }
      if (!action) return
      if (action.run() !== false) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
