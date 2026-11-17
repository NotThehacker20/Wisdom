/** Normalización y presentación de combinaciones de teclas (puro). */

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Esc: 'Escape', Del: 'Delete'
}

/** Combinación normalizada de un evento de teclado («Ctrl+Shift+S», «Alt+Left», «+»…). */
export function comboFromEvent(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
  let key = KEY_NAMES[e.key] ?? e.key
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(key)) return null
  if (key.length === 1) key = key.toUpperCase()
  // En signos de puntuación Mayús depende de la distribución del teclado («+» puede necesitarla): la ignoramos.
  const printable = key.length === 1 && !/[A-Z0-9]/.test(key)
  const mods = [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && !printable && 'Shift'].filter(Boolean)
  return [...mods, key].join('+')
}


const PRETTY: Record<string, string> = { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Mayús', Space: 'Espacio', Left: '←', Right: '→', Up: '↑', Down: '↓', Delete: 'Supr', Backspace: '⌫', Escape: 'Esc', Home: 'Inicio', End: 'Fin' }
export const prettyCombo = (c: string): string => c.split('+').map((p) => PRETTY[p] ?? p).join('+').replace('++', '+ +')
