# EditForge

Editor de vídeo de escritorio para hacer **edits**: vídeos cortos y rítmicos con keyframes, null objects, shakes, transiciones y speed ramps, y previsualización en tiempo real por GPU.

**Stack:** Electron, React, TypeScript, Vite (electron-vite), Zustand, WebGL2, WebCodecs, Web Audio y FFmpeg (en la exportación).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Base: scaffolding, paneles, importación, reproducción en WebGL | ✅ |
| 2 | Timeline: cortar/mover/snap, undo/redo, guardar/cargar | ✅ |
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

## Uso

### Medios y proyecto
- **Importar**: botón «Importar» o arrastrar archivos desde el explorador a cualquier parte de la ventana. Formatos: MP4/MOV/M4V, WebM/MKV, PNG/JPG/WebP/GIF y MP3/WAV/OGG/M4A/AAC/FLAC.
- **Añadir a la timeline**: arrastra el medio desde la biblioteca hasta una pista (o debajo de las pistas para crear una nueva), haz doble clic o pulsa el «+» de la miniatura. También puedes soltar archivos del explorador directamente en la timeline.
- **Guardar y abrir**: `Ctrl+S`, `Ctrl+Mayús+S` y `Ctrl+O`. El `.efproj` es JSON versionado y guarda las rutas de los medios **relativas al proyecto**, así que puedes mover o copiar la carpeta entera a otro disco o PC. Si falta un medio, aparece marcado ⚠ y se puede **revincular** desde el inspector. Al cerrar con cambios sin guardar, la app pregunta antes.

### Timeline
- **Mover**: arrastra los clips, también entre pistas. Si los sueltas encima o debajo de todas las pistas se crea una nueva. Lo que sueltas encima de otro clip lo recorta (modo sobrescribir).
- **Recortar**: arrastra los bordes del clip. Nunca invade a los vecinos ni se pasa de la duración del medio.
- **Snap** (🧲, tecla `S`): se ajusta al cabezal, a los marcadores, a los bordes de los clips y al 0. Mantén `Alt` mientras arrastras para ignorarlo.
- **Selección**: clic, `Ctrl`+clic para alternar, `Mayús`+clic para añadir, marco arrastrando en una zona vacía y `Ctrl+A` para todo.
- **Marcadores**: `M` en el cabezal. Se arrastran en la regla, con doble clic saltas a ellos y en el inspector les cambias el nombre y el color.
- **Pistas**: ilimitadas (+ Vídeo / + Audio). Se pueden ocultar, silenciar, bloquear, renombrar (doble clic) y eliminar (clic derecho). **+ Null** y **+ Ajuste** crean un null object o una capa de ajuste en el cabezal.
- **Scrubbing con audio**: arrastra sobre la regla.
- Clic derecho en un clip: cortar, duplicar, eliminar y eliminar con ripple.

### Atajos
| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausa |
| `J` / `K` / `L` | Atrás / pausa / adelante (pulsa varias veces: 2×, 4×, 8×) |
| `←` / `→` | Fotograma anterior / siguiente (`Mayús`: 10) |
| `↑` / `↓` | Punto de edición anterior / siguiente |
| `C` | Cortar en el cabezal: lo seleccionado o, sin selección, todas las pistas desbloqueadas |
| `Supr` / `Mayús+Supr` | Eliminar / eliminar con ripple (cierra el hueco) |
| `Ctrl+D` | Duplicar (inserta detrás y desplaza lo que sigue) |
| `M` | Marcador |
| `S` | Snap sí / no |
| `+` / `-` · `Ctrl+rueda` · `Mayús+Z` | Zoom de la timeline · zoom en el puntero · ajustar a la ventana |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | Nuevo / abrir / guardar |

El botón ⌨ de la barra superior muestra esta lista dentro de la app.

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

- **`core` no depende de nada.** El proyecto es un JSON serializable e inmutable. Cada cambio es un `Command` (`do`/`undo`). Las operaciones de timeline (`core/timeline.ts`) son funciones puras `Project → Project` que `opCommand` convierte en comandos: deshacer es exacto y O(1) porque las versiones comparten estructura. Un arrastre solo genera un paso de historial al soltar.
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
