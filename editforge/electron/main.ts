import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { createReadStream, promises as fsp } from 'node:fs'
import { extname, join } from 'node:path'
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

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  try {
    const s = await fsp.stat(filePath)
    return { size: s.size, mtimeMs: s.mtimeMs }
  } catch {
    return null
  }
})

app.whenReady().then(() => {
  protocol.handle('media', handleMedia)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
