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
| 6 | Transiciones | ✅ |
| 7 | Audio: forma de onda, beats, snap y crossfade | ✅ |
| 8 | Speed ramps | ✅ |
| 9 | Texto animado | ✅ |
| 10 | Exportación con FFmpeg | ✅ |
| 11 | Pulido: proxies, caché de fotogramas, atajos y presets guardables, curvas, mantener tono, instalador de Windows | ✅ |

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

### Instalador de Windows con GitHub Actions

El workflow [`.github/workflows/editforge-windows.yml`](../.github/workflows/editforge-windows.yml) compila en `windows-latest` cada vez que cambia algo en `editforge/` (y a mano con **Run workflow**):

1. `npm ci` (descarga el `ffmpeg.exe` de Windows) y comprueba que FFmpeg arranca.
2. `npm run typecheck` y `npm test`.
3. `npm run dist:win` → `EditForge-Setup-x.y.z.exe`.

**Descargar el .exe:** pestaña **Actions** del repositorio → la última ejecución de «EditForge · instalador Windows» → sección **Artifacts** → `EditForge-Setup`. En la rama `main` además se publica en la release `editforge-windows`.

El instalador no está firmado: la primera vez Windows SmartScreen avisa («Más información» → «Ejecutar de todas formas»).

## Uso

### Medios y proyecto
- **Importar**: botón «Importar» o arrastrar archivos desde el explorador a cualquier parte de la ventana. Formatos: MP4/MOV/M4V, WebM/MKV, AVI, PNG/JPG/WebP/GIF y MP3/WAV/OGG/M4A/AAC/FLAC. Lo que el motor no decodifica (ProRes, AVI antiguos…) se convierte solo con un **proxy de compatibilidad** (ver *Rendimiento y proxies*).
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
| Color | Corrección de color (exposición, contraste, saturación, temperatura, matiz, gamma) · **Curvas** (RGB y por canal) · **LUT .cube** · Viñeta |
| Estilizar | **Glow** · **RGB split** · Flash · Pixelar · Ruido / grano · Glitch · VHS |
| Distorsión | Ondas · **Mirror / Tile** |

- **Shake y Zoom son efectos de transformación**: mueven la capa en lugar de los píxeles. Por eso:
  - En un **null**, los heredan todos sus hijos (también el relleno de bordes y el motion blur).
  - El motion blur sale de la velocidad real del movimiento: el punch-in da el desenfoque direccional.
  - Con **Bordes: Espejo** (por defecto) la imagen tiembla dentro de su marco sin dejar huecos negros.
  - En una capa de ajuste, mueven todo lo que hay debajo.
- **Curvas**: editor con pestañas RGB / R / G / B. Clic en la curva añade un punto, arrastrar lo mueve, doble clic (o clic derecho) lo quita; los extremos solo se mueven en vertical. Presets: contraste suave y fuerte, negros lavados, invertir, teal & orange. La intensidad es animable.
- **Mis presets**: en una tarjeta de efecto, «Guardar efectos como preset…» guarda **la pila entera** (con sus keyframes). Aparece en la biblioteca, en «Mis presets»: arrástralo a un clip, o haz doble clic (sin selección crea una capa de ajuste). Clic derecho para borrarlo. Se guardan en la app, no en el proyecto, así que valen para todos tus proyectos.
- **Motion blur** (efecto aparte o el parámetro de shake/zoom): muestrea la transformación completa (padres incluidos) dentro del obturador. Si la capa no se mueve, no hace nada.

### Transiciones
- **Poner**: arrastra una transición (pestaña Transiciones) hasta el **corte** entre dos clips seguidos de la misma pista; el corte se ilumina al acercarte. Con doble clic se pone en el corte más cercano al cabezal.
- **Editar**: haz clic en el bloque ⧓ de la timeline para abrir su inspector:
  - **Tipo:** al cambiarlo se conservan la duración y la curva.
  - **Duración:** también se cambia arrastrando los bordes del bloque, de forma simétrica respecto al corte.
  - **Curva:** lineal, ease in, ease out, ease in/out, InOut Expo u Out Back.
  - **Parámetros** propios de cada transición.
