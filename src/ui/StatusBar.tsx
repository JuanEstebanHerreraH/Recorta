import { requestFit, requestZoom } from '../state/actions';
import { useStore, type ViewBackground, type ViewMode } from '../state/store';
import { IconButton } from './controls';
import { IconFit, IconMinus, IconPlus } from './icons';

// El fondo "color" se elige con el último cuadrito (selector del sistema).
const BACKGROUNDS: Array<{ id: Exclude<ViewBackground, 'color'>; label: string }> = [
  { id: 'checker', label: 'Damero' },
  { id: 'black', label: 'Negro' },
  { id: 'white', label: 'Blanco' },
];

const MODES: Array<{ id: ViewMode; label: string; title: string }> = [
  { id: 'result', label: 'Resultado', title: 'Cómo va a quedar' },
  { id: 'mask', label: 'Máscara', title: 'Lo borrado se ve en rojo, como la película de enmascarar' },
  { id: 'original', label: 'Original', title: 'La imagen sin cambios' },
];

export function StatusBar() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const setView = (patch: Partial<typeof view>) => useStore.setState((s) => ({ view: { ...s.view, ...patch } }));

  if (!doc) return <footer className="statusbar" />;

  return (
    <footer className="statusbar">
      <div className="statusbar__group" role="group" aria-label="Zoom">
        <IconButton label="Alejar" onClick={() => requestZoom(view.zoom / 1.25)}>
          <IconMinus size={18} />
        </IconButton>
        <button type="button" className="zoom-value" title="Ver al 100 % (Ctrl+1)" onClick={() => requestZoom(1)}>
          {Math.round(view.zoom * 100)} %
        </button>
        <IconButton label="Acercar" onClick={() => requestZoom(view.zoom * 1.25)}>
          <IconPlus size={18} />
        </IconButton>
        <IconButton label="Ajustar a la pantalla (Ctrl+0)" onClick={requestFit}>
          <IconFit size={18} />
        </IconButton>
      </div>

      <div className="statusbar__group" role="radiogroup" aria-label="Qué ver">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={view.mode === m.id}
            title={m.title}
            className={`chip ${view.mode === m.id ? 'is-selected' : ''}`}
            onClick={() => setView({ mode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="statusbar__group" role="group" aria-label="Fondo de la vista">
        <span className="statusbar__label">Fondo</span>
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-pressed={view.background === b.id}
            title={`Ver sobre ${b.label.toLowerCase()}`}
            className={`swatch swatch--${b.id} ${view.background === b.id ? 'is-selected' : ''}`}
            onClick={() => setView({ background: b.id, mode: 'result' })}
          >
            <span className="visually-hidden">{b.label}</span>
          </button>
        ))}
        <label
          className={`swatch swatch--color ${view.background === 'color' ? 'is-selected' : ''}`}
          style={{ background: view.color }}
          title="Ver sobre un color propio (clic para elegirlo)"
        >
          <input
            type="color"
            className="swatch__input"
            aria-label="Ver sobre un color propio"
            value={view.color}
            onClick={() => setView({ background: 'color', mode: 'result' })}
            onChange={(e) => setView({ color: e.target.value, background: 'color', mode: 'result' })}
          />
        </label>
      </div>
    </footer>
  );
}
