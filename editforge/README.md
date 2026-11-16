# EditForge

Editor de vídeo de escritorio para hacer **edits**: vídeos cortos y rítmicos con keyframes, null objects, shakes, transiciones y speed ramps, y previsualización en tiempo real por GPU.

**Stack:** Electron, React, TypeScript, Vite (electron-vite), Zustand, WebGL2, WebCodecs, Web Audio y FFmpeg (en la exportación).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Base: scaffolding, paneles, importación, reproducción en WebGL | ✅ |
| 2 | Timeline: cortar/mover/snap, undo/redo, guardar/cargar | ⏳ |
| 3 | Transformaciones, keyframes y graph editor | ⏳ |
| 4 | Null objects y parenting | ⏳ |
| 5 | Sistema de efectos (shaders plugin) | ⏳ |
| 6 | Transiciones | ⏳ |
| 7 | Audio: forma de onda, beats, snap | ⏳ |
| 8 | Speed ramps | ⏳ |
| 9 | Texto animado | ⏳ |
| 10 | Exportación con FFmpeg | ⏳ |
| 11 | Pulido: proxies, caché, presets | ⏳ |

## Requisitos

- Node.js 20 o superior (probado con 22) y npm
- Windows 10/11, Linux o macOS con una GPU compatible con WebGL2

## Instalar y ejecutar

```bash
cd editforge
npm install
npm run dev        # modo desarrollo con recarga en caliente
```

Otros scripts:

```bash
npm run build      # compila main, preload y renderer en out/
npm run preview    # ejecuta la versión compilada
npm run typecheck  # comprobación de tipos
npm test           # tests unitarios (Vitest)
```

## Empaquetar

```bash
npm run dist:win   # instalador .exe (NSIS) en dist/  → EditForge-Setup-x.y.z.exe
npm run dist       # paquete para la plataforma actual (AppImage en Linux, dmg en macOS)
```

El instalador de Windows se genera mejor desde Windows. Desde Linux o macOS hace falta Wine para firmar los recursos del .exe.

## Uso (fase 1)

- **Importar**: botón «Importar» o arrastrar archivos desde el explorador a cualquier parte de la ventana. Formatos: MP4/MOV/M4V, WebM/MKV, PNG/JPG/WebP/GIF y MP3/WAV/OGG/M4A/AAC/FLAC.
- **Añadir a la timeline**: doble clic en un medio o el botón «+» de su miniatura.
- **Reproducir**: `Espacio`. Fotograma a fotograma con `←`/`→` (`Shift` avanza 10). `Inicio`/`Fin` saltan a los extremos. Para hacer scrubbing, arrastra sobre la regla de la timeline.
- **Inspector**: con un clip seleccionado se ven sus transformaciones. Arrastra la etiqueta para cambiar el valor (`Shift` ×10, `Alt` ×0,1) o escribe un número. Sin clip seleccionado se ven el formato y los FPS del proyecto.
- **Calidad de la previsualización**: Completa, 1/2 o 1/4 (selector bajo el visor).
- `Ctrl+Z` / `Ctrl+Y`: deshacer y rehacer.

## Arquitectura

```
editforge/
├─ electron/      main.ts (ventana, protocolo media:// con Range, IPC) · preload.ts
├─ src/
│  ├─ core/       modelo de datos en TS puro: tipos, proyecto, comandos undo/redo, matrices
│  ├─ engine/     motor WebGL2: Renderer, MediaPool, AudioEngine, PlaybackController
│  │  ├─ media/   fuentes de fotogramas: WebCodecs (mp4box), respaldo <video>, imágenes
│  │  └─ shaders/
│  ├─ plugins/    efectos y transiciones con manifiesto (fase 5+)
│  ├─ state/      stores Zustand (proyecto+historial, UI, reproducción)
│  └─ ui/         React: App, paneles, componentes
├─ tests/         Vitest
└─ scripts/       smoke.mjs (prueba E2E con Playwright)
```

Reglas:

- **`core` no depende de nada.** El proyecto es un JSON serializable y cada cambio es un `Command` puro (`do`/`undo`) con fusión de pasos consecutivos (arrastres).
- **`engine` solo depende de `core`.** `Renderer.render(project, t, pool)` dibuja el fotograma `t` a partir del proyecto. La exportación usará el mismo motor.
- **Decodificación.** En MP4/MOV, mp4box lee solo `ftyp`+`moov` por peticiones Range (no carga el archivo entero) y `VideoDecoder` decodifica con precisión de fotograma: avanza sin reiniciar durante la reproducción y salta al keyframe anterior en los seeks. Si el códec no está soportado, o en WebM/MKV, se usa `<video>` como respaldo (los proxies FFmpeg llegan en la fase 11). Se respeta la rotación de los vídeos verticales de móvil.
- **Reloj.** El maestro es el `AudioContext`. Si no hay salida de audio, se usa `performance.now()`. Solo se renderiza cuando cambia el fotograma del proyecto, y si el render va lento se saltan fotogramas mientras el audio sigue.

## Prueba E2E

```bash
npm run build
node scripts/smoke.mjs <carpeta-con-medios> <carpeta-salida>
# en Linux sin GPU:  SMOKE_SWIFTSHADER=1 xvfb-run -a node scripts/smoke.mjs …
```

Necesita Playwright instalado (`npm i -D playwright`, no hace falta descargar navegadores). El script importa los medios, captura el lienzo en cada clip y mide los fps de reproducción.
