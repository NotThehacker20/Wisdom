/**
 * Mapa de atajos declarativo: cada acción tiene un id, una descripción, un
 * grupo, sus teclas por defecto y su función. Las teclas se pueden cambiar
 * (se guardan en los ajustes) y la ayuda se genera de aquí.
 *
 * Formato de combinación: modificadores en orden fijo «Ctrl+Alt+Shift+» y la
 * tecla: letras en mayúscula, «Space», «Left», «Up», «Delete», «F9», «+»…
 */
import {
  addMarkerAtPlayhead, addTextAction, copySelectedKeys, createNullParentAction, deleteSelectedKeys, deleteSelection, duplicateSelection,
  easeSelectedKeys, jumpBeat, jumpEdit, jumpKey, pasteKeysAtPlayhead, removeSelectedTransition, selectAll, splitAtPlayhead, toggleKeyAtPlayhead,
  zoomBy, zoomToFit
} from '@/state/actions'
import { playback } from '@/state/playback'
import { newProject, openProject, saveProject } from '@/state/projectFile'
import { useProject } from '@/state/projectStore'
import { updateSettings, useSettings } from '@/state/settings'
import { useUi } from '@/state/uiStore'
export { comboFromEvent, prettyCombo } from './combo'

export interface KeyAction {
  id: string
  label: string
  group: 'Reproducción' | 'Navegación' | 'Edición' | 'Keyframes' | 'Vista' | 'Archivo'
  keys: string[]
  /** Funciona también mientras se escribe en un campo. */
  app?: boolean
  /** Devuelve false si no hizo nada (la tecla sigue su curso). */
  run: () => boolean | void
}

const ui = () => useUi.getState()

