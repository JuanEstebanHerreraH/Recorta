import { useState } from 'react';
import { PRESETS, planExport, type SizeMode } from '../../export/settings';
import { TIERS } from '../../hardware/tiers';
import { PAPERS, VERDICT_TEXT, formatCm, printVerdict } from '../../imaging/units';
import { formatDims, formatInt } from '../../lib/format';
import { applyPreset, updateExport } from '../../state/actions';
import { effectiveTier, useStore } from '../../state/store';
import { NumberField, Note, Section, Segmented, Slider, Toggle } from '../controls';
import { useAnalysis, useContentSize, useDocThumbnail } from '../hooks';
import { MatPreview } from '../MatPreview';

const SIZE_MODES: Array<{ value: SizeMode; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'percent', label: '%' },
  { value: 'width', label: 'Ancho px' },
  { value: 'print', label: 'Impresión' },
  { value: 'box', label: 'Lado máx.' },
];

export function CalidadPanel() {
  const settings = useStore((s) => s.exportSettings);
  const tier = useStore(effectiveTier);
  const content = useContentSize(settings.trim);
  const thumbnail = useDocThumbnail();
  const analysis = useAnalysis(settings.trim);
  const [paperId, setPaperId] = useState('a4');
  const paper = PAPERS.find((p) => p.id === paperId) ?? PAPERS[0];

  if (!content) return null;
  const plan = planExport(content, settings);
  const verdict = printVerdict(plan.realDpi);
  const aiAvailable = TIERS[tier].aiUpscaleMaxMP > 0;

  return (
    <div className="panel">
      <Section title="¿Para qué es?" description="Elige el destino y la app configura tamaño, DPI, formato y peso. Después puedes cambiar lo que quieras.">
        <div className="presets" role="radiogroup" aria-label="Destino">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={settings.presetId === preset.id}
              className={`preset ${settings.presetId === preset.id ? 'is-selected' : ''}`}
              onClick={() => applyPreset(preset.id)}
            >
              <span className="preset__name">{preset.name}</span>
              <span className="preset__description">{preset.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tamaño y DPI">
        <p className="meta">
          Contenido {settings.trim ? 'sin bordes vacíos' : 'completo'}: {formatDims(content.width, content.height)}.
        </p>
        <Segmented label="Cómo definir el tamaño" value={settings.sizeMode} options={SIZE_MODES} onChange={(v) => updateExport({ sizeMode: v })} />
        {settings.sizeMode === 'percent' && (
          <Slider label="Escala" value={settings.percent} min={5} max={400} unit="%" onChange={(v) => updateExport({ percent: v })} />
        )}
        {settings.sizeMode === 'width' && (
          <NumberField label="Ancho final" value={settings.widthPx} min={1} max={30000} unit="px" onChange={(v) => updateExport({ widthPx: Math.round(v) })} />
        )}
        {settings.sizeMode === 'print' && (
          <NumberField label="Ancho impreso" value={settings.printWidthCm} min={0.5} max={500} step={0.5} unit="cm" onChange={(v) => updateExport({ printWidthCm: v })} />
        )}
        {settings.sizeMode === 'box' && (
          <NumberField label="Lado más largo" value={settings.boxPx} min={16} max={20000} unit="px" onChange={(v) => updateExport({ boxPx: Math.round(v) })} />
        )}

        <div className="dpi-row">
          <NumberField label="DPI" value={settings.dpi} min={1} max={2400} unit="DPI" onChange={(v) => updateExport({ dpi: Math.round(v) })} />
          <div className="chips" role="group" aria-label="DPI frecuentes">
            {[72, 150, 300].map((dpi) => (
              <button
                key={dpi}
                type="button"
                className={`chip ${settings.dpi === dpi ? 'is-selected' : ''}`}
                onClick={() => updateExport({ dpi })}
              >
                {dpi}
              </button>
            ))}
          </div>
        </div>

        <dl className="facts">
          <div>
            <dt>Archivo final</dt>
            <dd>{formatDims(plan.target.width, plan.target.height)}</dd>
          </div>
          <div>
            <dt>Impreso a {settings.dpi} DPI</dt>
            <dd>
              {formatCm(plan.printCm.width)} × {formatCm(plan.printCm.height)} cm
            </dd>
          </div>
          {settings.sizeMode === 'print' && (
            <div>
              <dt>Detalle real</dt>
              <dd>
                {formatInt(plan.realDpi)} DPI: {VERDICT_TEXT[verdict]}
              </dd>
            </div>
          )}
        </dl>

        {plan.upscaling && (
          <>
            <Note kind="warning">
              Para este tamaño hay que agrandar la imagen ×{plan.scale.toLocaleString('es', { maximumFractionDigits: 1 })}
              {settings.sizeMode === 'print'
                ? `: con ${settings.dpi} DPI a ${formatCm(settings.printWidthCm)} cm hacen falta ${formatInt(plan.requiredWidthPx)} px de ancho y tienes ${formatInt(plan.canvas.width)}.`
                : '.'}{' '}
              Agrandar no recupera detalle que la foto no tiene.
            </Note>
            <Segmented
              label="Cómo agrandar"
              value={settings.upscale}
              onChange={(v) => updateExport({ upscale: v })}
              options={[
                { value: 'quality', label: 'Alta calidad' },
                {
                  value: 'ai',
                  label: 'Con IA',
                  disabled: !aiAvailable,
                  title: aiAvailable ? undefined : 'No disponible en nivel Bajo',
                },
              ]}
              hint={
                aiAvailable
                  ? `La IA inventa detalle creíble (bordes y texturas más nítidos) pero puede crear detalles que no existían. En nivel ${TIERS[tier].name} admite hasta ${TIERS[tier].aiUpscaleMaxMP} MP de entrada.`
                  : 'Agrandar con IA necesita una tarjeta gráfica (nivel Medio o Alto).'
              }
            />
          </>
        )}

        <div className="mat-head">
          <span className="field__label">Ver junto a</span>
          <select className="select" value={paperId} onChange={(e) => setPaperId(e.target.value)} aria-label="Hoja de referencia">
            {PAPERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <MatPreview printCm={plan.printCm} paper={paper} thumbnail={thumbnail} />
        <p className="meta">
          El DPI no cambia los píxeles: indica a qué tamaño se imprimen. InDesign e Illustrator lo usan para colocar la imagen al
          tamaño correcto; en web y pantallas no importa.
        </p>
      </Section>

      <Section title="Formato y peso">
        <Segmented
          value={settings.format}
          onChange={(v) => updateExport({ format: v })}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' },
            { value: 'jpg', label: 'JPG' },
          ]}
        />
        {settings.format === 'png' && (
          <>
            {analysis && (
              <Note kind="success">
                <strong>Recomendado: {analysis.title}.</strong> {analysis.reason}
              </Note>
            )}
            <Segmented
              label="Tipo de PNG"
              value={settings.pngMode}
              onChange={(v) => updateExport({ pngMode: v })}
              options={[
                { value: 'auto', label: 'Automático' },
                { value: 'png24', label: 'PNG-24' },
                { value: 'png8', label: 'PNG-8' },
              ]}
              hint="PNG-24 guarda todos los colores. PNG-8 usa una paleta de hasta 256: pesa mucho menos, pero no sirve para fotos ni degradés."
            />
            {settings.pngMode === 'png8' && (
              <>
                <Slider label="Colores de la paleta" value={settings.colors} min={2} max={256} onChange={(v) => updateExport({ colors: v })} />
                <Toggle
                  label="Tramado"
                  checked={settings.dither}
                  onChange={(v) => updateExport({ dither: v })}
                  hint="Disimula los escalones de color con un patrón fino de puntos."
                />
              </>
            )}
            <Toggle
              label="Optimizar el peso sin pérdida"
              checked={settings.optimize}
              onChange={(v) => updateExport({ optimize: v })}
              hint="Recomprime el archivo con OxiPNG: mismos píxeles, menos peso. Tarda un poco más."
            />
          </>
        )}
        {settings.format !== 'png' && (
          <>
            <Slider label="Calidad" value={settings.quality} min={30} max={100} unit="%" onChange={(v) => updateExport({ quality: v })} />
            <Note kind="warning">
              {settings.format === 'jpg'
                ? 'JPG no tiene transparencia: el fondo será del color elegido en Exportar (blanco por defecto). Comprime con pérdida.'
                : 'WebP pesa poco y admite transparencia, pero no guarda DPI. Ideal para web y stickers; para imprimir, mejor PNG.'}
            </Note>
          </>
        )}
      </Section>
    </div>
  );
}
