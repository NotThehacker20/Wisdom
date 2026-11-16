import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  platform: process.platform,
  openMediaDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openMedia'),
  saveProjectDialog: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveProject', defaultName),
  openProjectDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openProject'),
  relinkDialog: (name: string): Promise<string | null> => ipcRenderer.invoke('dialog:relink', name),
  readText: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readText', filePath),
  writeText: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('fs:writeText', filePath, content),
  stat: (filePath: string): Promise<{ size: number; mtimeMs: number } | null> => ipcRenderer.invoke('fs:stat', filePath),
  /** Ruta absoluta de un File soltado desde el explorador (File.path ya no existe en Electron ≥32). */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  setDirty: (dirty: boolean): void => ipcRenderer.send('app:setDirty', dirty),
  setTitle: (title: string): void => ipcRenderer.send('app:setTitle', title),
  confirmClose: (): void => ipcRenderer.send('app:closeConfirmed'),
  onSaveAndClose: (fn: () => void): (() => void) => {
    const h = () => fn()
    ipcRenderer.on('app:saveAndClose', h)
    return () => ipcRenderer.removeListener('app:saveAndClose', h)
  }
}

export type EditForgeApi = typeof api

contextBridge.exposeInMainWorld('editforge', api)
