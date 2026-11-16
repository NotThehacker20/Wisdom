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
}

/**
 * Propiedad animable. En la fase 1 solo se usa `value`; los keyframes se
 * evalúan a partir de la fase 3 sin cambiar el formato.
 */
export interface AnimProp {
  value: number
  keyframes?: Keyframe[]
}

export type Interpolation = 'linear' | 'bezier' | 'hold'

export interface Keyframe {
  /** Tiempo relativo al inicio del clip, en segundos. */
  t: number
  v: number
  interp: Interpolation
  /** Tangentes bézier normalizadas (0..1) hacia el siguiente keyframe. */
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
}
