import { appendAssetCmd } from './core/ops'
import { importPaths } from './state/importMedia'
import { playback, usePlayback } from './state/playback'
import { useProject } from './state/projectStore'
import { useUi } from './state/uiStore'

/** Acceso de depuración desde DevTools y para los smoke tests E2E (scripts/smoke.mjs). */
export const debugApi = { importPaths, playback, useProject, useUi, usePlayback, appendAssetCmd }

declare global {
  interface Window {
    __ef?: typeof debugApi
  }
}

window.__ef = debugApi
