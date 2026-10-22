// Conversión entre píxeles, centímetros y DPI.
// DPI = puntos (píxeles) por pulgada. 1 pulgada = 2,54 cm.
// El DPI NO cambia la cantidad de píxeles: solo dice a qué tamaño físico imprimirlos.

export const CM_PER_INCH = 2.54;

export function pxToCm(px: number, dpi: number): number {
  return (px / dpi) * CM_PER_INCH;
}

export function cmToPx(cm: number, dpi: number): number {
  return Math.round((cm / CM_PER_INCH) * dpi);
}

/**
 * Ancho impreso "natural" (sin agrandar ni achicar) de `px` píxeles a `dpi`.
 * Se guarda con 3 decimales: con 1 decimal, 1200 px a 300 DPI darían 10,2 cm y al
 * volver a píxeles saldrían 1205 (se reescalaría la imagen sin necesidad).
 */
export function naturalPrintCm(px: number, dpi: number): number {
  return Math.round(pxToCm(px, dpi) * 1000) / 1000;
}

/** DPI reales que tendría una imagen de `px` píxeles impresa a `cm` centímetros. */
export function effectiveDpi(px: number, cm: number): number {
  if (cm <= 0) return 0;
  return px / (cm / CM_PER_INCH);
}

/** Píxeles por metro, la unidad que usa el bloque pHYs del PNG. */
export function dpiToPixelsPerMeter(dpi: number): number {
  return Math.round(dpi / 0.0254);
}

export function pixelsPerMeterToDpi(ppm: number): number {
  return Math.round(ppm * 0.0254);
}

export type PrintVerdict = 'excelente' | 'buena' | 'lejos' | 'baja';

/** Calidad de impresión según los DPI reales. */
export function printVerdict(dpi: number): PrintVerdict {
  if (dpi >= 290) return 'excelente';
  if (dpi >= 200) return 'buena';
  if (dpi >= 120) return 'lejos';
  return 'baja';
}

export const VERDICT_TEXT: Record<PrintVerdict, string> = {
  excelente: 'Nítida aunque se mire de cerca.',
  buena: 'Buena de cerca; los detalles finos pueden suavizarse.',
  lejos: 'Sirve para piezas que se miran de lejos, como carteles grandes.',
  baja: 'Se verá pixelada. Usa menos centímetros o una imagen más grande.',
};

export interface Paper {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
}

export const PAPERS: Paper[] = [
  { id: 'a4', name: 'A4', widthCm: 21, heightCm: 29.7 },
  { id: 'carta', name: 'Carta', widthCm: 21.59, heightCm: 27.94 },
  { id: 'a3', name: 'A3', widthCm: 29.7, heightCm: 42 },
  { id: 'a5', name: 'A5', widthCm: 14.8, heightCm: 21 },
  { id: 'foto', name: 'Foto 10 × 15', widthCm: 10, heightCm: 15 },
];

/** Redondea a 1 decimal con coma, como se escribe en español. */
export function formatCm(cm: number): string {
  return cm.toLocaleString('es', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}
