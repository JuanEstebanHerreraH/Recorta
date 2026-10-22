import { useRef } from 'react';
import { ACCEPT_ATTRIBUTE } from '../lib/image-io';
import { handleFiles, imageFiles } from '../state/files';
import { useStore } from '../state/store';
import { Button } from './controls';

export function EmptyState() {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="empty">
      <div className="empty__sheet">
        <h1 className="empty__title">Arrastra una imagen aquí</h1>
        <p className="empty__lead">
          O pégala con <kbd>Ctrl</kbd> + <kbd>V</kbd>. Quitas el fondo, ajustas el borde y la guardas con el tamaño, los
          DPI y el peso que necesitas.
        </p>
        <div className="empty__actions">
          <input
            ref={input}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            hidden
            onChange={(e) => {
              handleFiles(imageFiles(e.target.files));
              e.target.value = '';
            }}
          />
          <Button variant="primary" size="lg" onClick={() => input.current?.click()}>
            Elegir imagen
          </Button>
          <Button variant="ghost" size="lg" onClick={() => useStore.setState({ mode: 'lote' })}>
            Procesar muchas a la vez
          </Button>
        </div>
        <p className="empty__fine">
          Tus imágenes no salen de esta computadora: la IA trabaja aquí mismo, sin cuentas ni límites diarios. PNG, JPG,
          WebP, AVIF, GIF y BMP.
        </p>
      </div>
    </div>
  );
}
