// Ficha de exportación: qué se hizo y con qué ajustes (trazabilidad).
import { formatBytes, formatDims } from '../lib/format';
import { formatCm, pxToCm } from '../imaging/units';

export interface ReportInput {
  appName: string;
  appVersion: string;
  sourceName: string;
  sourceSize: { width: number; height: number };
  fileName?: string;
  finalSize: { width: number; height: number };
  dpi: number;
  formatLabel: string;
  steps: string[];
  trimmed: boolean;
  padding: number;
  background: string | null;
  bytes?: number;
  tierLabel: string;
  date: Date;
}

export function formatLabel(
  format: 'png' | 'webp' | 'jpg',
  pngMode: 'png24' | 'png8' | null,
  paletteColors: number | null,
  exact: boolean,
  optimized: boolean,
  quality: number,
): string {
  if (format === 'png') {
    const base =
      pngMode === 'png8'
        ? `PNG-8 con ${paletteColors ?? 256} colores${exact ? ' (sin pérdida)' : ''}`
        : 'PNG-24 con transparencia';
    return optimized ? `${base}, optimizado sin pérdida` : base;
  }
  return `${format === 'webp' ? 'WebP' : 'JPG'} calidad ${quality} %`;
}

export function buildReport(input: ReportInput): string {
  const cmW = formatCm(pxToCm(input.finalSize.width, input.dpi));
  const cmH = formatCm(pxToCm(input.finalSize.height, input.dpi));
  const lines = [
    `${input.appName} ${input.appVersion}: ficha de exportación`,
    '',
    input.fileName ? `Archivo: ${input.fileName}` : null,
    `Fecha: ${input.date.toLocaleString('es')}`,
    `Imagen de origen: ${input.sourceName}, ${formatDims(input.sourceSize.width, input.sourceSize.height)}`,
    `Tamaño final: ${formatDims(input.finalSize.width, input.finalSize.height)}`,
    `DPI: ${input.dpi} (a este valor mide ${cmW} × ${cmH} cm)`,
    `Formato: ${input.formatLabel}`,
    input.bytes !== undefined ? `Peso: ${formatBytes(input.bytes)}` : null,
    `Bordes vacíos: ${input.trimmed ? 'quitados' : 'conservados'}${input.padding > 0 ? `, margen de ${input.padding} px` : ''}`,
    `Fondo: ${input.background ?? 'transparente'}`,
    `Nivel de equipo: ${input.tierLabel}`,
    '',
    'Pasos:',
    ...input.steps.map((step, i) => `  ${i + 1}. ${step}`),
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}
