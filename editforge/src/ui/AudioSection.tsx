import { effectiveGrid } from '@/core/audio/beatMarkers'
import { dbToGain, gainToDb } from '@/core/audio/mix'
import { setClipAudio } from '@/core/props'
import type { Clip } from '@/core/types'
import { useAudioAnalysis } from '@/state/audioAnalysis'
import { useProject } from '@/state/projectStore'
import { NumberField } from './NumberField'

const GRIDS: Array<[NonNullable<Clip['beatGrid']>, string]> = [
  ['beats', 'Cada beat'],
  ['half', 'Cada 2 beats'],
  ['bars', 'Cada compás (4)'],
  ['onsets', 'Golpes (onsets)'],
  ['off', 'Ocultar']
]

/** Volumen, fundidos, silencio y marcadores de beat de un clip con audio. */
export function AudioSection({ clip }: { clip: Clip }) {
  const apply = useProject((s) => s.apply)
  const asset = useProject((s) => (clip.assetId ? s.project.assets[clip.assetId] : undefined))
  const entry = useAudioAnalysis((s) => (clip.assetId ? s.entries[clip.assetId] : undefined))
  if (!asset?.hasAudio) return null
  const set = (label: string, patch: Parameters<typeof setClipAudio>[2], merge?: string) =>
    apply(label, (p) => setClipAudio(p, clip.id, patch), merge ? `${clip.id}|${merge}` : undefined)
  const beats = entry?.beats
  return (
    <div className="inspector-section">
      <h3>Audio</h3>
      <NumberField label="Volumen" value={gainToDb(clip.volume)} step={0.25} min={-60} max={12} unit="dB" decimals={1} onChange={(v) => set('Volumen', { volume: dbToGain(v) }, 'vol')} />
      <NumberField label="Fade in" value={clip.fadeIn ?? 0} step={0.01} min={0} max={clip.duration} unit="s" decimals={2} onChange={(v) => set('Fade in', { fadeIn: v }, 'fi')} />
      <NumberField label="Fade out" value={clip.fadeOut ?? 0} step={0.01} min={0} max={clip.duration} unit="s" decimals={2} onChange={(v) => set('Fade out', { fadeOut: v }, 'fo')} />
      <div className="field-row">
        <span>Silenciar clip</span>
        <input type="checkbox" checked={!!clip.muted} onChange={(e) => set(e.target.checked ? 'Silenciar' : 'Activar sonido', { muted: e.target.checked })} />
      </div>
      <div className="field-row">
        <span>Marcadores de beat</span>
        <select value={effectiveGrid(clip)} onChange={(e) => set('Marcadores de beat', { beatGrid: e.target.value as Clip['beatGrid'] })}>
          {GRIDS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="muted small beat-status">
        {!entry || entry.status === 'analyzing'
          ? 'Analizando el ritmo…'
          : entry.status === 'error'
            ? `No se pudo analizar: ${entry.error}`
            : beats && beats.bpm > 0
              ? `${beats.bpm} BPM · ${beats.beats.length} beats · ${beats.onsets.length} golpes`
              : 'No se detecta ritmo'}
      </div>
      <div className="panel-note">Los beats hacen snap al mover y recortar. Mayús+↑/↓ salta entre beats; Mayús al arrastrar el cabezal se pega a ellos.</div>
    </div>
  )
}
