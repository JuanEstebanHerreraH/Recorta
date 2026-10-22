import { useStore } from '../state/store';
import { ProgressBar } from './controls';

/** Barra de trabajo en curso: qué está pasando y cuánto falta. */
export function BusyBar() {
  const busy = useStore((s) => s.busy);
  if (!busy) return <div className="busybar is-idle" aria-hidden="true" />;
  return (
    <div className="busybar" role="status" aria-live="polite">
      <ProgressBar value={busy.progress} />
      <p className="busybar__text">
        <strong>{busy.label}</strong>
        {busy.detail && <span>{busy.detail}</span>}
        {busy.progress !== null && <span>{Math.round(busy.progress)} %</span>}
      </p>
    </div>
  );
}
