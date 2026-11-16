import type { EditForgeApi } from '../../electron/preload'

declare global {
  interface Window {
    /** Puede no existir si la UI se abre en un navegador normal (p. ej. tests visuales). */
    editforge?: EditForgeApi
  }
}

export {}
