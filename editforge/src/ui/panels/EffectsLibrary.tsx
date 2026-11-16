const EFFECTS = ['Shake', 'Zoom / Punch-in', 'Motion blur', 'Glow', 'RGB split', 'Corrección de color', 'Glitch', 'VHS', 'Mirror / Tile']
const TRANSITIONS = ['Zoom in/out', 'Whip pan', 'Spin', 'Flash blanco', 'Glitch', 'Luma fade', 'Slide', 'RGB split']

/** Biblioteca de efectos y transiciones. Se llenará desde el registro de plugins (fases 5 y 6). */
export function EffectsLibrary({ kind }: { kind: 'effects' | 'transitions' }) {
  const items = kind === 'effects' ? EFFECTS : TRANSITIONS
  return (
    <div className="fx-library">
      <div className="panel-note">Disponible en la fase {kind === 'effects' ? 5 : 6}.</div>
      <div className="fx-grid">
        {items.map((n) => (
          <div key={n} className="fx-item disabled">
            <div className="fx-swatch" />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
