import { dismissToast, useStore } from '../state/store';
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast__icon">
            {toast.kind === 'success' ? (
              <IconCheck size={18} />
            ) : toast.kind === 'info' ? (
              <IconInfo size={18} />
            ) : (
              <IconAlert size={18} />
            )}
          </span>
          <div className="toast__text">
            <strong>{toast.title}</strong>
            {toast.body && <p>{toast.body}</p>}
          </div>
          <button type="button" className="toast__close" aria-label="Cerrar aviso" onClick={() => dismissToast(toast.id)}>
            <IconClose size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
