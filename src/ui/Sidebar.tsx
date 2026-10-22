import { useEffect, useRef } from 'react';
import { useStore, type Step } from '../state/store';
import { HistoryList } from './HistoryList';
import { CalidadPanel } from './panels/CalidadPanel';
import { ExportarPanel } from './panels/ExportarPanel';
import { RecortarPanel } from './panels/RecortarPanel';
import { RefinarPanel } from './panels/RefinarPanel';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'recortar', label: 'Recortar' },
  { id: 'refinar', label: 'Refinar' },
  { id: 'calidad', label: 'Calidad' },
  { id: 'exportar', label: 'Exportar' },
];

export function Sidebar() {
  const step = useStore((s) => s.step);
  const hasDoc = useStore((s) => Boolean(s.doc));
  const panel = useRef<HTMLDivElement>(null);

  // Cada paso empieza desde arriba, aunque el anterior se haya desplazado.
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [step]);

  return (
    <aside className="sidebar" aria-label="Pasos">
      <nav className="steps" aria-label="Pasos del recorte">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`steps__item ${step === s.id ? 'is-current' : ''}`}
            aria-current={step === s.id ? 'step' : undefined}
            disabled={!hasDoc}
            onClick={() => useStore.setState({ step: s.id })}
          >
            <span className="steps__number">{i + 1}</span>
            <span className="steps__label">{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__panel" ref={panel}>
        {!hasDoc ? (
          <div className="sidebar__empty">
            <p>Abre una imagen para empezar. Los pasos van en orden, pero puedes volver a cualquiera cuando quieras.</p>
            <ol className="plain-steps">
              <li>
                <strong>Recortar:</strong> la IA quita el fondo, o lo haces tú.
              </li>
              <li>
                <strong>Refinar:</strong> pinceles y bordes.
              </li>
              <li>
                <strong>Calidad:</strong> tamaño, DPI, formato y peso, explicados.
              </li>
              <li>
                <strong>Exportar:</strong> ves el resultado exacto antes de guardarlo.
              </li>
            </ol>
          </div>
        ) : step === 'recortar' ? (
          <RecortarPanel />
        ) : step === 'refinar' ? (
          <RefinarPanel />
        ) : step === 'calidad' ? (
          <CalidadPanel />
        ) : (
          <ExportarPanel />
        )}
      </div>

      {hasDoc && <HistoryList />}
    </aside>
  );
}