- **Quitar**: `Supr` o clic derecho.
- **Incluidas**: Disolver, **Zoom in**, **Zoom out**, **Whip pan** (barrido con desenfoque, 4 direcciones), **Spin**, **Flash** (color y tiempo de mantenimiento), **Glitch**, **Luma fade**, **Slide** (empujar o cubrir), **Shake** (con golpe de zoom), **RGB split** y **Tinta / máscara** (tinta orgánica, barrido o círculo).
- **Duración centrada en el corte**: el clip A sigue más allá de su salida y el B empieza antes de su entrada, usando el material sobrante del medio. Si no queda material, se congela el primer o el último fotograma. La duración máxima la limitan los clips vecinos y sus otras transiciones.
- Una transición pertenece al corte: si separas los clips deja de verse, y vuelve si los juntas de nuevo. Al cortar un clip, la mitad derecha empieza en seco.

### Audio y beats
- **Forma de onda** en los clips de audio y en una tira de los vídeos con sonido. Se calcula en segundo plano (Web Worker) al importar o abrir.
- **Beats automáticos**: al añadir música, el ritmo se analiza solo y aparecen marcadores de beat en la regla (los de cada compás, más largos). Cada clip elige su rejilla desde el inspector o el clic derecho: **cada beat, cada 2, cada compás (4), golpes (onsets)** u ocultar. Por defecto, los clips de audio muestran cada beat y los vídeos nada.
  - Los marcadores **se derivan del análisis**: siguen a la música si la mueves, la recortas o la cortas, y no ensucian el historial.
- **Snap a beats**: mover y recortar clips, mover marcadores y soltar medios se pegan a los beats. **`Mayús`+arrastrar** sobre la regla pega el cabezal a beats, marcadores y bordes, y **`Mayús+↑/↓`** salta de beat en beat. El flujo típico de un edit es `Mayús+↓` y luego `C`.
- **Inspector de audio**: volumen en dB, fade in/out (dibujados en el clip), silenciar el clip, BPM detectado y rejilla de beats.
- **Crossfade en las transiciones**: el audio de A y el de B se mezclan con potencia constante durante la transición, sin bajón de volumen. Solo se solapan donde ambos medios tienen material: si A llega al final de su archivo y B empieza en el segundo 0, el corte de audio es seco (con microfundidos de 5 ms contra los clics).
- **Análisis de ritmo** (`core/audio`, TS puro con tests):
  1. Flujo espectral por bandas logarítmicas con más peso en los graves (el bombo cuenta tanto como el hi-hat).
  2. Tempo por autocorrelación con preferencia por tempos habituales y afinado por regresión.
  3. Beats por programación dinámica (Ellis).

### Velocidad y speed ramps
- **Inspector → Velocidad**: velocidad constante del 1 % al 1000 %. Cambiarla **conserva el mismo fragmento del medio**: la duración se ajusta y los clips de detrás se desplazan, como en CapCut.
- **Curvas (speed ramps)**: Montaje, Héroe, Bala, Salto, Flash in, Flash out, Rampa lenta → rápida y Rampa rápida → lenta. También conservan el fragmento.
  - **«Editar curva…»** abre la velocidad en el graph editor: keyframes, curvas bézier y presets de easing, como cualquier otra propiedad.
  - También puedes crear tu propia rampa poniendo keyframes en «Velocidad».
- **Al revés**: reproduce el fragmento invertido, audio incluido.
- **Interpolación de fotogramas** en cámara lenta:
  - **Ninguna:** repite fotogramas.
  - **Mezcla de fotogramas:** funde los dos más cercanos.
  - **Flujo óptico (sencillo):** estima el movimiento entre fotogramas en la GPU y coloca los objetos a mitad de camino, sin el «fantasma» de la mezcla. Sirve para movimientos de hasta ~24 px por fotograma; no trata oclusiones complejas.
- **Audio**: sigue a la velocidad y a las rampas. Por defecto el tono cambia, como en una cinta. Con **«Mantener tono»** (velocidad constante) el audio se estira con WSOLA sin cambiar el tono, en la reproducción y en la exportación. En las rampas el tono siempre sigue a la velocidad.
- **Todo respeta la velocidad**: cortes, recortes, transiciones (y su crossfade), marcadores de beat y límites del medio. Si una curva pide más material del que hay, se congela el último fotograma y el inspector lo avisa.
- La timeline marca los clips con **«2×»**, **«↯ curva»** o **«◀»** (al revés).

