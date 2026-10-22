import { useEffect, useRef, useState } from 'react';
import { formatBytes, formatTime } from '../lib/format';
import { goToHistory, redo, undo } from '../state/actions';
import { historyBytes } from '../state/history';
import { useStore } from '../state/store';
import { IconButton } from './controls';
import { IconRedo, IconUndo } from './icons';

/** Historial visible: cada paso con nombre; un clic vuelve a ese momento. */
export function HistoryList() {
  const history = useStore((s) => s.history);
  const index = useStore((s) => s.historyIndex);
  const [open, setOpen] = useState(true);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [index, history.length]);

  return (
    <section className={`history ${open ? 'is-open' : ''}`}>
      <header className="history__header">
        <button type="button" className="history__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          Historial <span className="history__count">{index + 1} de {history.length}</span>
        </button>
        <div className="history__actions">
          <IconButton label="Deshacer (Ctrl+Z)" disabled={index <= 0} onClick={undo}>
            <IconUndo size={18} />
          </IconButton>
          <IconButton label="Rehacer (Ctrl+Y)" disabled={index >= history.length - 1} onClick={redo}>
            <IconRedo size={18} />
          </IconButton>
        </div>
      </header>
      {open && (
        <>
          <ol className="history__list" ref={list}>
            {history.map((entry, i) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`history__item ${i === index ? 'is-current' : ''} ${i > index ? 'is-future' : ''}`}
                  onClick={() => goToHistory(i)}
                  title={entry.detail ?? entry.label}
                >
                  <span className="history__label">{entry.label}</span>
                  <span className="history__time">{formatTime(new Date(entry.time))}</span>
                  {entry.detail && <span className="history__detail">{entry.detail}</span>}
                </button>
              </li>
            ))}
          </ol>
          <p className="history__foot">
            El original no se modifica. Memoria del historial: {formatBytes(historyBytes(history))}.
          </p>
        </>
      )}
    </section>
  );
}
