import { create } from 'zustand'
import type { KeyRef, PropPath } from '@/core/props'

export type LeftTab = 'media' | 'effects' | 'transitions'
export type BottomTab = 'timeline' | 'graph'

export interface Toast {
  id: number
  kind: 'info' | 'error'
  text: string
}

interface Layout {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
}

const LAYOUT_KEY = 'editforge.layout'

function loadLayout(): Layout {
  const def: Layout = { leftWidth: 320, rightWidth: 320, bottomHeight: 300 }
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>) }
  } catch {
    return def
  }
}

interface UiState {
  leftTab: LeftTab
  bottomTab: BottomTab
  selectedAssetId: string | null
  selectedClipIds: string[]
  selectedMarkerId: string | null
  snapEnabled: boolean
  /** Propiedad «activa» (la última tocada): destino de Alt+K y de pegar keyframes. */
  activeProp: { clipId: string; path: PropPath } | null
  selectedKeys: KeyRef[]
  /** Propiedades cuyas curvas se ven en el graph editor. */
  graphPaths: PropPath[]
  quality: number
  thumbnails: Record<string, string>
  importing: number
  toasts: Toast[]
  layout: Layout
  timelineZoom: number
  /** Ancho visible de la zona de pistas (para «ajustar a la ventana»). */
  timelineViewportWidth: number
  setLeftTab(t: LeftTab): void
  setBottomTab(t: BottomTab): void
  selectAsset(id: string | null): void
  /** Selecciona clips. `mode`: reemplazar, alternar (Ctrl) o añadir (Shift / marco). */
  selectClips(ids: string[], mode?: 'replace' | 'toggle' | 'add'): void
  selectMarker(id: string | null): void
  setSnap(on: boolean): void
  setActiveProp(clipId: string, path: PropPath, addToGraph?: boolean): void
  selectKeys(keys: KeyRef[], mode?: 'replace' | 'toggle' | 'add'): void
  setGraphPaths(paths: PropPath[]): void
  setQuality(q: number): void
  setThumbnail(assetId: string, url: string): void
  setImporting(delta: number): void
  toast(kind: Toast['kind'], text: string): void
  dismissToast(id: number): void
  setLayout(l: Partial<Layout>): void
  setTimelineZoom(z: number): void
}

let toastId = 0

export const useUi = create<UiState>((set, get) => ({
  leftTab: 'media',
  bottomTab: 'timeline',
  selectedAssetId: null,
  selectedClipIds: [],
  selectedMarkerId: null,
  snapEnabled: true,
  activeProp: null,
  selectedKeys: [],
  graphPaths: ['transform.x'],
  quality: 0.5,
  thumbnails: {},
  importing: 0,
  toasts: [],
  layout: loadLayout(),
  timelineZoom: 60,
  timelineViewportWidth: 0,
  setLeftTab: (leftTab) => set({ leftTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  selectClips(ids, mode = 'replace') {
    const cur = get().selectedClipIds
    let next: string[]
    if (mode === 'replace') next = ids
    else if (mode === 'add') next = [...new Set([...cur, ...ids])]
    else {
      const s = new Set(cur)
      for (const id of ids) {
        if (s.has(id)) s.delete(id)
        else s.add(id)
      }
      next = [...s]
    }
    const changed = next.length !== cur.length || next.some((id, i) => id !== cur[i])
    set({ selectedClipIds: next, selectedMarkerId: null, ...(changed ? { selectedKeys: [] } : {}) })
  },
  selectMarker: (selectedMarkerId) => set({ selectedMarkerId }),
  setSnap: (snapEnabled) => set({ snapEnabled }),
  setActiveProp(clipId, path, addToGraph) {
    const g = get().graphPaths
    set({ activeProp: { clipId, path }, graphPaths: addToGraph ? (g.includes(path) ? g : [...g, path]) : [path] })
  },
  selectKeys(keys, mode = 'replace') {
    const id = (k: KeyRef) => `${k.clipId}|${k.path}|${k.id}`
    const cur = get().selectedKeys
    if (mode === 'replace') return set({ selectedKeys: keys })
    const map = new Map(cur.map((k) => [id(k), k]))
    for (const k of keys) {
      if (mode === 'toggle' && map.has(id(k))) map.delete(id(k))
      else map.set(id(k), k)
    }
    set({ selectedKeys: [...map.values()] })
  },
  setGraphPaths: (graphPaths) => set({ graphPaths }),
  setQuality: (quality) => set({ quality }),
  setThumbnail: (id, url) => set({ thumbnails: { ...get().thumbnails, [id]: url } }),
  setImporting: (d) => set({ importing: Math.max(0, get().importing + d) }),
  toast(kind, text) {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, kind, text }] })
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setLayout(l) {
    const layout = { ...get().layout, ...l }
    set({ layout })
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      /* sin almacenamiento */
    }
  },
  setTimelineZoom: (z) => set({ timelineZoom: Math.min(1500, Math.max(2, z)) })
}))
