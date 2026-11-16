import { useEffect } from 'react'
import {
  addMarkerAtPlayhead, copySelectedKeys, deleteSelectedKeys, deleteSelection, duplicateSelection, easeSelectedKeys, jumpEdit, jumpKey,
  pasteKeysAtPlayhead, selectAll, splitAtPlayhead, toggleKeyAtPlayhead, zoomBy, zoomToFit
} from '@/state/actions'
import { playback } from '@/state/playback'
import { newProject, openProject, saveProject } from '@/state/projectFile'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/** Lista de atajos (también se muestra en la ayuda). */
export const SHORTCUTS: Array<[string, string]> = [
  ['Espacio', 'Reproducir / pausa'],
  ['J / K / L', 'Atrás / pausa / adelante (pulsa varias veces para 2×, 4×, 8×)'],
  ['← / →', 'Fotograma anterior / siguiente (Mayús: 10)'],
  ['↑ / ↓', 'Punto de edición anterior / siguiente'],
  ['Inicio / Fin', 'Ir al principio / al final'],
  ['C', 'Cortar en el cabezal (selección o todas las pistas)'],
  ['Supr', 'Eliminar selección'],
  ['Mayús+Supr', 'Eliminar cerrando el hueco (ripple)'],
  ['Ctrl+D', 'Duplicar'],
  ['M', 'Marcador en el cabezal'],
  ['Alt+K', 'Keyframe en el cabezal (propiedad activa, o posición/escala/rotación/opacidad)'],
  ['Alt+← / Alt+→', 'Keyframe anterior / siguiente'],
  ['F9', 'Easy ease (ease in/out) en los keyframes seleccionados'],
  ['Ctrl+C / Ctrl+V', 'Copiar / pegar keyframes seleccionados en el cabezal'],
  ['S', 'Activar / desactivar snap (Alt mientras arrastras lo ignora)'],
  ['+ / −', 'Zoom de la timeline'],
  ['Mayús+Z', 'Ajustar la timeline a la ventana'],
  ['Ctrl+A', 'Seleccionar todos los clips'],
  ['Ctrl+Z / Ctrl+Y', 'Deshacer / rehacer'],
  ['Ctrl+N / Ctrl+O', 'Nuevo / abrir proyecto'],
  ['Ctrl+S / Ctrl+Mayús+S', 'Guardar / guardar como'],
  ['Esc', 'Deseleccionar']
]

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      const handled = (() => {
        if (mod) {
          switch (k) {
            case 'z':
              if (e.shiftKey) useProject.getState().redo()
              else useProject.getState().undo()
              return true
            case 'y':
              useProject.getState().redo()
              return true
            case 'd':
              duplicateSelection()
              return true
            case 'a':
              selectAll()
              return true
            case 's':
              void saveProject(e.shiftKey)
              return true
            case 'o':
              void openProject()
              return true
            case 'n':
              newProject()
              return true
            case 'c':
              return copySelectedKeys()
            case 'v':
              return pasteKeysAtPlayhead()
          }
          return false
        }
        if (e.altKey) {
          if (k === 'k') {
            toggleKeyAtPlayhead()
            return true
          }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            jumpKey(e.key === 'ArrowLeft' ? -1 : 1)
            return true
          }
          return false
        }
        if (e.key === 'F9') {
          easeSelectedKeys('easeInOut')
          return true
        }
        switch (e.key) {
          case ' ':
            playback.toggle()
            return true
          case 'ArrowLeft':
            playback.step(e.shiftKey ? -10 : -1)
            return true
          case 'ArrowRight':
            playback.step(e.shiftKey ? 10 : 1)
            return true
          case 'ArrowUp':
            jumpEdit(-1)
            return true
          case 'ArrowDown':
            jumpEdit(1)
            return true
          case 'Home':
            playback.seek(0)
            return true
          case 'End':
            playback.seek(Infinity)
            return true
          case 'Delete':
          case 'Backspace':
            // Los keyframes seleccionados tienen prioridad sobre los clips.
            if (!deleteSelectedKeys()) deleteSelection(e.shiftKey)
            return true
          case 'Escape':
            if (useUi.getState().selectedKeys.length) useUi.getState().selectKeys([])
            else {
              useUi.getState().selectClips([])
              useUi.getState().selectMarker(null)
            }
            return true
          case '+':
          case '=':
            zoomBy(1.4)
            return true
          case '-':
          case '_':
            zoomBy(1 / 1.4)
            return true
        }
        switch (k) {
          case 'j':
            playback.shuttle(-1)
            return true
          case 'k':
            playback.pause()
            return true
          case 'l':
            playback.shuttle(1)
            return true
          case 'c':
            splitAtPlayhead()
            return true
          case 'm':
            addMarkerAtPlayhead()
            return true
          case 's':
            useUi.getState().setSnap(!useUi.getState().snapEnabled)
            return true
          case 'z':
            if (e.shiftKey) {
              zoomToFit()
              return true
            }
        }
        return false
      })()
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
