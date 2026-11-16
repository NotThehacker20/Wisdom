/**
 * Registro de plugins integrados. Para añadir un efecto: crea su manifiesto
 * en src/plugins/effects/ y añádelo a la lista. El núcleo no cambia.
 */
import { registerEffect } from '@/core/effects'
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
}

registerBuiltinPlugins()
