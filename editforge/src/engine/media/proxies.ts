import type { MediaAsset } from '@/core/types'

export type ProxyKind = 'preview' | 'compat'

/**
 * Registro (en tiempo de ejecución) de proxies disponibles por ruta de medio.
 * No forma parte del proyecto: los proxies son una caché en disco derivada
 * del original, así el .efproj sigue siendo portable.
 *
 *  - compat: copia completa en H.264 de un medio que Chromium no decodifica.
 *    Se usa siempre (previsualización, audio y exportación).
 *  - preview: versión ligera (960 px) solo para la previsualización.
 */
class ProxyRegistry {
  private map = new Map<string, Partial<Record<ProxyKind, string>>>()
  private listeners = new Set<() => void>()
  private _usePreview = true

  get(path: string, kind: ProxyKind): string | undefined {
    return this.map.get(path)?.[kind]
  }

  set(path: string, kind: ProxyKind, proxyPath: string | undefined): void {
    const cur = { ...this.map.get(path) }
    if (cur[kind] === proxyPath) return
    if (proxyPath) cur[kind] = proxyPath
    else delete cur[kind]
    this.map.set(path, cur)
    this.emit()
  }

  get usePreview(): boolean {
    return this._usePreview
  }

  setUsePreview(on: boolean): void {
    if (on === this._usePreview) return
    this._usePreview = on
    this.emit()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}

export const proxies = new ProxyRegistry()

/** Archivo del que se decodifica la imagen del medio. */
export function videoPathFor(asset: MediaAsset, preview: boolean): string {
  if (asset.kind !== 'video') return asset.path
  if (preview && proxies.usePreview) {
    const p = proxies.get(asset.path, 'preview')
    if (p) return p
  }
  return proxies.get(asset.path, 'compat') ?? asset.path
}

/** Archivo del que se decodifica el audio (el proxy compat lleva el audio en AAC). */
export function audioPathFor(asset: MediaAsset): string {
  return asset.kind === 'video' ? (proxies.get(asset.path, 'compat') ?? asset.path) : asset.path
}
