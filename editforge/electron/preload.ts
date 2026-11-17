import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ExportSettings, MediaInfo, ProxyKind } from './ffmpegArgs'

const api = {
  platform: process.platform,
  openMediaDialog: (): Promise<string[]> => ipcRenderer.invoke('dialog:openMedia'),
  saveProjectDialog: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('dialog:saveProject', defaultName),
  openProjectDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openProject'),
  relinkDialog: (name: string): Promise<string | null> => ipcRenderer.invoke('dialog:relink', name),
  openFileDialog: (title: string, extensions: string[]): Promise<string | null> => ipcRenderer.invoke('dialog:openFile', title, extensions),
  exportFileDialog: (defaultName: string, ext: string): Promise<string | null> => ipcRenderer.invoke('dialog:exportFile', defaultName, ext),
  ffmpegInfo: (): Promise<{ path: string; ok: boolean; version: string }> => ipcRenderer.invoke('export:ffmpegInfo'),
  exportStart: (settings: ExportSettings, wav: Uint8Array | null): Promise<number> => ipcRenderer.invoke('export:start', settings, wav),
  exportFrame: (id: number, frame: Uint8Array): Promise<boolean> => ipcRenderer.invoke('export:frame', id, frame),
  exportFinish: (id: number): Promise<{ ok: boolean; log: string }> => ipcRenderer.invoke('export:finish', id),
  exportCancel: (id: number): Promise<void> => ipcRenderer.invoke('export:cancel', id),
  showItemInFolder: (path: string): void => ipcRenderer.send('shell:showItem', path),
  storeGet: <T = unknown>(name: string): Promise<T | null> => ipcRenderer.invoke('store:get', name),
  storeSet: (name: string, data: unknown): Promise<void> => ipcRenderer.invoke('store:set', name, data),
  probeMedia: (path: string): Promise<MediaInfo | null> => ipcRenderer.invoke('media:probe', path),
  proxyFind: (path: string, kind: ProxyKind): Promise<{ path: string; exists: boolean } | null> => ipcRenderer.invoke('proxy:find', path, kind),
  proxyCreate: (path: string, kind: ProxyKind, duration: number): Promise<{ ok: boolean; path: string; log?: string }> =>
    ipcRenderer.invoke('proxy:create', path, kind, duration),
  proxyDelete: (path: string, kind: ProxyKind): Promise<void> => ipcRenderer.invoke('proxy:delete', path, kind),
  onProxyProgress: (fn: (path: string, kind: ProxyKind, ratio: number) => void): (() => void) => {
    const h = (_e: unknown, path: string, kind: ProxyKind, ratio: number) => fn(path, kind, ratio)
    ipcRenderer.on('proxy:progress', h)
    return () => ipcRenderer.removeListener('proxy:progress', h)
  },
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
