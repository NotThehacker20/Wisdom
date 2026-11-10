# 🖧 Tutor SMR

Tu tutor personal de **Sistemas Microinformáticos y Redes** (1º SMR · Egibide), hecho a partir del prompt [`tutor-smr.md`](tutor-smr.md).
Es una web que funciona en el navegador, también desde el móvil, y no hay que instalar nada.

## ¿Qué trae?

| Sección | Qué hace | ¿Necesita clave de API? |
|---|---|---|
| 🏠 **Inicio** | Racha de días, nota media, fallos pendientes y un «calentamiento» de 2 minutos antes de empezar. | No |
| 🤖 **Tutor IA** | Chat con Claude usando el prompt del tutor: *Explícame*, *Hazme un test*, *Prepárame el examen*, *Corrígeme esto*, *Laboratorio*… Al pulsar **🏁 Terminar sesión** guarda la nota y los fallos en tu progreso. | **Sí** |
| 🧮 **Subnetting** | Ejercicios infinitos en 4 niveles (básico, cualquier máscara, dividir en subredes, VLSM). Se corrigen solos, tienen pistas y procedimiento paso a paso con el binario en colores, y la dificultad sube o baja según cómo vayas. Incluye una calculadora visual. | No |
| 📝 **Tests** | Más de 70 preguntas de redes, subnetting, Linux, Windows, hardware, virtualización y scripting. Van de una en una, cada respuesta se corrige con su explicación y al final tienes tu nota. | No |
| 🧪 **Laboratorios** | Prácticas guiadas para VirtualBox (usuarios y permisos, dos subredes con router, DHCP, PowerShell) con una lista de pasos que vas marcando. | No |
| 📌 **Chuletas** | Puertos (con modo «ocultar para practicar») y comandos con su sistema (🐧/🪟). Los comandos destructivos llevan un aviso. | No |
| 📅 **Plan de examen** | Pones la fecha y los temas y te sale un plan por días que empieza por lo que llevas más flojo. | No |
| 📚 **Mis apuntes** | Pega aquí tus apuntes del Moodle y el tutor IA se basará en ellos. | No |
| 📈 **Progreso** | Historial, nota por tema y fallos que se repiten. Se puede exportar como `progreso.md`. | No |

## 🚀 Cómo usarla

### Opción A: publicarla gratis con GitHub Pages (recomendado)
1. En tu repositorio de GitHub entra en **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`. Pulsa **Save**.
3. Al minuto tendrás tu web en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`. Guárdala en la pantalla de inicio del móvil.

### Opción B: en tu ordenador
Descarga el repositorio y abre una terminal en la carpeta:

```bash
python3 -m http.server 8000
```

Después abre `http://localhost:8000` en el navegador. (También puedes abrir `index.html` con doble clic. Todo funciona salvo, quizá, el Tutor IA.)

### Opción C: app para Windows (.exe)
1. Entra en la sección **Releases** del repositorio (a la derecha en la página principal) y descarga **`TutorSMR.exe`**.
2. Ábrelo con doble clic. No hay que instalar nada.
3. La primera vez, Windows puede mostrar «Windows protegió su PC» porque la app no está firmada: pulsa **Más información → Ejecutar de todas formas**.

El `.exe` lo genera GitHub automáticamente (pestaña **Actions**) cada vez que cambia la app. El progreso de la app de escritorio se guarda aparte del de la web; usa la copia de seguridad para pasarlo de una a otra.

## 🔑 Tutor IA: la clave de API

El Tutor IA usa Claude. Para eso necesitas tu propia clave de API de Anthropic:

1. Entra en [console.anthropic.com](https://console.anthropic.com) y crea una cuenta.
2. En **Billing**, añade algo de saldo. Se paga por uso y una sesión normal cuesta céntimos.
3. En **API Keys → Create Key**, copia la clave.
4. En la app ve a **🤖 Tutor IA** y pégala. En ⚙️ puedes elegir el modelo (Opus 5.5, Sonnet 5.5 o Haiku 5.5) y el tipo de respuestas.

> 🔒 La clave se guarda **solo en tu navegador**: no está en el código ni se sube a GitHub. No la compartas. Si se filtra, bórrala en la consola y crea otra.

## 💾 Tus datos

Tu progreso, tus apuntes y la clave se guardan en el navegador (`localStorage`). Si cambias de móvil u ordenador, ve a **📈 Progreso → ⋯ Copia de seguridad** para descargar una copia y restaurarla en el otro. La copia nunca incluye la clave.

## 🛠️ Para personalizarla

- **Prompt del tutor**: `tutor-smr.md`. La app lo lee de `js/prompt.js`. Si cambias el `.md`, regenera ese archivo:
  ```bash
  python3 -c "import json,re;s=open('tutor-smr.md',encoding='utf-8').read();b=re.sub(r'^---\n.*?\n---\n','',s,flags=re.S).strip();open('js/prompt.js','w',encoding='utf-8').write('window.SMR = window.SMR || {};\nSMR.TUTOR_PROMPT = '+json.dumps(b,ensure_ascii=False)+';\n')"
  ```
- **Preguntas, laboratorios y chuletas**: `js/data.js`. Puedes añadir tus propias preguntas copiando el formato de las que ya hay.
- **Estilos y colores**: `css/styles.css`.

### Estructura

```
index.html          → página principal
css/styles.css      → diseño (tema claro y oscuro)
js/data.js          → preguntas, laboratorios, puertos y comandos
js/prompt.js        → prompt del tutor (generado desde tutor-smr.md)
js/store.js         → progreso guardado en el navegador
js/subnet.js        → ejercicios de subnetting
js/test.js          → tests
js/ai.js            → chat con Claude
js/views.js         → inicio, laboratorios, chuletas, plan, apuntes y progreso
desktop/            → app de escritorio para Windows (Electron)
js/vendor/          → librerías incluidas: SDK de Anthropic, marked y DOMPurify (sus licencias están en licenses/)
```
