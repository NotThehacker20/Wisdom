import { indexClips, worldMatrix } from './core/layerTransform'
import { listEffects } from './core/effects'
import { setEffectString } from './core/effectOps'
import { setPropValue } from './core/props'
import { listTransitions } from './core/transitions'
import { scheduleAudio } from './engine/audio/schedule'
import { sourceTime } from './core/project'
import { cancelExport, runExport, useExport } from './state/exporter'
import { useAudioAnalysis } from './state/audioAnalysis'
import { appendAssetCmd } from './core/ops'
import * as actions from './state/actions'
import { importPaths } from './state/importMedia'
import { openProject, saveProject } from './state/projectFile'
import { playback, usePlayback } from './state/playback'
import { useProject } from './state/projectStore'
import { useUi } from './state/uiStore'

/** Acceso de depuración desde DevTools y para los smoke tests E2E (scripts/smoke.mjs). */
export const debugApi = { importPaths, playback, useProject, useUi, usePlayback, appendAssetCmd, actions, saveProject, openProject, core: { worldMatrix, indexClips }, effects: { list: listEffects, setPropValue, setEffectString }, transitions: { list: listTransitions }, audio: { scheduleAudio, useAudioAnalysis }, speed: { sourceTime }, exporter: { runExport, cancelExport, useExport } }

declare global {
  interface Window {
    __ef?: typeof debugApi
  }
}

window.__ef = debugApi
