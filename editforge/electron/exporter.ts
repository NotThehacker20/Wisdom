import { app, ipcMain, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { buildFfmpegArgs, frameBytes, PNG_PATTERN, type ExportSettings } from './ffmpegArgs'

/**
 * Ruta de FFmpeg: EDITFORGE_FFMPEG, el binario de ffmpeg-static (desempaquetado
 * del asar en la app instalada) o el `ffmpeg` del sistema.
 */
export function ffmpegPath(): string {
  if (process.env.EDITFORGE_FFMPEG) return process.env.EDITFORGE_FFMPEG
  try {
    const p = (createRequire(__filename)('ffmpeg-static') as string | null)?.replace('app.asar', 'app.asar.unpacked')
    if (p && existsSync(p)) return p
  } catch {
    /* sin ffmpeg-static */
  }
  return 'ffmpeg'
}

interface Job {
  proc: ChildProcessWithoutNullStreams
  settings: ExportSettings
  bytes: number
  stderr: string
  exited: Promise<number | null>
  cancelled: boolean
  tempAudio: string | null
}

const jobs = new Map<number, Job>()
let nextId = 1

async function cleanupOutput(s: ExportSettings): Promise<void> {
  try {
    if (s.codec === 'png') {
      const files = await fsp.readdir(s.output)
      const re = new RegExp('^' + PNG_PATTERN.replace('%05d', '\\d{5}').replace('.', '\\.') + '$')
      await Promise.all(files.filter((f) => re.test(f)).map((f) => fsp.unlink(join(s.output, f))))
    } else await fsp.unlink(s.output)
  } catch {
    /* no existía */
  }
}

export function registerExportIpc(): void {
  ipcMain.handle('export:ffmpegInfo', async () => {
    const path = ffmpegPath()
    return new Promise<{ path: string; ok: boolean; version: string }>((resolve) => {
      const p = spawn(path, ['-hide_banner', '-version'])
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      p.on('error', () => resolve({ path, ok: false, version: '' }))
      p.on('close', (code) => resolve({ path, ok: code === 0, version: out.split('\n')[0] ?? '' }))
    })
  })

  /** Inicia FFmpeg. El audio (WAV) llega como bytes y se guarda en un temporal. */
  ipcMain.handle('export:start', async (_e, settings: ExportSettings, wav: Uint8Array | null) => {
    let tempAudio: string | null = null
    if (wav && settings.codec !== 'png') {
      tempAudio = join(app.getPath('temp'), `editforge-audio-${process.pid}-${Date.now()}.wav`)
      await fsp.writeFile(tempAudio, wav)
    }
    if (settings.codec === 'png') await fsp.mkdir(settings.output, { recursive: true })
    const s: ExportSettings = { ...settings, audioPath: tempAudio }
    const proc = spawn(ffmpegPath(), buildFfmpegArgs(s, join), { stdio: ['pipe', 'pipe', 'pipe'] })
    const job: Job = { proc, settings: s, bytes: frameBytes(s), stderr: '', exited: Promise.resolve(null), cancelled: false, tempAudio }
    job.exited = new Promise((resolve) => {
      proc.on('close', (code) => resolve(code))
      proc.on('error', (err) => {
        job.stderr += `\n${err.message}`
        resolve(-1)
      })
    })
    proc.stderr.on('data', (d: Buffer) => {
      job.stderr = (job.stderr + d.toString()).slice(-8000)
    })
    proc.stdout.resume()
    proc.stdin.on('error', () => {
      /* FFmpeg cerró la entrada (error o cancelación): lo informa `exited` */
    })
    const id = nextId++
    jobs.set(id, job)
    return id
  })

  /** Envía un fotograma. Resuelve cuando FFmpeg lo ha aceptado (contrapresión). */
  ipcMain.handle('export:frame', async (_e, id: number, frame: Uint8Array) => {
    const job = jobs.get(id)
    if (!job || job.cancelled) return false
    if (frame.byteLength !== job.bytes) throw new Error(`Fotograma de ${frame.byteLength} bytes, se esperaban ${job.bytes}`)
    if (job.proc.exitCode !== null || job.proc.stdin.destroyed) return false
    const ok = job.proc.stdin.write(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength))
    if (!ok) await new Promise<void>((r) => job.proc.stdin.once('drain', () => r()))
    return true
  })

  /** Cierra la entrada y espera a FFmpeg. */
  ipcMain.handle('export:finish', async (_e, id: number) => {
    const job = jobs.get(id)
    if (!job) return { ok: false, log: 'Trabajo desconocido' }
    job.proc.stdin.end()
    const code = await job.exited
    jobs.delete(id)
    if (job.tempAudio) await fsp.unlink(job.tempAudio).catch(() => undefined)
    if (code !== 0) await cleanupOutput(job.settings)
    return { ok: code === 0, log: job.stderr.split('\n').slice(-25).join('\n') }
  })

  /** Cancela: mata FFmpeg y borra el archivo a medias. */
  ipcMain.handle('export:cancel', async (_e, id: number) => {
    const job = jobs.get(id)
    if (!job) return
    job.cancelled = true
    job.proc.stdin.destroy()
    job.proc.kill('SIGKILL')
    await job.exited
    jobs.delete(id)
    if (job.tempAudio) await fsp.unlink(job.tempAudio).catch(() => undefined)
    await cleanupOutput(job.settings)
  })

  ipcMain.on('shell:showItem', (_e, path: string) => shell.showItemInFolder(path))
}

/** Al cerrar la app, no dejar procesos de FFmpeg huérfanos. */
export function killAllExports(): void {
  for (const job of jobs.values()) job.proc.kill('SIGKILL')
}
