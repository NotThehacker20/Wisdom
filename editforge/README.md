# EditForge

Editor de vídeo de escritorio para hacer **edits**: vídeos cortos y rítmicos con keyframes, null objects, shakes, transiciones y speed ramps, y previsualización en tiempo real por GPU.

**Stack:** Electron, React, TypeScript, Vite (electron-vite), Zustand, WebGL2, WebCodecs, Web Audio y FFmpeg (en la exportación).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Base: scaffolding, paneles, importación, reproducción en WebGL | ✅ |
| 2 | Timeline: cortar/mover/snap, undo/redo, guardar/cargar | ✅ |
| 3 | Transformaciones, keyframes y graph editor | ✅ |
| 4 | Null objects y parenting | ✅ |
| 5 | Sistema de efectos (shaders plugin) | ✅ |
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

### Transformaciones y keyframes
- **En el visor**: haz clic en una capa para seleccionarla. Arrastra para moverla (`Mayús` bloquea un eje), usa las esquinas para escalar, el círculo para rotar (`Mayús`: pasos de 15°) y **`Alt`+arrastrar** para mover el punto de anclaje sin desplazar la capa.
- **En el inspector**: cada propiedad (posición, escala, rotación, anclaje y opacidad) tiene ◆ para poner o quitar un keyframe en el cabezal y ‹ › para saltar entre keyframes. Arrastra la etiqueta para cambiar el valor y haz doble clic en ella para restablecerlo. «◆ todo» pone keyframe en todas las propiedades.
- **Auto-key**: si una propiedad ya tiene keyframes, cualquier cambio (inspector o visor) crea o actualiza el keyframe del cabezal. Si no tiene, cambia su valor fijo.
- **`Alt+K`**: pone o quita un keyframe en la propiedad activa (la última que tocaste). Sin propiedad activa, lo hace en las propiedades ya animadas o, si no hay ninguna, en posición, escala, rotación y opacidad.
- **Graph editor** (pestaña junto a la timeline): clic en una propiedad para ver su curva (`Ctrl`+clic añade más, con opción de normalizar). Funciona así:
  - Selecciona keyframes con clic, `Mayús`/`Ctrl`+clic o un marco, y arrástralos en tiempo y valor (`Mayús` bloquea un eje).
  - Arrastra las **tangentes bézier** para editar la curva.
  - Presets: Lineal, Ease in, Ease out, Ease in/out, InOut Expo, Out Back, Elástico, Rebote y Hold.
  - Doble clic en la curva añade un keyframe. La rueda hace zoom en el tiempo, `Mayús`+rueda en el valor, y se desplaza la vista con el botón central o `Alt`+arrastrar.
- La curva se aplica al **tramo que sale** del keyframe. Por keyframe, la interpolación puede ser lineal, bézier o hold (el hold se dibuja como un cuadrado).
- **Copiar/pegar**: `Ctrl+C` / `Ctrl+V` pega en el cabezal manteniendo los tiempos relativos. Si copias una sola propiedad y hay otra activa, se pega en esa.
- Los clips muestran sus keyframes (◆) en la timeline. Al cortar o recortar un clip, los keyframes se mueven con el contenido.

### Null objects y parenting
- **Null object**: capa invisible con transformación propia (en el visor solo se ve su cuadro discontinuo cuando está seleccionada).
- **Emparentar**: cualquier capa, o varias, puede tener como padre un null u otra capa. Hereda **posición, rotación y escala**, pero no la opacidad (como en After Effects). Hay tres formas de hacerlo:
  - **Pick whip ⊚**: arrastra desde el icono del clip en la timeline hasta el clip padre. Si el clip está seleccionado, se emparenta toda la selección.
  - **Inspector → Padre**: un desplegable con los padres posibles. No ofrece los que crearían un ciclo.
  - **«◇ Null padre»** (`Mayús+N` o clic derecho): crea un null que cubre los clips seleccionados, en una pista nueva arriba, y los emparenta a él. Es el flujo típico para hacer un shake o un zoom de todo a la vez: animas el null y todo lo hereda.
