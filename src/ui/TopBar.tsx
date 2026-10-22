import { useRef } from 'react';
import { APP_NAME } from '../config';
import { TIERS } from '../hardware/tiers';
import { ACCEPT_ATTRIBUTE } from '../lib/image-io';
import { closeImage } from '../state/actions';
import { handleFiles, imageFiles } from '../state/files';
import { effectiveTier, useStore } from '../state/store';
import { formatDims } from '../lib/format';
import { IconChip, IconImage, IconStack, LogoMark } from './icons';

export function TopBar() {
  const mode = useStore((s) => s.mode);
  const doc = useStore((s) => s.doc);
  const tier = useStore(effectiveTier);
  const tierChoice = useStore((s) => s.tierChoice);
  const hardware = useStore((s) => s.hardware);
  const input = useRef<HTMLInputElement>(null);

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <LogoMark size={26} />
        <span className="topbar__name">{APP_NAME}</span>
      </div>

      <nav className="topbar__modes" aria-label="Modo de trabajo">
        <button
          type="button"
          className={`mode-tab ${mode === 'editor' ? 'is-active' : ''}`}
          aria-pressed={mode === 'editor'}
          onClick={() => useStore.setState({ mode: 'editor' })}
        >
          <IconImage size={18} /> Una imagen
        </button>
        <button
          type="button"
          className={`mode-tab ${mode === 'lote' ? 'is-active' : ''}`}
          aria-pressed={mode === 'lote'}
          onClick={() => useStore.setState({ mode: 'lote' })}
        >
          <IconStack size={18} /> Lote
        </button>
      </nav>

      <div className="topbar__file">
        {mode === 'editor' && doc && (
          <>
            <span className="topbar__filename" title={doc.name}>
              {doc.name}
            </span>
            <span className="topbar__dims">{formatDims(doc.width, doc.height)}</span>
            <button type="button" className="link-btn" onClick={closeImage}>
              Cerrar
            </button>
          </>
        )}
      </div>

      <div className="topbar__actions">
        <input
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple={mode === 'lote'}
          hidden
          onChange={(e) => {
            handleFiles(imageFiles(e.target.files));
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => input.current?.click()}>
          <span>{mode === 'lote' ? 'Agregar imágenes' : 'Abrir imagen'}</span>
        </button>
        <button
          type="button"
          className={`tier-badge tier-badge--${tier}`}
          onClick={() => useStore.setState({ hardwareOpen: true })}
          title="Ver tu equipo y cambiar el nivel"
        >
          <IconChip size={18} />
          <span>
            Equipo: {hardware ? TIERS[tier].name : 'detectando'}
            {tierChoice === 'auto' && hardware ? ' (auto)' : ''}
          </span>
        </button>
      </div>
    </header>
  );
}
