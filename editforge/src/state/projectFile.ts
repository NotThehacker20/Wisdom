import { basename } from '@/core/paths'
import { createProject } from '@/core/project'
import { parseProject, serializeProject } from '@/core/serialize'
import type { Project } from '@/core/types'
import { makeThumbnail } from '@/engine/media/probe'
import { playback } from './playback'
import { isDirty, useProject } from './projectStore'
import { useUi } from './uiStore'

const api = () => window.editforge

function confirmDiscard(): boolean {
  if (!isDirty(useProject.getState())) return true
  return window.confirm('El proyecto actual tiene cambios sin guardar. ¿Descartarlos?')
}

function regenerateThumbnails(p: Project): void {
  for (const a of Object.values(p.assets)) {
    if (a.missing) continue
    void makeThumbnail(a)
      .then((url) => url && useUi.getState().setThumbnail(a.id, url))
      .catch(() => undefined)
  }
}

export function newProject(): void {
  if (!confirmDiscard()) return
  playback.pause()
  useProject.getState().load(createProject(), null)
  useUi.setState({ selectedClipIds: [], selectedAssetId: null, selectedMarkerId: null, thumbnails: {} })
  playback.seek(0)
}

export async function openProject(path?: string): Promise<void> {
  const a = api()
  if (!a || !confirmDiscard()) return
  const file = path ?? (await a.openProjectDialog())
  if (!file) return
  const ui = useUi.getState()
  try {
    const { project, candidates } = parseProject(await a.readText(file), file)
    const missing: string[] = []
    // Buscamos cada medio: primero la ruta relativa al proyecto, luego la absoluta guardada.
    await Promise.all(
      Object.values(project.assets).map(async (asset) => {
        for (const c of candidates[asset.id] ?? []) {
          if (await a.stat(c)) {
            asset.path = c
            asset.missing = false
            return
          }
        }
        asset.missing = true
        missing.push(asset.name)
      })
    )
    playback.pause()
    useProject.getState().load(project, file)
    useUi.setState({ selectedClipIds: [], selectedAssetId: null, selectedMarkerId: null, thumbnails: {} })
    playback.seek(0)
    regenerateThumbnails(project)
    if (missing.length) ui.toast('error', `No se encontraron ${missing.length} medio(s): ${missing.join(', ')}. Revincúlalos desde el inspector.`)
    else ui.toast('info', `Proyecto abierto: ${basename(file)}`)
  } catch (e) {
    ui.toast('error', `No se pudo abrir el proyecto: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Guarda el proyecto. Devuelve false si el usuario canceló o falló. */
export async function saveProject(saveAs = false, forcedPath?: string): Promise<boolean> {
  const a = api()
  const ui = useUi.getState()
  if (!a) {
    ui.toast('error', 'Guardar necesita la app de escritorio (Electron).')
    return false
  }
  const st = useProject.getState()
  let file = forcedPath ?? st.filePath
  if (!file || (saveAs && !forcedPath)) {
    file = await a.saveProjectDialog(st.project.name || 'Sin título')
    if (!file) return false
  }
  // El nombre del proyecto sigue al del archivo.
  const name = basename(file).replace(/\.efproj$/i, '')
  let project = useProject.getState().project
  if (project.name !== name) {
    useProject.getState().apply('Renombrar proyecto', (p) => ({ ...p, name }))
    project = useProject.getState().project
  }
  try {
    await a.writeText(file, serializeProject(project, file))
    useProject.getState().markSaved(file)
    ui.toast('info', `Guardado: ${basename(file)}`)
    return true
  } catch (e) {
    ui.toast('error', `Error al guardar: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

/** Sustituye la ruta de un medio que no se encontró. */
export async function relinkAsset(assetId: string): Promise<void> {
  const a = api()
  const asset = useProject.getState().project.assets[assetId]
  if (!a || !asset) return
  const path = await a.relinkDialog(asset.name)
  if (!path) return
  useProject.getState().apply(`Revincular ${asset.name}`, (p) => ({
    ...p,
    assets: { ...p.assets, [assetId]: { ...p.assets[assetId], path, missing: false } }
  }))
  const updated = useProject.getState().project.assets[assetId]
  void makeThumbnail(updated).then((url) => url && useUi.getState().setThumbnail(assetId, url))
}

/** Sincroniza título de ventana y estado «sucio» con el proceso principal; gestiona guardar al cerrar. */
export function initProjectFileSync(): () => void {
  const a = api()
  const sync = () => {
    const s = useProject.getState()
    const dirty = isDirty(s)
    const name = s.filePath ? basename(s.filePath) : 'Sin título'
    const title = `${dirty ? '● ' : ''}${name} — EditForge`
    document.title = title
    a?.setTitle(title)
    a?.setDirty(dirty)
  }
  sync()
  const unsub = useProject.subscribe(sync)
  const off = a?.onSaveAndClose(async () => {
    if (await saveProject()) a.confirmClose()
  })
  return () => {
    unsub()
    off?.()
  }
}
