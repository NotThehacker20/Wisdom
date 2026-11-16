/**
 * Registro de plugins integrados. Para añadir un efecto o una transición: crea
 * su manifiesto en src/plugins/effects/ o src/plugins/transitions/ y añádelo a
 * la lista. El núcleo no cambia.
 */
import { registerEffect } from '@/core/effects'
import { registerTransition } from '@/core/transitions'
import basicTransitions from './transitions/basic'
import stylizedTransitions from './transitions/stylized'
import blur from './effects/blur'
import color from './effects/color'
import distort from './effects/distort'
import motion from './effects/motion'
import stylize from './effects/stylize'

let done = false
export function registerBuiltinPlugins(): void {
  if (done) return
  done = true
  for (const m of [...motion, ...blur, ...color, ...stylize, ...distort]) registerEffect(m)
  for (const m of [...basicTransitions, ...stylizedTransitions]) registerTransition(m)
}

registerBuiltinPlugins()
