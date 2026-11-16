// Smoke test E2E: lanza la app compilada, importa medios, los pone en la
// timeline, reproduce y guarda capturas. Uso:
//   npm run build && node scripts/smoke.mjs <carpeta-con-medios> <carpeta-salida>
import { createRequire } from 'node:module'
import { readdirSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Playwright no es dependencia del proyecto: se usa el instalado globalmente (NODE_PATH) o en node_modules.
const { _electron: electron } = createRequire(import.meta.url)('playwright')

const mediaDir = resolve(process.argv[2] ?? 'media')
const outDir = resolve(process.argv[3] ?? 'smoke-out')
mkdirSync(outDir, { recursive: true })
const files = readdirSync(mediaDir).map((f) => join(mediaDir, f)).sort()

const root = resolve(import.meta.dirname, '..')
const executablePath = createRequire(join(root, 'package.json'))('electron')
const app = await electron.launch({ executablePath, args: ['.', '--no-sandbox', ...(process.env.SMOKE_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])], cwd: root })
const page = await app.firstWindow()
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
await page.waitForFunction(() => !!window.__ef)

const assets = await page.evaluate(async (paths) => {
  const ef = window.__ef
  const res = await ef.importPaths(paths)
  for (const a of res) ef.useProject.getState().dispatch(ef.appendAssetCmd(a, ef.useProject.getState().project))
  return res.map((a) => ({ name: a.name, kind: a.kind, w: a.width, h: a.height, dur: a.duration, rot: a.rotation ?? 0, codec: a.codec, audio: a.hasAudio }))
}, files)
console.log('Importados:', assets)

await page.waitForTimeout(1500)
await page.screenshot({ path: join(outDir, 'ui.png') })

// Recorremos varios instantes con seek (pausado) y capturamos el lienzo.
const clips = await page.evaluate(() => window.__ef.useProject.getState().project.tracks[0].clips.map((c) => ({ name: c.name, start: c.start, duration: c.duration })))
for (const c of clips) {
  const t = c.start + Math.min(1, c.duration / 2)
  await page.evaluate((t) => window.__ef.playback.seek(t), t)
  await page.waitForTimeout(700)
  const canvas = page.locator('canvas.preview-canvas')
  await canvas.screenshot({ path: join(outDir, `frame_${c.name}.png`) })
}

// Reproducción: medimos fps de render durante 3 s.
await page.evaluate(() => { window.__ef.useUi.getState().setQuality(1); window.__ef.playback.seek(0); return window.__ef.playback.play() })
await page.waitForTimeout(3000)
const stats = await page.evaluate(() => ({ fps: window.__ef.playback.measuredFps, t: window.__ef.playback.currentTime, playing: window.__ef.playback.isPlaying }))
console.log('Reproducción:', stats)
await page.evaluate(() => window.__ef.playback.pause())

console.log('Consola:\n' + logs.filter((l) => !l.includes('Electron Security Warning')).join('\n'))
// Sin esto, el aviso de «cambios sin guardar» (diálogo modal) bloquearía el cierre.
await page.evaluate(() => window.editforge.setDirty(false))
await app.close()
