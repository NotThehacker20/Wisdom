import { addAssetsCmd } from '@/core/ops'
import type { MediaAsset } from '@/core/types'
import { baseName, kindFromPath, makeThumbnail, probeMedia } from '@/engine/media/probe'
import { useProject } from './projectStore'
import { useUi } from './uiStore'

export async function importPaths(paths: string[]): Promise<MediaAsset[]> {
  const ui = useUi.getState()
  const existing = new Set(Object.values(useProject.getState().project.assets).map((a) => a.path))
  const todo = paths.filter((p) => {
    if (existing.has(p)) return false
    if (!kindFromPath(p)) {
      ui.toast('error', `Formato no soportado: ${baseName(p)}`)
      return false
    }
    return true
  })
  if (todo.length === 0) return []
  ui.setImporting(todo.length)
  const assets: MediaAsset[] = []
  await Promise.all(
    todo.map(async (p) => {
      try {
        assets.push(await probeMedia(p))
      } catch (e) {
        ui.toast('error', `${baseName(p)}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        ui.setImporting(-1)
      }
    })
  )
  if (assets.length) {
    // Respeta el orden en que se seleccionaron.
    assets.sort((a, b) => todo.indexOf(a.path) - todo.indexOf(b.path))
    useProject.getState().dispatch(addAssetsCmd(assets))
    for (const a of assets) {
      void makeThumbnail(a)
        .then((url) => url && useUi.getState().setThumbnail(a.id, url))
        .catch((e) => console.warn('[EditForge] miniatura', e))
    }
  }
  return assets
}

export async function importViaDialog(): Promise<void> {
  const api = window.editforge
  if (!api) {
    useUi.getState().toast('error', 'La importación necesita la app de escritorio (Electron).')
    return
  }
  const paths = await api.openMediaDialog()
  if (paths.length) await importPaths(paths)
}

export function pathsFromDrop(e: DragEvent | React.DragEvent): string[] {
  const api = window.editforge
  if (!api || !e.dataTransfer) return []
  return Array.from(e.dataTransfer.files)
    .map((f) => {
      try {
        return api.getPathForFile(f)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}
