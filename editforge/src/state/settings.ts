import { create } from 'zustand'
import type { EffectInstance, TextAnim, TextStyle } from '@/core/types'

/** Preset de usuario: una pila de efectos o un estilo de texto guardados. */
export interface EffectStackPreset {
  id: string
  name: string
  effects: EffectInstance[]
}
export interface TextStylePreset {
  id: string
  name: string
  style: TextStyle
  animIn?: TextAnim
  animOut?: TextAnim
}

export interface Settings {
  /** Atajos personalizados: id de acción → combinaciones (sustituyen a las de serie). */
  keymap: Record<string, string[]>
  effectPresets: EffectStackPreset[]
  textPresets: TextStylePreset[]
  /** Proxies de previsualización para medios pesados. */
  useProxies: boolean
  /** Caché de fotogramas renderizados (MB aprox.). */
  frameCacheMB: number
  showStats: boolean
}

const DEFAULTS: Settings = { keymap: {}, effectPresets: [], textPresets: [], useProxies: true, frameCacheMB: 512, showStats: false }

/** Ajustes persistentes (se guardan en la carpeta de datos de la app). */
export const useSettings = create<Settings & { loaded: boolean }>(() => ({ ...DEFAULTS, loaded: false }))

let saveTimer: ReturnType<typeof setTimeout> | null = null

export async function loadSettings(): Promise<void> {
  const stored = (await window.editforge?.storeGet<Partial<Settings>>('settings').catch(() => null)) ?? null
  useSettings.setState({ ...DEFAULTS, ...(stored ?? {}), loaded: true })
}

export function updateSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): void {
  useSettings.setState((s) => (typeof patch === 'function' ? patch(s) : patch))
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { loaded: _l, ...data } = useSettings.getState()
    void window.editforge?.storeSet('settings', data)
  }, 250)
}