### Texto
- **Añadir**: botón **+ Texto**, tecla **`T`** o la pestaña **Texto**, con estilos predefinidos (Título, Subtítulo, Contorno, Neón, Impacto, Máquina de escribir). Se crea en el cabezal, en una pista nueva arriba.
- **Editar**: el inspector enfoca el cuadro de texto. Doble clic sobre el texto en el visor también lo abre. Admite varias líneas.
- **Fuente**: las fuentes instaladas en el sistema, más una lista de respaldo. También grosor, cursiva, alineación, tamaño, interlineado, color y **espaciado** (animable).
- **Estilo**: **contorno**, **sombra** (desenfoque, distancia, opacidad), **glow** (radio, intensidad) y **caja de fondo**.
- **Animación de entrada y de salida, por carácter, palabra o línea**:
  - Tipos: **máquina de escribir** (con cursor), **pop**, **slide** (4 direcciones), fundido, giro y caída.
  - Ajustes: duración y **solapamiento** entre unidades.
  - **Con keyframes**: cada animación tiene un **progreso (0–100 %)** animable. El preset crea sus keyframes y «Editar ritmo en el graph editor» permite rehacer el ritmo con curvas (por ejemplo, que escriba deprisa al principio y se frene).
- **Estilos propios**: «Guardar estilo de texto…» en el inspector guarda fuente, colores, contorno, sombra, glow, caja y animaciones. Aparecen en la pestaña Texto («Mis estilos»): clic para crear un texto con ese estilo; con un texto seleccionado, se le aplica.
- Un texto es una capa como cualquier otra: transformación, efectos, parenting, motion blur y **transiciones entre textos**.

### Exportar
- **Exportar** (botón o `Ctrl+E`):
  - **Formato:** **H.264 (MP4)**, **H.265/HEVC (MP4)**, **ProRes 422 HQ (MOV)** o **secuencia PNG** (en una carpeta).
  - **Resolución:** 1080×1920 vertical, 1920×1080, 720p vertical u horizontal, cuadrado o 4K.
  - **FPS:** 24, 25, 30, 50 o 60.
  - **Bitrate** (se sugiere según la resolución) y **audio**.
- **Bandas negras:** si la resolución tiene otra proporción que el proyecto, la imagen se encaja con bandas negras. Para llenar el encuadre en vertical, pon el proyecto en formato vertical (inspector → Proyecto).
- **Progreso:** fotograma actual, velocidad de exportación y tiempo restante. **Cancelar** detiene FFmpeg y borra el archivo incompleto. Al terminar, «Mostrar en la carpeta».
- **Idéntica a la previsualización:** usa el mismo motor WebGL fotograma a fotograma (en las pruebas, la diferencia es 0 píxel a píxel). El audio se mezcla con el mismo planificador (fundidos, crossfades de transiciones, velocidad).
- **Color:** sale en BT.709 de rango de vídeo, con sus metadatos, para que se vea igual en reproductores y redes.
- **FFmpeg:** se usa el binario de `ffmpeg-static`, que `npm install` descarga para la plataforma actual. Por eso **el instalador de Windows debe generarse en Windows**, para que incluya `ffmpeg.exe`. Para usar otro FFmpeg, define `EDITFORGE_FFMPEG=/ruta/a/ffmpeg`.

### Rendimiento y proxies
- **Caché de fotogramas (GPU):** cada fotograma ya renderizado se guarda como textura (por defecto hasta 512 MB). Volver a él, al hacer scrub o en bucle, es instantáneo. Cualquier cambio del proyecto o de la calidad la invalida.
- **`F2` – panel de rendimiento:** fps reales, coste del render (ms y capas) o «desde caché», y ocupación y aciertos de la caché.
- **Calidad de previsualización:** completa, 1/2 o 1/4 (selector del visor).
- **Proxies** (se crean con FFmpeg en segundo plano, con progreso en el inspector, y se guardan en una caché de la app; no tocan el proyecto):
  - **De compatibilidad:** para medios que el motor no decodifica (ProRes, AVI, MPEG-4 Part 2…) se crea **automáticamente** una copia H.264 a resolución completa, con el audio en AAC. Se usa para la previsualización, el audio y la exportación.
  - **De previsualización:** versión de 960 px para los medios pesados. Se crea sola para los de más de 2560 px (4K) y a mano para cualquier vídeo (inspector → Medio → Proxies → «Crear»). El botón **Proxy** del visor activa o desactiva su uso. **La exportación usa siempre el original.**
  - Se reutilizan entre sesiones: si el archivo original cambia (tamaño o fecha), se generan de nuevo. «Quitar» borra el proxy.

