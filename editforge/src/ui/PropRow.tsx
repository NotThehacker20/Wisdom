import { evalProp, keyframeAt, nextKeyTime } from '@/core/anim'
import { frameRound } from '@/core/timeline'
import { getProp, setPropValue, toggleKeyframes, type PropDef } from '@/core/props'
import type { Clip } from '@/core/types'
import { playback, usePlayback } from '@/state/playback'
import { useProject } from '@/state/projectStore'
import { useUi } from '@/state/uiStore'
import { NumberField } from './NumberField'

/**
 * Fila de propiedad animable: botón ◆ (keyframe en el cabezal), saltos al
 * keyframe anterior/siguiente y valor evaluado en el cabezal (con auto-key).
 */
export function PropRow({ clip, def }: { clip: Clip; def: PropDef }) {
  const time = usePlayback((s) => s.time)
  const fps = useProject((s) => s.project.settings.fps)
  const apply = useProject((s) => s.apply)
  const active = useUi((s) => s.activeProp)
  const setActiveProp = useUi((s) => s.setActiveProp)
  const prop = getProp(clip, def.path)
  if (!prop) return null
  const local = frameRound(time, fps) - clip.start
  const animated = !!prop.keyframes?.length
  const onKey = !!keyframeAt(prop, local)
  const isActive = active?.clipId === clip.id && active.path === def.path
  const prev = animated ? nextKeyTime(prop, local, -1) : undefined
  const next = animated ? nextKeyTime(prop, local, 1) : undefined
  const go = (t: number | undefined) => {
    if (t === undefined) return
    playback.pause()
    playback.seek(clip.start + t)
  }

  return (
    <div className={`prop-row ${isActive ? 'active' : ''}`} onPointerDown={(e) => setActiveProp(clip.id, def.path, e.ctrlKey || e.metaKey)}>
      <button className="kf-nav" disabled={prev === undefined} onClick={() => go(prev)} title="Keyframe anterior">
        ‹
      </button>
      <button
        className={`kf-btn ${onKey ? 'on' : animated ? 'anim' : ''}`}
        title={onKey ? 'Quitar keyframe' : 'Añadir keyframe en el cabezal (Alt+K)'}
        onClick={() => apply(onKey ? 'Quitar keyframe' : 'Keyframe', (p) => toggleKeyframes(p, clip.id, [def.path], local))}
      >
        ◆
      </button>
      <button className="kf-nav" disabled={next === undefined} onClick={() => go(next)} title="Keyframe siguiente">
        ›
      </button>
      <div className="prop-field" onDoubleClick={(e) => (e.target as HTMLElement).classList.contains('numfield-label') && apply(`Restablecer ${def.label}`, (p) => setPropValue(p, clip.id, def.path, local, def.default))}>
        <NumberField
          label={def.label}
          value={evalProp(prop, local)}
          step={def.step}
          unit={def.unit}
          min={def.min}
          max={def.max}
          decimals={def.decimals}
          onChange={(v) => apply(`Cambiar ${def.label}`, (p) => setPropValue(p, clip.id, def.path, local, v), `${clip.id}|${def.path}|${local.toFixed(4)}`)}
        />
      </div>
    </div>
  )
}
