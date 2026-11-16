import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Atajos de aplicación que deben funcionar aunque se esté escribiendo (guardar, exportar, abrir, nuevo). */
export function isAppShortcut(e: KeyboardEvent | ReactKeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && ['s', 'e', 'o', 'n'].includes(e.key.toLowerCase())
}

/** Para campos de texto: las teclas se quedan en el campo, salvo los atajos de aplicación. */
export function keepKeysInField(e: ReactKeyboardEvent): void {
  if (!isAppShortcut(e)) e.stopPropagation()
}
