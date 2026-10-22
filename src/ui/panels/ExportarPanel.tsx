import { formatCm, pxToCm } from '../../imaging/units';
import { formatBytes, formatDims } from '../../lib/format';
import { exportKey, prepareExport, saveExport, saveReport, updateExport } from '../../state/actions';
import { useStore } from '../../state/store';
import { Button, Note, Section, Segmented, Slider, Toggle } from '../controls';
import { IconDownload, IconFile } from '../icons';

export function ExportarPanel() {
  const settings = useStore((s) => s.exportSettings);
  const prepared = useStore((s) => s.prepared);
  const upToDate = useStore((s) => Boolean(s.prepared && s.prepared.key === exportKey(s)));
  const busy = useStore((s) => Boolean(s.busy));
  const jpg = settings.format === 'jpg';

  return (
    <div className="panel">
      <Section title="Lienzo">
        <Toggle
          label="Quitar bordes vacíos"
          checked={settings.trim}
          onChange={(v) => updateExport({ trim: v })}
          hint="Recorta el lienzo justo al contorno del objeto."
        />
        <Slider
          label="Margen"
          value={settings.paddingPercent}
          min={0}
          max={30}
          unit="%"
          onChange={(v) => updateExport({ paddingPercent: v })}
          hint="Espacio transparente alrededor, como porcentaje del lado más largo."
        />
        <Toggle label="Lienzo cuadrado" checked={settings.square} onChange={(v) => updateExport({ square: v })} />
        <Segmented
          label="Fondo"
          value={jpg ? 'color' : settings.background}
          onChange={(v) => updateExport({ background: v })}
          options={[
            { value: 'transparent', label: 'Transparente', disabled: jpg, title: jpg ? 'JPG no admite transparencia' : undefined },
            { value: 'color', label: 'Color' },
          ]}
        />
        {(settings.background === 'color' || jpg) && (
          <div className="color-row">
            <input
              type="color"
              className="color-input color-input--large"
              aria-label="Color de fondo"
              value={settings.backgroundColor}
              onChange={(e) => updateExport({ backgroundColor: e.target.value })}
            />
            <span className="meta">{settings.backgroundColor.toUpperCase()}</span>
          </div>
        )}
      </Section>

      <Section title="Archivo">
        <div className="field">
          <label className="field__label" htmlFor="file-name">
            Nombre
          </label>
          <div className="text-field">
            <input
              id="file-name"
              type="text"
              value={settings.fileName}
              spellCheck={false}
              onChange={(e) => updateExport({ fileName: e.target.value })}
            />
            <span className="text-field__suffix">.{settings.format === 'jpg' ? 'jpg' : settings.format}</span>
          </div>
        </div>
        {settings.format === 'png' && (
          <Toggle
            label="Guardar la ficha dentro del PNG"
            checked={settings.embedReport}
            onChange={(v) => updateExport({ embedReport: v })}
            hint="Queda en los metadatos del archivo: tamaño, DPI y los pasos que hiciste."
          />
        )}
      </Section>

      <Section title="Resultado" description="Ves el archivo exacto (tamaño, peso y aspecto) antes de guardarlo.">
        <Button variant={upToDate ? 'secondary' : 'primary'} size="lg" disabled={busy} onClick={() => void prepareExport()}>
          {prepared ? 'Preparar de nuevo' : 'Preparar y ver el resultado'}
        </Button>

        {prepared && !upToDate && (
          <Note kind="warning">Cambiaste algo después de preparar. Al guardar se vuelve a preparar con los ajustes nuevos.</Note>
        )}

        {prepared && (
          <div className={`result ${upToDate ? '' : 'is-stale'}`}>
            <div className="result__preview">
              <img src={prepared.previewUrl} alt="Vista previa del archivo exportado" />
            </div>
            <dl className="facts">
              <div>
                <dt>Tamaño</dt>
                <dd>{formatDims(prepared.width, prepared.height)}</dd>
              </div>
              <div>
                <dt>Peso</dt>
                <dd>{formatBytes(prepared.bytes.length)}</dd>
              </div>
              <div>
                <dt>A {prepared.dpi} DPI</dt>
                <dd>
                  {formatCm(pxToCm(prepared.width, prepared.dpi))} × {formatCm(pxToCm(prepared.height, prepared.dpi))} cm
                </dd>
              </div>
              <div>
                <dt>Formato</dt>
                <dd>
                  {prepared.extension === 'png'
                    ? prepared.pngMode === 'png8'
                      ? `PNG-8, ${prepared.paletteColors} colores${prepared.exactPalette ? ' (sin pérdida)' : ''}`
                      : 'PNG-24'
                    : prepared.extension.toUpperCase()}
                  {prepared.optimized ? ', optimizado' : ''}
                </dd>
              </div>
            </dl>
            {prepared.analysisReason && <p className="meta">{prepared.analysisReason}</p>}
            {prepared.warning && <Note kind="warning">{prepared.warning}</Note>}
            <div className="button-row">
              <Button variant="primary" size="lg" icon={<IconDownload size={18} />} disabled={busy} onClick={() => void saveExport()}>
                Guardar archivo
              </Button>
              <Button variant="ghost" icon={<IconFile size={18} />} onClick={() => void saveReport()}>
                Guardar ficha
              </Button>
            </div>
            <details className="report">
              <summary>Ver la ficha</summary>
              <pre>{prepared.report}</pre>
            </details>
          </div>
        )}
      </Section>
    </div>
  );
}
