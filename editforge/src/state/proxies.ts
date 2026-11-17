import { create } from 'zustand'
import type { MediaAsset, Project } from '@/core/types'
import { createFrameSource } from '@/engine/media/createSource'
import { makeThumbnail } from '@/engine/media/probe'
import { proxies, type ProxyKind } from '@/engine/media/proxies'
import { useProject } from './projectStore'
import { useSettings } from './settings'
import { useUi } from './uiStore'

/** Lado mayor a partir del cual se crea automáticamente un proxy de previsualización. */
export const HEAVY_SIDE = 2560

export type ProxyState = { state: 'creating'; progress: number } | { state: 'ready'; path: string } | { state: 'error'; message: string }

interface ProxyStore {
  /** Por ruta del medio original y tipo de proxy. */
  jobs: Record<string, Partial<Record<ProxyKind, ProxyState>>>
  /** Medios que Chromium no puede decodificar (hace falta proxy compat). */
  undecodable: Record<string, boolean>
}

export const useProxies = create<ProxyStore>(() => ({ jobs: {}, undecodable: {} }))

function setJob(path: string, kind: ProxyKind, st: ProxyState | undefined): void {
  useProxies.setState((s) => {
    const cur = { ...s.jobs[path] }
    if (st) cur[kind] = st
    else delete cur[kind]
    return { jobs: { ...s.jobs, [path]: cur } }
  })
}

let progressHooked = false
function hookProgress(): void {
  if (progressHooked || !window.editforge) return
  progressHooked = true
  window.editforge.onProxyProgress((path, kind, ratio) => {
    const cur = useProxies.getState().jobs[path]?.[kind]
    if (cur?.state === 'creating') setJob(path, kind, { state: 'creating', progress: ratio })
  })
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))])
}

/** ¿Chromium decodifica la imagen del archivo original? */
export async function canDecode(asset: MediaAsset): Promise<boolean> {
  if (asset.kind !== 'video' || !asset.hasVideo) return true
  try {
    const src = await withTimeout(createFrameSource(asset, { path: asset.path }), 10000)
    if (!src) return false
    try {
      const f = await withTimeout(src.getFrame(Math.min(0.1, asset.duration / 2), { playing: false }), 10000)
      return !!f && f.width > 0 && f.height > 0
    } finally {
      src.dispose()
    }
  } catch {
    return false
  }
}

function refreshThumbnail(asset: MediaAsset): void {
  void makeThumbnail(asset)
    .then((url) => url && useUi.getState().setThumbnail(asset.id, url))
    .catch(() => undefined)
}

/** Crea (o reutiliza del disco) un proxy y lo activa. */
export async function createProxy(asset: MediaAsset, kind: ProxyKind): Promise<boolean> {
  const api = window.editforge
  if (!api || asset.kind !== 'video') return false
  const cur = useProxies.getState().jobs[asset.path]?.[kind]
  if (cur?.state === 'creating') return false
  hookProgress()
  setJob(asset.path, kind, { state: 'creating', progress: 0 })
  const res = await api.proxyCreate(asset.path, kind, asset.duration)
  if (res.ok) {
    setJob(asset.path, kind, { state: 'ready', path: res.path })
    proxies.set(asset.path, kind, res.path)
    if (kind === 'compat') refreshThumbnail(asset)
    return true
  }
  console.warn('[EditForge] proxy fallido', res.log)
  setJob(asset.path, kind, { state: 'error', message: 'FFmpeg no pudo crear el proxy' })
  useUi.getState().toast('error', `No se pudo crear el proxy de ${asset.name}`)
  return false
}

/** Quita un proxy (y borra su archivo de la caché). */
export async function removeProxy(asset: MediaAsset, kind: ProxyKind): Promise<void> {
  proxies.set(asset.path, kind, undefined)
  setJob(asset.path, kind, undefined)
  await window.editforge?.proxyDelete(asset.path, kind)
}

/**
 * Revisa los medios nuevos del proyecto (importados o cargados): recupera los
 * proxies que ya existen en disco, crea el de compatibilidad si Chromium no
 * puede decodificar el original y, con «Usar proxies», el de previsualización
 * para medios muy pesados (4K…).
 */
const checked = new Set<string>()
export async function syncProxies(project: Project): Promise<void> {
  const api = window.editforge
  if (!api) return
  for (const asset of Object.values(project.assets)) {
    if (asset.kind !== 'video' || asset.missing || checked.has(asset.path)) continue
    checked.add(asset.path)
    void (async () => {
      for (const kind of ['compat', 'preview'] as const) {
        const found = await api.proxyFind(asset.path, kind)
        if (found?.exists) {
          proxies.set(asset.path, kind, found.path)
          setJob(asset.path, kind, { state: 'ready', path: found.path })
        }
      }
      if (!proxies.get(asset.path, 'compat') && !(await canDecode(asset))) {
        useProxies.setState((s) => ({ undecodable: { ...s.undecodable, [asset.path]: true } }))
        useUi.getState().toast('info', `${asset.name}: formato no compatible, creando proxy…`)
        await createProxy(asset, 'compat')
      }
      const heavy = Math.max(asset.width, asset.height) > HEAVY_SIDE
      if (heavy && useSettings.getState().useProxies && !proxies.get(asset.path, 'preview')) await createProxy(asset, 'preview')
    })()
  }
}

/** Conecta el registro con el proyecto y los ajustes. */
export function initProxies(): void {
  let assets: Project['assets'] | null = null
  const run = (p: Project) => {
    if (p.assets === assets) return
    assets = p.assets
    void syncProxies(p)
  }
  run(useProject.getState().project)
  useProject.subscribe((s) => run(s.project))
  proxies.setUsePreview(useSettings.getState().useProxies)
  useSettings.subscribe((s) => proxies.setUsePreview(s.useProxies))
}
