/** Operaciones de edición de clips de texto. */
import { updateClip } from './props'
import { setTextAnimation } from './text'
import type { Clip, Project, TextAnim, TextData, TextStyle } from './types'

type DeepPartialStyle = Partial<Omit<TextStyle, 'stroke' | 'shadow' | 'glow' | 'box'>> & {
  stroke?: Partial<TextStyle['stroke']>
  shadow?: Partial<TextStyle['shadow']>
  glow?: Partial<TextStyle['glow']>
  box?: Partial<TextStyle['box']>
}

export function setTextContent(p: Project, clipId: string, content: string): Project {
  return updateClip(p, clipId, (c) =>
    c.text ? { ...c, text: { ...c.text, content }, name: content.split('\n')[0].slice(0, 40) || 'Texto' } : c
  )
}

export function setTextStyle(p: Project, clipId: string, patch: DeepPartialStyle): Project {
  return updateClip(p, clipId, (c) => {
    if (!c.text) return c
    const s = c.text.style
    const style: TextStyle = {
      ...s,
      ...patch,
      stroke: { ...s.stroke, ...patch.stroke },
      shadow: { ...s.shadow, ...patch.shadow },
      glow: { ...s.glow, ...patch.glow },
      box: { ...s.box, ...patch.box }
    }
    return { ...c, text: { ...c.text, style } as TextData }
  })
}

/** Pone o cambia la animación de entrada/salida (con keyframes de su progreso). */
export function setTextAnim(p: Project, clipId: string, which: 'in' | 'out', anim: TextAnim | null, duration: number): Project {
  return updateClip(p, clipId, (c) => setTextAnimation(c, which, anim, duration, p.settings.fps))
}

/** Cambia solo opciones de la animación (unidad, solapamiento, dirección) sin tocar sus keyframes. */
export function patchTextAnim(p: Project, clipId: string, which: 'in' | 'out', patch: Partial<TextAnim>): Project {
  return updateClip(p, clipId, (c: Clip) => {
    const t = c.text
    const cur = which === 'in' ? t?.animIn : t?.animOut
    if (!t || !cur) return c
    return { ...c, text: { ...t, [which === 'in' ? 'animIn' : 'animOut']: { ...cur, ...patch } } }
  })
}