- **Sin saltos**: al emparentar, desemparentar o cambiar de padre, la transformación se compensa (también los keyframes) para que la capa no se mueva en pantalla. Al **borrar un padre**, sus hijos pasan al abuelo sin moverse.
- Los valores del inspector de una capa hija están en el espacio de su padre. El gizmo del visor trabaja en pantalla y hace la conversión, así que arrastrar un hijo de un null rotado lo mueve exactamente con el ratón.
- **En la timeline** se ve «↳ Padre» en cada hijo y, al seleccionar un clip, se resaltan su padre y sus hijos. En el visor, una línea discontinua une el hijo seleccionado con su padre.

### Efectos
- **Biblioteca** (pestaña Efectos): arrastra un efecto a un clip de la timeline o haz doble clic para aplicarlo a los clips seleccionados. Si no hay ninguno seleccionado, o si lo sueltas en una zona vacía, se crea una **capa de ajuste** con el efecto, que afecta a todo lo que haya debajo.
- **Inspector**: cada efecto tiene una tarjeta para activarlo o desactivarlo, presets, ↑/↓ para reordenar la pila y ✕ para quitarlo. **Todos los parámetros numéricos son animables** (◆, auto-key y graph editor, igual que la transformación).
- Clic derecho en un clip: **copiar / pegar efectos**.
- Incluidos:

| Categoría | Efectos |
|---|---|
| Movimiento | **Shake** (amplitud, frecuencia, semilla, ejes X/Y/rotación, caída, motion blur, bordes; presets Impacto / Cámara en mano / Terremoto / Temblor sutil) · **Zoom / Punch-in** (presets Punch-in / Punch-out / Zoom lento / Rebote) · **Motion blur** (muestras y obturador) |
| Desenfoque | Gaussiano · Radial / zoom (zoom o giro) · Enfocar |
| Color | Corrección de color (exposición, contraste, saturación, temperatura, matiz, gamma) · **LUT .cube** · Viñeta |
| Estilizar | **Glow** · **RGB split** · Flash · Pixelar · Ruido / grano · Glitch · VHS |
| Distorsión | Ondas · **Mirror / Tile** |

- **Shake y Zoom son efectos de transformación**: mueven la capa en lugar de los píxeles. Por eso:
  - En un **null**, los heredan todos sus hijos (también el relleno de bordes y el motion blur).
  - El motion blur sale de la velocidad real del movimiento: el punch-in da el desenfoque direccional.
  - Con **Bordes: Espejo** (por defecto) la imagen tiembla dentro de su marco sin dejar huecos negros.
  - En una capa de ajuste, mueven todo lo que hay debajo.
- **Motion blur** (efecto aparte o el parámetro de shake/zoom): muestrea la transformación completa (padres incluidos) dentro del obturador. Si la capa no se mueve, no hace nada.