### Atajos
Todos los atajos se pueden **cambiar**: botón ⌨ de la barra superior o `Ctrl+,` → «Cambiar» y pulsa la nueva combinación. Si ya la usaba otra acción, se le quita y se avisa. ↺ restaura una acción y «Restablecer todos» vuelve a los de fábrica. Se guardan en los ajustes de la app.

Atajos de fábrica:

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
| `Mayús+↑` / `Mayús+↓` | Beat anterior / siguiente |
| `Alt+K` | Keyframe en el cabezal |
| `Mayús+N` | Crear null padre para la selección |
| `T` | Texto en el cabezal |
| `Alt+←` / `Alt+→` | Keyframe anterior / siguiente |
| `F9` | Easy ease en los keyframes seleccionados |
| `Ctrl+C` / `Ctrl+V` | Copiar / pegar keyframes |
| `S` | Snap sí / no |
| `+` / `-` · `Ctrl+rueda` · `Mayús+Z` | Zoom de la timeline · zoom en el puntero · ajustar a la ventana |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | Nuevo / abrir / guardar (funcionan también mientras escribes en un campo) |
| `Ctrl+E` | Exportar |
| `F2` | Panel de rendimiento |
| `Ctrl+,` | Editor de atajos |

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
- **Decodificación.** En MP4/MOV, mp4box lee solo `ftyp`+`moov` por peticiones Range (no carga el archivo entero) y `VideoDecoder` decodifica con precisión de fotograma: avanza sin reiniciar durante la reproducción y salta al keyframe anterior en los seeks. Si el códec no está soportado, o en WebM/MKV, se usa `<video>` como respaldo (y, si tampoco puede, el proxy FFmpeg de compatibilidad). Se respeta la rotación de los vídeos verticales de móvil.
- **Animación.** Cualquier propiedad es un `AnimProp` (valor fijo + keyframes) direccionado por ruta (`transform.x` y, desde la fase 5, `fx.<id>.<param>`). `core/anim.ts` evalúa los keyframes con búsqueda binaria, bézier cúbica normalizada (como CSS `cubic-bezier`) o presets analíticos. `core/props.ts` contiene las operaciones puras: auto-key, alternar, mover, curvas, tangentes y copiar/pegar. La geometría de capa (`layerGeometry`) es la misma para el renderer y el gizmo del visor.
- **Parenting.** `worldMatrix` compone `mundo(padre) · local(hijo)` a lo largo de la cadena, evaluando cada padre en su propio tiempo local. `core/parenting.ts` contiene las operaciones puras: emparentar sin salto, null padre y borrar conservando a los hijos. Como todas las transformaciones son semejanzas, la compensación se descompone de forma exacta en posición, rotación y escala. Si el padre rota y la posición del hijo está animada, X e Y se alinean en los mismos instantes para transformarlas como un punto.
- **Efectos.** `core/effects.ts` es el registro de manifiestos (TS puro). `engine/gpu/EffectRuntime.ts` compila cada shader con una cabecera común y ejecuta los pases. El renderer compone por capas:
  1. Cada capa normaliza su fuente a una textura propia y aplica su cadena de efectos de píxel.
  2. La dibuja con su matriz de mundo, con acumulación por sub-fotogramas si hay motion blur y con relleno de bordes recortado a su marco en reposo.
  3. Las capas de ajuste procesan la composición. Solo en ese caso, o al exportar, se compone en una textura intermedia; si no, se dibuja directamente en el canvas.
- **Transiciones.** Viven en el clip B (`transitionIn`). `core/transitions.ts` calcula los cortes, la ventana activa, las duraciones límite y el tiempo de origen limitado al material disponible. En la ventana, `collectLayers` devuelve un único elemento con A y B. El renderer dibuja cada uno, con sus transformaciones y efectos, en una textura propia, y el shader de la transición los mezcla directamente sobre la composición.
- **Audio.** `core/audio/mix.ts` calcula el plan de mezcla, que es puro: intervalos, crossfades de las transiciones y fundidos. `engine/audio/schedule.ts` lo programa sobre cualquier `BaseAudioContext`: la reproducción usa un `AudioContext` y la exportación usará un `OfflineAudioContext` con el mismo código, así que sonará igual.
- **Velocidad.** `core/speed.ts` define el tiempo de origen como `in + ∫ velocidad`: lineal si es constante y, con rampas, una tabla acumulada cacheada que se invierte por búsqueda binaria. Cortar, recortar, transiciones, audio y beats pasan todos por esta función. La interpolación de fotogramas pide dos fotogramas seguidos al decodificador; el WebCodecs conserva el anterior, así que no hay saltos atrás. El flujo óptico (`engine/gpu/flow.ts`):
  1. Calcula la luminancia a 1/4 de resolución.
  2. Busca correspondencias de bloques hacia delante (A→B) y hacia atrás (B→A).
  3. Proyecta el flujo al instante intermedio.
  4. Deforma y mezcla A y B.