export const ACTIONS: KeyAction[] = [
  { id: 'play', label: 'Reproducir / pausa', group: 'Reproducción', keys: ['Space'], run: () => playback.toggle() },
  { id: 'shuttleBack', label: 'Reproducir hacia atrás (más veces: 2×, 4×, 8×)', group: 'Reproducción', keys: ['J'], run: () => playback.shuttle(-1) },
  { id: 'pause', label: 'Pausa', group: 'Reproducción', keys: ['K'], run: () => playback.pause() },
  { id: 'shuttleFwd', label: 'Reproducir hacia delante (más veces: 2×, 4×, 8×)', group: 'Reproducción', keys: ['L'], run: () => playback.shuttle(1) },
  { id: 'frameBack', label: 'Fotograma anterior', group: 'Navegación', keys: ['Left'], run: () => playback.step(-1) },
  { id: 'frameFwd', label: 'Fotograma siguiente', group: 'Navegación', keys: ['Right'], run: () => playback.step(1) },
  { id: 'frameBack10', label: '10 fotogramas atrás', group: 'Navegación', keys: ['Shift+Left'], run: () => playback.step(-10) },
  { id: 'frameFwd10', label: '10 fotogramas adelante', group: 'Navegación', keys: ['Shift+Right'], run: () => playback.step(10) },
  { id: 'prevEdit', label: 'Punto de edición anterior', group: 'Navegación', keys: ['Up'], run: () => jumpEdit(-1) },
  { id: 'nextEdit', label: 'Punto de edición siguiente', group: 'Navegación', keys: ['Down'], run: () => jumpEdit(1) },
  { id: 'prevBeat', label: 'Beat anterior', group: 'Navegación', keys: ['Shift+Up'], run: () => jumpBeat(-1) },
  { id: 'nextBeat', label: 'Beat siguiente', group: 'Navegación', keys: ['Shift+Down'], run: () => jumpBeat(1) },
  { id: 'start', label: 'Ir al principio', group: 'Navegación', keys: ['Home'], run: () => playback.seek(0) },
  { id: 'end', label: 'Ir al final', group: 'Navegación', keys: ['End'], run: () => playback.seek(Infinity) },
  { id: 'split', label: 'Cortar en el cabezal', group: 'Edición', keys: ['C'], run: splitAtPlayhead },
  {
    id: 'delete',
    label: 'Eliminar (keyframes, transición o clips seleccionados)',
    group: 'Edición',
    keys: ['Delete', 'Backspace'],
    run: () => {
      if (!deleteSelectedKeys() && !removeSelectedTransition()) deleteSelection(false)
    }
  },
  { id: 'ripple', label: 'Eliminar cerrando el hueco (ripple)', group: 'Edición', keys: ['Shift+Delete', 'Shift+Backspace'], run: () => deleteSelection(true) },
  { id: 'duplicate', label: 'Duplicar', group: 'Edición', keys: ['Ctrl+D'], run: duplicateSelection },
  { id: 'marker', label: 'Marcador en el cabezal', group: 'Edición', keys: ['M'], run: addMarkerAtPlayhead },
  { id: 'text', label: 'Texto en el cabezal', group: 'Edición', keys: ['T'], run: () => addTextAction() },
  { id: 'nullParent', label: 'Null padre para la selección', group: 'Edición', keys: ['Shift+N'], run: createNullParentAction },
  { id: 'selectAll', label: 'Seleccionar todos los clips', group: 'Edición', keys: ['Ctrl+A'], run: selectAll },
  { id: 'undo', label: 'Deshacer', group: 'Edición', keys: ['Ctrl+Z'], run: () => useProject.getState().undo() },
  { id: 'redo', label: 'Rehacer', group: 'Edición', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], run: () => useProject.getState().redo() },
  {
    id: 'escape',
    label: 'Deseleccionar',
    group: 'Edición',
    keys: ['Escape'],
    run: () => {
      if (ui().selectedKeys.length) ui().selectKeys([])
      else {
        ui().selectClips([])
        ui().selectMarker(null)
        ui().selectTransition(null)
      }
    }
  },
  { id: 'keyframe', label: 'Keyframe en el cabezal', group: 'Keyframes', keys: ['Alt+K'], run: toggleKeyAtPlayhead },
  { id: 'prevKey', label: 'Keyframe anterior', group: 'Keyframes', keys: ['Alt+Left'], run: () => jumpKey(-1) },
  { id: 'nextKey', label: 'Keyframe siguiente', group: 'Keyframes', keys: ['Alt+Right'], run: () => jumpKey(1) },
  { id: 'easyEase', label: 'Easy ease en los keyframes seleccionados', group: 'Keyframes', keys: ['F9'], run: () => easeSelectedKeys('easeInOut') },
  { id: 'copyKeys', label: 'Copiar keyframes', group: 'Keyframes', keys: ['Ctrl+C'], run: copySelectedKeys },
  { id: 'pasteKeys', label: 'Pegar keyframes en el cabezal', group: 'Keyframes', keys: ['Ctrl+V'], run: pasteKeysAtPlayhead },
  { id: 'snap', label: 'Snap sí / no', group: 'Vista', keys: ['S'], run: () => ui().setSnap(!ui().snapEnabled) },
  { id: 'zoomIn', label: 'Acercar la timeline', group: 'Vista', keys: ['+', '='], run: () => zoomBy(1.4) },
  { id: 'zoomOut', label: 'Alejar la timeline', group: 'Vista', keys: ['-'], run: () => zoomBy(1 / 1.4) },
  { id: 'zoomFit', label: 'Ajustar la timeline a la ventana', group: 'Vista', keys: ['Shift+Z'], run: zoomToFit },
  { id: 'stats', label: 'Estadísticas de rendimiento en el visor', group: 'Vista', keys: ['F2'], run: () => updateSettings((s) => ({ showStats: !s.showStats })) },
  { id: 'new', label: 'Nuevo proyecto', group: 'Archivo', keys: ['Ctrl+N'], app: true, run: newProject },
  { id: 'open', label: 'Abrir proyecto', group: 'Archivo', keys: ['Ctrl+O'], app: true, run: () => void openProject() },
  { id: 'save', label: 'Guardar', group: 'Archivo', keys: ['Ctrl+S'], app: true, run: () => void saveProject() },
  { id: 'saveAs', label: 'Guardar como', group: 'Archivo', keys: ['Ctrl+Shift+S'], app: true, run: () => void saveProject(true) },
  { id: 'export', label: 'Exportar', group: 'Archivo', keys: ['Ctrl+E'], app: true, run: () => useUi.setState({ exportOpen: true }) },
  { id: 'shortcuts', label: 'Atajos de teclado', group: 'Archivo', keys: ['Ctrl+,'], app: true, run: () => useUi.setState({ shortcutsOpen: true }) }
]

/** Teclas efectivas de una acción (las del usuario o las de serie). */
export function keysOf(a: KeyAction, keymap = useSettings.getState().keymap): string[] {
  return keymap[a.id] ?? a.keys
}

/** Acción asociada a una combinación. */
export function actionFor(combo: string, keymap = useSettings.getState().keymap): KeyAction | undefined {
  return ACTIONS.find((a) => keysOf(a, keymap).includes(combo))
}

/** Otras acciones que ya usan esa combinación. */
export function conflictsFor(id: string, combo: string, keymap = useSettings.getState().keymap): KeyAction[] {
  return ACTIONS.filter((a) => a.id !== id && keysOf(a, keymap).includes(combo))
}