### Atajos
| Tecla | Acción |
|---|---|
| `Espacio` | Reproducir / pausa |
| `J` / `K` / `L` | Atrás / pausa / adelante (pulsa varias veces: 2×, 4×, 8×) |
| `←` / `→` | Fotograma anterior / siguiente (`Mayús`: 10) |
| `↑` / `↓` | Punto de edición anterior / siguiente |
| `C` | Cortar en el cabezal: lo seleccionado o, sin selección, todas las pistas desbloqueadas |
| `Supr` / `Mayús+Supr` | Eliminar (keyframes seleccionados, si los hay; si no, clips) / eliminar con ripple |
| `Ctrl+D` | Duplicar (inserta detrás y desplaza lo que sigue) |
| `M` | Marcador |
| `Alt+K` | Keyframe en el cabezal |
| `Mayús+N` | Crear null padre para la selección |
| `Alt+←` / `Alt+→` | Keyframe anterior / siguiente |
| `F9` | Easy ease en los keyframes seleccionados |
| `Ctrl+C` / `Ctrl+V` | Copiar / pegar keyframes |
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
- **Animación.** Cualquier propiedad es un `AnimProp` (valor fijo + keyframes) direccionado por ruta (`transform.x` y, desde la fase 5, `fx.<id>.<param>`). `core/anim.ts` evalúa los keyframes con búsqueda binaria, bézier cúbica normalizada (como CSS `cubic-bezier`) o presets analíticos. `core/props.ts` contiene las operaciones puras: auto-key, alternar, mover, curvas, tangentes y copiar/pegar. La geometría de capa (`layerGeometry`) es la misma para el renderer y el gizmo del visor.
- **Parenting.** `worldMatrix` compone `mundo(padre) · local(hijo)` a lo largo de la cadena, evaluando cada padre en su propio tiempo local. `core/parenting.ts` contiene las operaciones puras: emparentar sin salto, null padre y borrar conservando a los hijos. Como todas las transformaciones son semejanzas, la compensación se descompone de forma exacta en posición, rotación y escala. Si el padre rota y la posición del hijo está animada, X e Y se alinean en los mismos instantes para transformarlas como un punto.
- **Efectos.** `core/effects.ts` es el registro de manifiestos (TS puro). `engine/gpu/EffectRuntime.ts` compila cada shader con una cabecera común y ejecuta los pases. El renderer compone por capas:
  1. Cada capa normaliza su fuente a una textura propia y aplica su cadena de efectos de píxel.
  2. La dibuja con su matriz de mundo, con acumulación por sub-fotogramas si hay motion blur y con relleno de bordes recortado a su marco en reposo.
  3. Las capas de ajuste procesan la composición. Solo en ese caso, o al exportar, se compone en una textura intermedia; si no, se dibuja directamente en el canvas.
- **Gestos con vista previa.** Al arrastrar en el visor o en el graph editor, `beginTransient()` muestra el resultado en directo sin tocar el historial y lo confirma al soltar como un único paso de deshacer.
- **Reloj.** El maestro es el `AudioContext`. Si no hay salida de audio, se usa `performance.now()`. Solo se renderiza cuando cambia el fotograma del proyecto, y si el render va lento se saltan fotogramas mientras el audio sigue.

## Añadir un efecto nuevo

Crea un manifiesto en `src/plugins/effects/` y añádelo a la lista de `src/plugins/index.ts`. El núcleo no cambia: la biblioteca, el inspector, los keyframes, el graph editor y el guardado lo recogen solos.

```ts
import type { EffectManifest } from '@/core/effects'

export const invert: EffectManifest = {
  id: 'invert',
  name: 'Invertir',
  category: 'Color',
  kind: 'pixel',
  params: [{ name: 'amount', label: 'Cantidad', type: 'number', default: 100, min: 0, max: 100, unit: '%' }],
  presets: [{ name: 'A medias', values: { amount: 50 } }],
  // Cada parámetro llega como «uniform float p_<nombre>». Ayudas disponibles:
  // uTex, uTime (tiempo local del clip), uSize (px de proyecto), uPxScale,
  // toPx()/fromPx() (px de proyecto centrados, y hacia abajo), sampleEdge(), luma(), hash12(), noise2().
  glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture(uTex, uv);
    return vec4(mix(c.rgb, c.a - c.rgb, p_amount / 100.0), c.a);
  }`
}
```

- **Tipos de parámetro:** `number` (animable), `bool`, `enum` (`options`), `color` (`#rrggbb`, llega como `vec3`) y `file` (`extensions`).
- **Efectos de varios pases:** usan `render(api, input, output, params)` con `api.temp()` y `api.pass(glsl, entradas, salida, uniforms)`. Glow y el desenfoque gaussiano son ejemplos.
- **Efectos de transformación:** usan `transform(params, { t }) → { x, y, rotation, scale, px, py }`. Shake y Zoom son ejemplos.

## Prueba E2E

```bash
npm run build
node scripts/smoke.mjs <carpeta-con-medios> <carpeta-salida>
# en Linux sin GPU:  SMOKE_SWIFTSHADER=1 xvfb-run -a node scripts/smoke.mjs …
```

Necesita Playwright instalado (`npm i -D playwright`, no hace falta descargar navegadores). El script importa los medios, captura el lienzo en cada clip y mide los fps de reproducción.
