import { indexClips, worldMatrix } from './core/layerTransform'
import { appendAssetCmd } from './core/ops'
import * as actions from './state/actions'
import { importPaths } from './state/importMedia'
import { openProject, saveProject } from './state/projectFile'
import { playback, usePlayback } from './state/playback'
import { useProject } from './state/projectStore'
import { useUi } from './state/uiStore'

/** Acceso de depuración desde DevTools y para los smoke tests E2E (scripts/smoke.mjs). */
export const debugApi = { importPaths, playback, useProject, useUi, usePlayback, appendAssetCmd, actions, saveProject, openProject, core: { worldMatrix, indexClips } }

declare global {
  interface Window {
    __ef?: typeof debugApi
  }
}

window.__ef = debugApi
