import { useEffect } from 'react'
import { playback } from '@/state/playback'
import { useProject } from '@/state/projectStore'

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/** Atajos globales. La lista completa (J/K/L, C, M, K, Ctrl+D, +/-) se completa en las fases 2–3. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        useProject.getState().undo()
      } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault()
        useProject.getState().redo()
      } else if (e.code === 'Space') {
        e.preventDefault()
        playback.toggle()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        playback.step(e.shiftKey ? -10 : -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        playback.step(e.shiftKey ? 10 : 1)
      } else if (e.key === 'Home') {
        playback.seek(0)
      } else if (e.key === 'End') {
        playback.seek(Infinity)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
