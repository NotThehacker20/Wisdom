import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { createReadStream, promises as fsp } from 'node:fs'
import { extname, join } from 'node:path'
import { killAllExports, registerExportIpc } from './exporter'
import { registerProxyIpc } from './proxies'
import { Readable } from 'node:stream'

/**
 * Esquema `media://` para servir archivos locales al renderer con soporte de
 * peticiones Range (necesario para buscar en <video> y para leer por trozos).
 * URL: media://local/<encodeURIComponent(rutaAbsoluta)>
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
  }
])

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac'
}

async function handleMedia(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const filePath = decodeURIComponent(url.pathname.slice(1))
  let size: number
  try {
    size = (await fsp.stat(filePath)).size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*'
  }
  const range = request.headers.get('range')
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : 0
    let end = m[2] ? parseInt(m[2], 10) : size - 1
    if (!m[1] && m[2]) {
      // sufijo: últimos N bytes
      start = Math.max(0, size - parseInt(m[2], 10))
      end = size - 1
    }
    end = Math.min(end, size - 1)
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    const stream = createReadStream(filePath, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` }
    })
  }
  const stream = createReadStream(filePath)
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) }
  })
}

// WebGL2 es imprescindible para el motor de render: no dejamos que la lista negra de GPUs lo desactive.
app.commandLine.appendSwitch('ignore-gpu-blocklist')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#141518',
    title: 'EditForge',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('close', (ev) => {
    if (!dirtyWindows.has(win.webContents.id)) return
    ev.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Guardar', 'No guardar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      title: 'Cambios sin guardar',
      message: 'El proyecto tiene cambios sin guardar. ¿Quieres guardarlos antes de salir?'
    })
    if (choice === 1) {
      dirtyWindows.delete(win.webContents.id)
      win.close()
    } else if (choice === 0) {
      // El renderer guarda (con diálogo si hace falta) y responde con app:closeConfirmed.
      win.webContents.send('app:saveAndClose')
    }
  })

  // F12 abre DevTools (no hay menú en Windows/Linux).
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('dialog:openMedia', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Importar medios',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Medios', extensions: ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  })
  return res.canceled ? [] : res.filePaths
})

const PROJECT_FILTERS = [{ name: 'Proyecto EditForge', extensions: ['efproj'] }]

ipcMain.handle('dialog:saveProject', async (e, defaultName: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showSaveDialog(win, {
    title: 'Guardar proyecto',
    defaultPath: defaultName.endsWith('.efproj') ? defaultName : `${defaultName}.efproj`,
    filters: PROJECT_FILTERS
  })
  return res.canceled || !res.filePath ? null : res.filePath
})

ipcMain.handle('dialog:openProject', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, { title: 'Abrir proyecto', properties: ['openFile'], filters: PROJECT_FILTERS })
  return res.canceled ? null : (res.filePaths[0] ?? null)
})

ipcMain.handle('dialog:relink', async (e, name: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, { title: `Buscar «${name}»`, properties: ['openFile'] })
  return res.canceled ? null : (res.filePaths[0] ?? null)
})

ipcMain.handle('dialog:exportFile', async (e, defaultName: string, ext: string) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  if (ext === 'png') {
    const res = await dialog.showOpenDialog(win, { title: 'Carpeta para la secuencia PNG', properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  }
  const res = await dialog.showSaveDialog(win, {
    title: 'Exportar vídeo',
    defaultPath: `${defaultName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  })
  return res.canceled || !res.filePath ? null : res.filePath
})

ipcMain.handle('dialog:openFile', async (e, title: string, extensions: string[]) => {
  const win = BrowserWindow.fromWebContents(e.sender)!
  const res = await dialog.showOpenDialog(win, {
    title,
    properties: ['openFile'],
    filters: extensions.length ? [{ name: extensions.join(', '), extensions }] : []
  })
  return res.canceled ? null : (res.filePaths[0] ?? null)
})

// ── Almacén de ajustes y presets (JSON en la carpeta de datos de la app) ──
const storeFile = (name: string) => join(app.getPath('userData'), `${name.replace(/[^\w-]/g, '_')}.json`)
ipcMain.handle('store:get', async (_e, name: string) => {
  try {
    return JSON.parse(await fsp.readFile(storeFile(name), 'utf8'))
  } catch {
    return null
  }
})
ipcMain.handle('store:set', async (_e, name: string, data: unknown) => {
  const f = storeFile(name)
  await fsp.mkdir(app.getPath('userData'), { recursive: true })
  await fsp.writeFile(`${f}.tmp`, JSON.stringify(data, null, 2), 'utf8')
  await fsp.rename(`${f}.tmp`, f)
})

ipcMain.handle('fs:readText', (_e, filePath: string) => fsp.readFile(filePath, 'utf8'))

/** Escritura atómica: archivo temporal + rename, para no corromper el proyecto si algo falla a mitad. */
ipcMain.handle('fs:writeText', async (_e, filePath: string, content: string) => {
  const tmp = `${filePath}.tmp-${process.pid}`
  await fsp.writeFile(tmp, content, 'utf8')
  await fsp.rename(tmp, filePath)
})

// ── Cierre con cambios sin guardar ──
const dirtyWindows = new Set<number>()
ipcMain.on('app:setDirty', (e, dirty: boolean) => {
  if (dirty) dirtyWindows.add(e.sender.id)
  else dirtyWindows.delete(e.sender.id)
})
ipcMain.on('app:setTitle', (e, title: string) => {
  BrowserWindow.fromWebContents(e.sender)?.setTitle(title)
})
ipcMain.on('app:closeConfirmed', (e) => {
  dirtyWindows.delete(e.sender.id)
  BrowserWindow.fromWebContents(e.sender)?.close()
})

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  try {
    const s = await fsp.stat(filePath)
    return { size: s.size, mtimeMs: s.mtimeMs }
  } catch {
    return null
  }
})

registerExportIpc()
registerProxyIpc()
app.on('before-quit', killAllExports)

app.whenReady().then(() => {
  // Sin menú en Windows/Linux: evita Ctrl+R (recargar y perder el trabajo) y los mnemónicos con Alt,
  // que chocarían con Alt+K y Alt+←/→. En macOS el menú hace falta para copiar/pegar.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  protocol.handle('media', handleMedia)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