- **Texto.** `core/text.ts` es puro: maquetación con kerning y tracking, unidades (carácter, palabra o línea), reparto del progreso entre unidades y estado de cada glifo. La medición del texto se inyecta: canvas en la app y una estimación en los tests, así que el núcleo conoce el tamaño real del bloque (gizmo, hit-test). `engine/text/TextRasterizer.ts` rasteriza con Canvas 2D a la resolución de render (glow, sombra, contorno, relleno y cursor) y reutiliza el resultado si el texto está quieto.
- **Exportación.**
  1. `state/exporter.ts` hace una instantánea del proyecto y mezcla el audio (`OfflineAudioContext` + `scheduleAudio`, a WAV).
  2. Renderiza cada fotograma con un `Renderer` y un `MediaPool` propios (`renderToPixels`, con encaje en bandas negras) y envía los píxeles RGBA por IPC.
  3. El proceso principal (`electron/exporter.ts`) los escribe en el stdin de FFmpeg con contrapresión. Mientras FFmpeg recibe un fotograma, ya se renderiza el siguiente.

  Los argumentos de FFmpeg (`electron/ffmpegArgs.ts`) son puros y tienen tests.
- **Proxies.** `engine/media/proxies.ts` es un registro en memoria: ruta original → proxy. `MediaPool` elige el archivo según sea previsualización o exportación y vuelve a abrir la fuente si aparece un proxy. El proceso principal (`electron/proxies.ts`) los crea con FFmpeg en `userData/proxies/<hash>.mp4`; el hash sale de la ruta, el tamaño y la fecha. Cuando Chromium no puede leer un archivo, también lo sondea con FFmpeg (`parseFfmpegInfo`, con tests).
- **Caché de fotogramas.** `engine/FrameCache.ts` es un LRU de texturas en la GPU. La clave es la versión del proyecto (objeto inmutable, así que cada edición es una generación nueva), la calidad y el fotograma. Solo se guardan los fotogramas completos: decodificados con exactitud y sin LUTs pendientes.
- **Ajustes de la app.** `state/settings.ts` guarda atajos, presets y opciones de rendimiento en `userData/settings.json` (escritura atómica por IPC). El mapa de atajos (`ui/keymap.ts`) es declarativo: id, grupo, teclas y acción. La ayuda y el editor se generan a partir de él.
- **Curvas y tono.** `core/curves.ts` interpola con un spline cúbico monótono (Fritsch–Carlson) y hornea `canal(maestra(x))` en una tabla de 256×1 que el shader consulta. `core/audio/wsola.ts` hace el time-stretch: busca la similitud sobre una mezcla mono diezmada y aplica el mismo desplazamiento a todos los canales. Ambos son TS puro y tienen tests.
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

## Añadir una transición nueva

Igual que los efectos: un manifiesto en `src/plugins/transitions/` que se añade a `src/plugins/index.ts`. El GLSL define `vec4 transition(vec2 uv, float p)`, donde `p` es el progreso ya con su curva (0 = A, 1 = B). Dispone de `getFrom(uv)` y `getTo(uv)` (con bordes en espejo), de `uTime` (segundos desde el inicio de la transición) y de las mismas ayudas que los efectos.

```ts
export const circleOpen: TransitionManifest = {
  id: 'circleOpen',
  name: 'Iris',
  params: [{ name: 'softness', label: 'Suavidad', type: 'number', default: 0.05, min: 0, max: 0.5 }],
  glsl: `vec4 transition(vec2 uv, float p) {
    float r = length(toPx(uv)) / (0.5 * length(uSize));
    return mix(getFrom(uv), getTo(uv), smoothstep(r, r + p_softness, p * (1.0 + p_softness)));
  }`
}
```

## Prueba E2E

```bash
npm run build
node scripts/smoke.mjs <carpeta-con-medios> <carpeta-salida>
# en Linux sin GPU:  SMOKE_SWIFTSHADER=1 xvfb-run -a node scripts/smoke.mjs …
```

Necesita Playwright instalado (`npm i -D playwright`, no hace falta descargar navegadores). El script importa los medios, captura el lienzo en cada clip y mide los fps de reproducción.
