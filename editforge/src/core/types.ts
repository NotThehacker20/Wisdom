/**
 * Modelo de datos de EditForge. TS puro y serializable a JSON (.efproj).
 * Nada de este módulo depende del DOM, de React ni de WebGL.
 */

export type Id = string

export const PROJECT_VERSION = 1

export type MediaKind = 'video' | 'image' | 'audio'

export interface MediaAsset {
  id: Id
  kind: MediaKind
  name: string
  /** Ruta absoluta en disco (se recalcula al cargar a partir de relPath). */
  path: string
  /** Ruta relativa al .efproj (se rellena al guardar). */
  relPath?: string
  /** Duración en segundos (Infinity para imágenes). */
  duration: number
  /** Dimensiones de visualización (ya con la rotación aplicada). */
  width: number
  height: number
  fps?: number
  hasAudio: boolean
  hasVideo: boolean
  codec?: string
  /** Rotación de los fotogramas decodificados en grados (metadatos de móvil: 0/90/180/270). */
  rotation?: number
  size?: number
  /** Solo en tiempo de ejecución: el archivo no se encontró al cargar el proyecto. */
  missing?: boolean
}

/**
 * Propiedad animable. En la fase 1 solo se usa `value`; los keyframes se
 * evalúan a partir de la fase 3 sin cambiar el formato.
 */
export interface AnimProp {
  value: number
  keyframes?: Keyframe[]
}

/** Interpolación del tramo que SALE de un keyframe hacia el siguiente. */
export type Interpolation = 'linear' | 'bezier' | 'hold'

/**
 * Curvas predefinidas. Las que se pueden expresar como una bézier cúbica
 * (easeIn/Out/InOut) se guardan como tangentes editables ('custom'); las
 * demás (expo, back, elastic, bounce) se evalúan analíticamente.
 */
export type EasingPreset = 'easeInOutExpo' | 'easeOutBack' | 'elastic' | 'bounce'

export interface Keyframe {
  id: Id
  /** Tiempo relativo al inicio del clip, en segundos. */
  t: number
  v: number
  interp: Interpolation
  /** Con interp 'bezier': curva predefinida del tramo saliente, o 'custom' para usar las tangentes. */
  ease?: EasingPreset | 'custom'
  /**
   * Tangentes en el espacio normalizado del tramo (0..1 en tiempo y valor),
   * como en CSS cubic-bezier: el tramo k→k+1 usa (k.outX, k.outY) y (k+1.inX, k+1.inY).
   */
  outX?: number
  outY?: number
  inX?: number
  inY?: number
}

export interface Transform {
  /** Posición en píxeles del proyecto, relativa al centro del lienzo (y hacia abajo). */
  x: AnimProp
  y: AnimProp
  /** Escala en % (100 = encajado en el lienzo). */
  scale: AnimProp
  /** Rotación en grados (sentido horario). */
  rotation: AnimProp
  /** Punto de anclaje en píxeles relativo al centro de la capa. */
  anchorX: AnimProp
  anchorY: AnimProp
  /** Opacidad en % (0..100). */
  opacity: AnimProp
}

export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'adjustment' | 'null'

export interface Clip {
  id: Id
  kind: ClipKind
  assetId?: Id
  name: string
  /** Inicio en la timeline (s). */
  start: number
  /** Duración en la timeline (s). */
  duration: number
  /** Punto de entrada en el medio de origen (s). */
  in: number
  transform: Transform
  /** Volumen lineal (1 = 0 dB). */
  volume: number
  muted?: boolean
  /** Fundidos de audio de entrada/salida (s). */
  fadeIn?: number
  fadeOut?: number
  /**
   * Marcadores de beat derivados del análisis del audio de este clip.
   * Sin definir: 'beats' en clips de audio y 'off' en el resto.
   */
  beatGrid?: 'off' | 'beats' | 'half' | 'bars' | 'onsets'
  /**
   * Velocidad en % (100 = normal), animable: con keyframes es una speed ramp.
   * El tiempo de origen es in + ∫ velocidad (ver core/speed.ts).
   */
  speed?: AnimProp
  /** Reproducir el fragmento al revés. */
  reverse?: boolean
  /** Interpolación de fotogramas en cámara lenta. */
  frameInterp?: 'none' | 'blend' | 'flow'
  /**
   * Clip padre (null object u otra capa). La posición, rotación y escala del
   * hijo se expresan en el espacio local del padre; la opacidad no se hereda.
   */
  parentId?: Id
  /** Pila de efectos (se aplican en orden). */
  effects?: EffectInstance[]
  /**
   * Transición en el corte de ENTRADA de este clip (con el clip anterior de la
   * misma pista). Solo está activa si ese clip termina justo donde empieza este.
   */
  transitionIn?: TransitionInstance
}

export interface TransitionInstance {
  id: Id
  type: string
  /** Duración total (s), centrada en el corte. */
  duration: number
  /** Curva del progreso (lineal, ease…, ver EaseChoice). */
  ease: string
  /** Parámetros numéricos (también bool/enum) fijos. */
  params: Record<string, number>
  strings?: Record<string, string>
}

/** Efecto aplicado a un clip. El tipo apunta a un manifiesto registrado (ver core/effects.ts). */
export interface EffectInstance {
  id: Id
  type: string
  enabled: boolean
  /** Parámetros numéricos (también booleanos y opciones, como 0/1 e índice): todos animables. */
  params: Record<string, AnimProp>
  /** Parámetros de texto: colores (#rrggbb) y rutas de archivo (LUT). */
  strings?: Record<string, string>
}

export type TrackKind = 'video' | 'audio'

export interface Track {
  id: Id
  kind: TrackKind
  name: string
  hidden: boolean
  muted: boolean
  locked: boolean
  clips: Clip[]
}

export interface ProjectSettings {
  width: number
  height: number
  fps: number
  background: [number, number, number]
}

export interface Project {
  version: number
  name: string
  settings: ProjectSettings
  assets: Record<Id, MediaAsset>
  /** Orden visual de la timeline: índice 0 = pista superior (se dibuja encima). */
  tracks: Track[]
  /** Marcadores de la timeline (manuales con M; los de beat llegan en la fase 7). */
  markers: Marker[]
}

export interface Marker {
  id: Id
  t: number
  label: string
  color: string
  kind: 'manual' | 'beat'
}
