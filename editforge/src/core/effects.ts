/**
 * Sistema de efectos: tipos de manifiesto y registro.
 *
 * Cada efecto se describe con un manifiesto (nombre, categoría, parámetros con
 * rangos y valores por defecto, presets) más su implementación:
 *  - kind 'pixel':     shader GLSL (`glsl`, una función `vec4 effect(vec2 uv)`)
 *                      o varios pases (`render`) sobre la textura de la capa.
 *  - kind 'transform': función pura que modifica la transformación de la capa
 *                      (shake, zoom). Así se hereda por parenting y genera
 *                      motion blur real. En capas de ajuste se aplica como
 *                      un pase sobre la composición.
 *  - kind 'layer':     rasgos de dibujo que resuelve el renderer (motion blur,
 *                      relleno de bordes en espejo/mosaico).
 * Para añadir un efecto basta con registrar su manifiesto (src/plugins/effects).
 */
import { evalProp } from './anim'
import { uid } from './id'
import type { AnimProp, Clip, EffectInstance } from './types'

export type ParamType = 'number' | 'bool' | 'enum' | 'color' | 'file'

export interface ParamDef {
  name: string
  label: string
  type: ParamType
  default: number | string
  min?: number
  max?: number
  /** Paso al arrastrar en el inspector. */
  step?: number
  unit?: string
  decimals?: number
  /** Opciones de un 'enum' (el valor guardado es el índice). */
  options?: string[]
  /** Extensiones aceptadas por un parámetro 'file'. */
  extensions?: string[]
}

/** Valor de preset: número fijo, texto, o keyframes [t, v, curva?] relativos al cabezal (la curva es la de llegada a ese valor). */
export type PresetValue = number | string | Array<[number, number, ('linear' | 'easeOut' | 'easeIn' | 'easeInOut' | 'easeOutBack')?]>

export interface EffectPreset {
  name: string
  values: Record<string, PresetValue>
}

export interface TransformDelta {
  /** Desplazamiento en píxeles en el espacio del padre. */
  x: number
  y: number
  /** Rotación (grados) y escala (factor) alrededor del pivote. */
  rotation: number
  scale: number
  /** Pivote en coordenadas locales de capa, relativo al anclaje. */
  px: number
  py: number
}

export interface EffectContext {
  /** Tiempo local del clip (s). */
  t: number
  fps: number
}

/** Parámetros evaluados: números (también bool/enum) y textos. */
export type ParamValues = Record<string, number> & { $strings?: Record<string, string> }

/** API mínima que el motor ofrece a los efectos multi-pase (sin tipos de WebGL en el núcleo). */
export interface EffectRenderAPI {
  readonly width: number
  readonly height: number
  /** Píxeles de destino por píxel de proyecto (calidad de previsualización × encaje). */
  readonly pxScale: number
  /** Crea una textura temporal (se libera sola al acabar el efecto). */
  temp(width?: number, height?: number): unknown
  /** Ejecuta un shader de pase (misma convención que `glsl`) leyendo `inputs` y escribiendo en `output`. */
  pass(glsl: string, inputs: Record<string, unknown>, output: unknown, uniforms?: Record<string, number | number[]>): void
  /** Textura 3D de un LUT .cube ya cargado (o null mientras carga). */
  lut(path: string): unknown | null
}

export interface EffectManifest {
  id: string
  name: string
  category: 'Movimiento' | 'Desenfoque' | 'Color' | 'Estilizar' | 'Distorsión'
  description?: string
  kind: 'pixel' | 'transform' | 'layer'
  params: ParamDef[]
  presets?: EffectPreset[]
  /** kind 'pixel', un pase: cuerpo GLSL con `vec4 effect(vec2 uv)`. Los parámetros llegan como `uniform float p_<nombre>`. */
  glsl?: string
  /** kind 'pixel', varios pases. */
  render?: (api: EffectRenderAPI, input: unknown, output: unknown, p: ParamValues, ctx: EffectContext) => void
  /** kind 'transform'. */
  transform?: (p: ParamValues, ctx: EffectContext) => TransformDelta
}

const registry = new Map<string, EffectManifest>()

export function registerEffect(m: EffectManifest): void {
  if (m.kind === 'pixel' && !m.glsl && !m.render) throw new Error(`El efecto ${m.id} no tiene shader`)
  if (m.kind === 'transform' && !m.transform) throw new Error(`El efecto ${m.id} no tiene función de transformación`)
  registry.set(m.id, m)
}

export const getEffect = (id: string): EffectManifest | undefined => registry.get(id)
export const listEffects = (): EffectManifest[] => [...registry.values()]

/** Parámetros que se guardan como AnimProp (todo salvo color y archivo). */
export const isNumericParam = (d: ParamDef): boolean => d.type !== 'color' && d.type !== 'file'

