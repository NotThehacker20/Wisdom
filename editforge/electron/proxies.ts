import { app, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { ffmpegPath } from './exporter'
import { buildProxyArgs, parseFfmpegInfo, parseFfmpegTime, type ProxyKind } from './ffmpegArgs'

/**
 * Proxies: caché en disco derivada del archivo (ruta + tamaño + fecha + tipo),
 * así no forman parte del proyecto ni del historial y se reutilizan.
 */
async function proxyPathFor(src: string, kind: ProxyKind): Promise<string> {
  const st = await fsp.stat(src)
  const hash = createHash('sha1').update(`${src}|${st.size}|${st.mtimeMs}|${kind}|v1`).digest('hex').slice(0, 20)
  return join(app.getPath('userData'), 'proxies', `${hash}-${kind}.mp4`)
}

const running = new Map<string, Promise<{ ok: boolean; path: string; log?: string }>>()

export function registerProxyIpc(): void {
  /** Datos de un medio vía FFmpeg (cuando Chromium no puede leerlo). */
  ipcMain.handle('media:probe', async (_e, src: string) => {
    return new Promise((resolve) => {
      const p = spawn(ffmpegPath(), ['-hide_banner', '-i', src])
      let err = ''
      p.stderr.on('data', (d) => (err += d))
      p.on('error', () => resolve(null))
      p.on('close', () => resolve(parseFfmpegInfo(err)))
    })
  })

  /** Ruta del proxy (y si ya existe). */
  ipcMain.handle('proxy:find', async (_e, src: string, kind: ProxyKind) => {
    try {
      const path = await proxyPathFor(src, kind)
      const exists = await fsp.stat(path).then((s) => s.size > 0).catch(() => false)
      return { path, exists }
    } catch {
      return null
    }
  })

  /** Crea el proxy (si no existe) e informa del progreso con 'proxy:progress'. */
  ipcMain.handle('proxy:create', async (e, src: string, kind: ProxyKind, duration: number) => {
    const out = await proxyPathFor(src, kind)
    const key = `${src}|${kind}`
    const existing = running.get(key)
    if (existing) return existing
    const job = (async () => {
      if (await fsp.stat(out).then((s) => s.size > 0).catch(() => false)) return { ok: true, path: out }
      await fsp.mkdir(join(app.getPath('userData'), 'proxies'), { recursive: true })
      const tmp = `${out}.part.mp4`
      return new Promise<{ ok: boolean; path: string; log?: string }>((resolve) => {
        const p = spawn(ffmpegPath(), buildProxyArgs(src, tmp, kind))
        let log = ''
        p.stderr.on('data', (d: Buffer) => {
          const s = d.toString()
          log = (log + s).slice(-4000)
          const t = parseFfmpegTime(s)
          if (t !== null && duration > 0 && !e.sender.isDestroyed()) e.sender.send('proxy:progress', src, kind, Math.min(0.99, t / duration))
        })
        p.on('error', (err) => resolve({ ok: false, path: out, log: err.message }))
        p.on('close', async (code) => {
          if (code === 0) {
            await fsp.rename(tmp, out)
            resolve({ ok: true, path: out })
          } else {
            await fsp.unlink(tmp).catch(() => undefined)
            resolve({ ok: false, path: out, log })
          }
        })
      })
    })()
    running.set(key, job)
    try {
      return await job
    } finally {
      running.delete(key)
    }
  })

  ipcMain.handle('proxy:delete', async (_e, src: string, kind: ProxyKind) => {
    const p = await proxyPathFor(src, kind).catch(() => null)
    if (p) await fsp.unlink(p).catch(() => undefined)
  })
}
