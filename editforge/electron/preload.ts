import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  platform: process.platform,
  openMediaDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openMedia'),
  stat: (filePath: string): Promise<{ size: number; mtimeMs: number } | null> => ipcRenderer.invoke('fs:stat', filePath),
  /** Ruta absoluta de un File soltado desde el explorador (File.path ya no existe en Electron ≥32). */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type EditForgeApi = typeof api

contextBridge.exposeInMainWorld('editforge', api)