export function createEffectInstance(type: string): EffectInstance {
  const m = getEffect(type)
  if (!m) throw new Error(`Efecto desconocido: ${type}`)
  const params: Record<string, AnimProp> = {}
  const strings: Record<string, string> = {}
  for (const d of m.params) {
    if (isNumericParam(d)) params[d.name] = { value: Number(d.default) }
    else strings[d.name] = String(d.default)
  }
  return { id: uid('fx_'), type, enabled: true, params, ...(Object.keys(strings).length ? { strings } : {}) }
}

/** Evalúa todos los parámetros de un efecto en el tiempo local t (con los valores por defecto si faltan). */
export function evalEffectParams(fx: EffectInstance, t: number): ParamValues {
  const m = getEffect(fx.type)
  const out = {} as ParamValues
  if (!m) return out
  for (const d of m.params) {
    if (!isNumericParam(d)) continue
    const p = fx.params[d.name]
    out[d.name] = p ? evalProp(p, t) : Number(d.default)
  }
  out.$strings = { ...Object.fromEntries(m.params.filter((d) => !isNumericParam(d)).map((d) => [d.name, String(d.default)])), ...fx.strings }
  return out
}

export const activeEffects = (clip: Clip, kind?: EffectManifest['kind']): Array<{ fx: EffectInstance; m: EffectManifest }> =>
  (clip.effects ?? [])
    .filter((fx) => fx.enabled)
    .map((fx) => ({ fx, m: getEffect(fx.type)! }))
    .filter((x) => x.m && (!kind || x.m.kind === kind))

/** Deltas de los efectos de transformación de un clip en el tiempo local t. */
export function transformDeltas(clip: Clip, localT: number, fps: number): TransformDelta[] {
  return activeEffects(clip, 'transform').map(({ fx, m }) => m.transform!(evalEffectParams(fx, localT), { t: localT, fps }))
}

// ───────────────────────────── rasgos de dibujo heredables ─────────────────────────────

export type EdgeMode = 0 | 1 | 2 // ninguno, espejo, mosaico

export interface LayerTraits {
  /** Relleno de lo que queda fuera de la imagen. */
  edge: EdgeMode
  /** 'rest': solo dentro del rectángulo de la capa en reposo (shake/zoom); 'none': todo el lienzo. */
  edgeClip: 'rest' | 'none'
  /** Repeticiones de la imagen dentro de la capa (Mirror/Tile). */
  tiles: number
  tileMode: EdgeMode
  /** Motion blur: nº de muestras y obturación (fracción de fotograma). */
  motionBlur: { samples: number; shutter: number } | null
}

/** Rasgos propios de un clip (sin herencia). Los parámetros de los efectos de transformación también cuentan. */
export function ownTraits(clip: Clip, localT: number): Partial<LayerTraits> {
  const out: Partial<LayerTraits> = {}
  for (const { fx, m } of activeEffects(clip)) {
    const p = evalEffectParams(fx, localT)
    if (m.id === 'mirrorTile') {
      out.tiles = Math.max(1, p.tiles)
      out.tileMode = (Math.round(p.mode) + 1) as EdgeMode
      if (p.fill >= 0.5) {
        out.edge = out.tileMode
        out.edgeClip = 'none'
      }
    } else if (m.kind === 'transform' && 'edges' in p && out.edge === undefined) {
      out.edge = Math.round(p.edges) as EdgeMode
      out.edgeClip = 'rest'
    }
    if (m.id === 'motionBlur') out.motionBlur = { samples: Math.max(2, Math.round(p.samples)), shutter: p.shutter / 360 }
    else if (m.kind === 'transform' && 'motionBlur' in p && p.motionBlur > 0 && !out.motionBlur) {
      out.motionBlur = { samples: 12, shutter: (p.motionBlur / 100) * 1.5 }
    }
  }
  return out
}

/**
 * Rasgos efectivos de una capa: los suyos y, para el relleno de bordes y el
 * motion blur, los del primer antepasado que los tenga (un null con shake
 * hace que sus hijos rellenen bordes y se desenfoquen con su movimiento).
 */
export function resolveTraits(clip: Clip, t: number, parentOf: (c: Clip) => Clip | undefined): LayerTraits {
  const own = ownTraits(clip, t - clip.start)
  const out: LayerTraits = {
    edge: own.edge ?? 0,
    edgeClip: own.edgeClip ?? 'rest',
    tiles: own.tiles ?? 1,
    tileMode: own.tileMode ?? 1,
    motionBlur: own.motionBlur ?? null
  }
  let cur = parentOf(clip)
  for (let d = 0; cur && d < 32 && (own.edge === undefined || !out.motionBlur); d++) {
    const tr = ownTraits(cur, t - cur.start)
    if (own.edge === undefined && tr.edge !== undefined && out.edge === 0) {
      out.edge = tr.edge
      out.edgeClip = tr.edgeClip ?? 'rest'
    }
    if (!out.motionBlur && tr.motionBlur) out.motionBlur = tr.motionBlur
    cur = parentOf(cur)
  }
  return out
}
