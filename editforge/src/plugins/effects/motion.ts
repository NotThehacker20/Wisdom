import type { EffectManifest } from '@/core/effects'
import { fbm1 } from '@/core/noise'
import { EDGES_PARAM } from './shared'

/** Shake: temblor por ruido determinista. Es un efecto de transformación: se hereda por parenting. */
export const shake: EffectManifest = {
  id: 'shake',
  name: 'Shake',
  category: 'Movimiento',
  description: 'Temblor de cámara. En un null, lo heredan todos sus hijos.',
  kind: 'transform',
  params: [
    { name: 'amplitude', label: 'Amplitud', type: 'number', default: 20, min: 0, max: 500, step: 0.5, unit: 'px', decimals: 1 },
    { name: 'frequency', label: 'Frecuencia', type: 'number', default: 12, min: 0, max: 60, step: 0.1, unit: 'Hz', decimals: 1 },
    { name: 'seed', label: 'Semilla', type: 'number', default: 1, min: 0, max: 999, step: 1, decimals: 0 },
    { name: 'x', label: 'Eje X', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%', decimals: 0 },
    { name: 'y', label: 'Eje Y', type: 'number', default: 100, min: 0, max: 100, step: 1, unit: '%', decimals: 0 },
    { name: 'rotation', label: 'Rotación', type: 'number', default: 0, min: 0, max: 45, step: 0.1, unit: '°', decimals: 1 },
    { name: 'decay', label: 'Caída', type: 'number', default: 0, min: 0, max: 10, step: 0.01, unit: 's', decimals: 2 },
    { name: 'motionBlur', label: 'Motion blur', type: 'number', default: 40, min: 0, max: 100, step: 1, unit: '%', decimals: 0 },
    EDGES_PARAM
  ],
  presets: [
    { name: 'Impacto', values: { amplitude: 60, frequency: 25, rotation: 3, decay: 0.35, motionBlur: 60, x: 100, y: 100 } },
    { name: 'Cámara en mano', values: { amplitude: 12, frequency: 1.2, rotation: 1.2, decay: 0, motionBlur: 0, x: 100, y: 100 } },
    { name: 'Terremoto', values: { amplitude: 45, frequency: 16, rotation: 2.5, decay: 0, motionBlur: 50, x: 100, y: 100 } },
    { name: 'Temblor sutil', values: { amplitude: 4, frequency: 9, rotation: 0.3, decay: 0, motionBlur: 20, x: 100, y: 100 } }
  ],
  transform: (p, { t }) => {
    const decay = p.decay > 0 ? Math.exp(-Math.max(0, t) / p.decay) : 1
    const a = p.amplitude * decay
    const ft = t * p.frequency
    const seed = Math.round(p.seed)
    return {
      x: fbm1(ft, seed) * a * (p.x / 100),
      y: fbm1(ft + 101.3, seed) * a * (p.y / 100),
      rotation: fbm1(ft + 211.7, seed) * p.rotation * decay,
      scale: 1,
      px: 0,
      py: 0
    }
  }
}

/** Zoom / punch-in: escala alrededor del anclaje (o de un centro). El motion blur da el desenfoque direccional. */
export const zoom: EffectManifest = {
  id: 'zoom',
  name: 'Zoom / Punch-in',
  category: 'Movimiento',
  description: 'Zoom animable con desenfoque de movimiento según la velocidad del zoom.',
  kind: 'transform',
  params: [
    { name: 'zoom', label: 'Zoom', type: 'number', default: 120, min: 1, max: 1000, step: 0.5, unit: '%', decimals: 1 },
    { name: 'centerX', label: 'Centro X', type: 'number', default: 0, min: -5000, max: 5000, step: 1, unit: 'px', decimals: 0 },
    { name: 'centerY', label: 'Centro Y', type: 'number', default: 0, min: -5000, max: 5000, step: 1, unit: 'px', decimals: 0 },
    { name: 'motionBlur', label: 'Motion blur', type: 'number', default: 60, min: 0, max: 100, step: 1, unit: '%', decimals: 0 },
    EDGES_PARAM
  ],
  presets: [
    { name: 'Punch-in', values: { zoom: [[0, 100], [0.12, 130, 'easeOut']] } },
    { name: 'Punch-out', values: { zoom: [[0, 130], [0.15, 100, 'easeOut']] } },
    { name: 'Zoom lento', values: { zoom: [[0, 100], [2, 115, 'easeInOut']], motionBlur: 0 } },
    { name: 'Rebote', values: { zoom: [[0, 100], [0.3, 125, 'easeOutBack']] } }
  ],
  transform: (p) => ({ x: 0, y: 0, rotation: 0, scale: p.zoom / 100, px: p.centerX, py: p.centerY })
}

/** Motion blur por velocidad de la transformación (posición, escala, rotación, padres y efectos). */
export const motionBlur: EffectManifest = {
  id: 'motionBlur',
  name: 'Motion blur',
  category: 'Movimiento',
  description: 'Desenfoque de movimiento real: muestrea la transformación dentro del obturador.',
  kind: 'layer',
  params: [
    { name: 'samples', label: 'Muestras', type: 'number', default: 12, min: 2, max: 32, step: 0.2, decimals: 0 },
    { name: 'shutter', label: 'Obturador', type: 'number', default: 180, min: 0, max: 720, step: 1, unit: '°', decimals: 0 }
  ],
  presets: [
    { name: 'Cine (180°)', values: { shutter: 180, samples: 12 } },
    { name: 'Extremo', values: { shutter: 540, samples: 24 } }
  ]
}

/** Espejo / mosaico: repite la imagen (para que el zoom o el shake no dejen bordes negros). */
export const mirrorTile: EffectManifest = {
  id: 'mirrorTile',
  name: 'Mirror / Tile',
  category: 'Distorsión',
  description: 'Repite la imagen en espejo o en mosaico; con «Rellenar» cubre todo el lienzo.',
  kind: 'layer',
  params: [
    { name: 'tiles', label: 'Repeticiones', type: 'number', default: 1, min: 1, max: 10, step: 0.05, decimals: 2 },
    { name: 'mode', label: 'Modo', type: 'enum', default: 0, options: ['Espejo', 'Mosaico'] },
    { name: 'fill', label: 'Rellenar lienzo', type: 'bool', default: 1 }
  ]
}

export default [shake, zoom, motionBlur, mirrorTile]
