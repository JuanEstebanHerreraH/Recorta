import { useRef } from 'react';
import { PRESETS } from '../export/settings';
import { ACCEPT_ATTRIBUTE } from '../lib/image-io';
import { formatBytes, formatDims } from '../lib/format';
import { applyPreset } from '../state/actions';
import {
  addBatchFiles,
  cancelBatch,
  clearBatch,
  downloadBatchZip,
  openBatchItemInEditor,
  removeBatchItem,
  runBatch,
  updateBatchSettings,
  useBatch,
  type BatchMethod,
} from '../state/batch';
import { imageFiles } from '../state/files';
import { useStore } from '../state/store';
import { Button, Section, Segmented, Slider, Toggle } from './controls';
import { IconDownload, IconTrash } from './icons';

const STATUS_TEXT = {
  pendiente: 'Pendiente',
  procesando: 'Procesando',
  listo: 'Listo',
  error: 'Error',
} as const;

export function BatchView() {
  const items = useBatch((s) => s.items);
  const running = useBatch((s) => s.running);
  const settings = useBatch((s) => s.settings);
  const exportSettings = useStore((s) => s.exportSettings);
  const input = useRef<HTMLInputElement>(null);
  const done = items.filter((i) => i.status === 'listo').length;
  const pending = items.filter((i) => i.status !== 'listo').length;

  return (
    <div className="batch">
      <div className="batch__main">
        <header className="batch__header">
          <div>
            <h1 className="batch__title">Lote</h1>
            <p className="meta">
              Las mismas indicaciones para todas las imágenes. Una a la vez, para no saturar la memoria.
            </p>
          </div>
          <div className="button-row">
            <input
              ref={input}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              multiple
              hidden
              onChange={(e) => {
                addBatchFiles(imageFiles(e.target.files));
                e.target.value = '';
              }}
            />
            <Button onClick={() => input.current?.click()} disabled={running}>
              Agregar imágenes
            </Button>
            {items.length > 0 && (
              <Button variant="ghost" onClick={clearBatch} disabled={running}>
                Vaciar
              </Button>
            )}
          </div>
        </header>

        {items.length === 0 ? (
          <div className="batch__empty">
            <p>Arrastra aquí varias imágenes o usa "Agregar imágenes".</p>
          </div>
        ) : (
          <ul className="batch__grid">
            {items.map((item) => (
              <li key={item.id} className={`batch-item batch-item--${item.status}`}>
                <div className="batch-item__thumb">
                  {item.thumbUrl ? <img src={item.thumbUrl} alt="" /> : <span>{item.file.name.split('.').pop()?.toUpperCase()}</span>}
                </div>
                <div className="batch-item__info">
                  <span className="batch-item__name" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className={`tag tag--${item.status}`}>{STATUS_TEXT[item.status]}</span>
                  {item.result && (
                    <span className="meta">
                      {formatDims(item.result.width, item.result.height)}, {formatBytes(item.result.bytes.length)}
                    </span>
                  )}
                  {item.error && <span className="meta meta--error">{item.error}</span>}
                </div>
                <div className="batch-item__actions">
                  <button type="button" className="link-btn" onClick={() => void openBatchItemInEditor(item.id)} disabled={running}>
                    Abrir en el editor
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Quitar ${item.file.name} del lote`}
                    onClick={() => removeBatchItem(item.id)}
                    disabled={running}
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="sidebar batch__side" aria-label="Ajustes del lote">
        <div className="sidebar__panel">
          <div className="panel">
            <Section title="Qué hacer con cada imagen">
              <Segmented<BatchMethod>
                value={settings.method}
                onChange={(v) => updateBatchSettings({ method: v })}
                options={[
                  { value: 'ia', label: 'Quitar fondo con IA' },
                  { value: 'color', label: 'Quitar color' },
                  { value: 'ninguno', label: 'Solo exportar' },
                ]}
                hint={
                  settings.method === 'color'
                    ? 'Usa el color más común de los bordes y la tolerancia del paso Recortar.'
                    : settings.method === 'ninguno'
                      ? 'Útil para convertir tamaño, DPI o formato de muchas imágenes juntas.'
                      : 'Usa el nivel de equipo actual. Si falla, baja de nivel solo.'
                }
              />
              <Slider
                label="Desplazar borde"
                value={settings.shift}
                min={-10}
                max={10}
                format={(v) => (v === 0 ? 'Sin cambio' : `${v > 0 ? '+' : ''}${v} px`)}
                onChange={(v) => updateBatchSettings({ shift: v })}
              />
              <Slider
                label="Suavizar borde"
                value={settings.feather}
                min={0}
                max={10}
                format={(v) => (v === 0 ? 'Sin cambio' : `${v} px`)}
                onChange={(v) => updateBatchSettings({ feather: v })}
              />
              <Toggle label="Quitar halo" checked={settings.halo} onChange={(v) => updateBatchSettings({ halo: v })} />
            </Section>

            <Section title="Cómo guardarlas" description="Usa los ajustes de Calidad y Exportar del editor. Agrandar con IA no se aplica en lote.">
              <div className="presets presets--compact" role="radiogroup" aria-label="Destino">
                {PRESETS.filter((p) => p.id !== 'custom').map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={exportSettings.presetId === preset.id}
                    className={`preset ${exportSettings.presetId === preset.id ? 'is-selected' : ''}`}
                    onClick={() => applyPreset(preset.id)}
                  >
                    <span className="preset__name">{preset.name}</span>
                    <span className="preset__description">{preset.description}</span>
                  </button>
                ))}
              </div>
              <p className="meta">
                Ahora: {exportSettings.format.toUpperCase()}, {exportSettings.dpi} DPI
                {exportSettings.presetId === 'custom' ? ', ajustes personalizados' : ''}.
              </p>
            </Section>

            <Section title="Procesar">
              {running ? (
                <Button variant="danger" onClick={cancelBatch}>
                  Detener después de la imagen actual
                </Button>
              ) : (
                <Button variant="primary" size="lg" disabled={pending === 0} onClick={() => void runBatch()}>
                  {pending === 0 ? 'Todo listo' : `Procesar ${pending} ${pending === 1 ? 'imagen' : 'imágenes'}`}
                </Button>
              )}
              <Button
                size="lg"
                icon={<IconDownload size={18} />}
                disabled={done === 0 || running}
                onClick={() => void downloadBatchZip()}
              >
                Descargar .zip ({done})
              </Button>
            </Section>
          </div>
        </div>
      </aside>
    </div>
  );
}
