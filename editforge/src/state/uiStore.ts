import { create } from 'zustand'

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
  selectedClipId: string | null
  quality: number
  thumbnails: Record<string, string>
  importing: number
  toasts: Toast[]
  layout: Layout
  timelineZoom: number
  setLeftTab(t: LeftTab): void
  setBottomTab(t: BottomTab): void
  selectAsset(id: string | null): void
  selectClip(id: string | null): void
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
  selectedClipId: null,
  quality: 0.5,
  thumbnails: {},
  importing: 0,
  toasts: [],
  layout: loadLayout(),
  timelineZoom: 60,
  setLeftTab: (leftTab) => set({ leftTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  selectClip: (selectedClipId) => set({ selectedClipId }),
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
  setTimelineZoom: (z) => set({ timelineZoom: Math.min(800, Math.max(5, z)) })
}))
