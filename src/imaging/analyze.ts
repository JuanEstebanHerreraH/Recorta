// Analiza la imagen exportable para recomendar PNG-24 o PNG-8, explicando por qué.
import { countColors } from './quantize';

export type FormatAdvice = 'png8-exact' | 'png8' | 'png24';

export interface ImageAnalysis {
  /** Colores distintos (257 significa "más de 256"). */
  uniqueColors: number;
  hasTransparency: boolean;
  /** Proporción de píxeles semitransparentes (bordes suaves). */
  partialAlpha: number;
  /** 0..1: cuánto hay de degradé o fotografía. */
  smoothness: number;
  advice: FormatAdvice;
  title: string;
  reason: string;
}

export function analyzeImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): ImageAnalysis {
  const pixels = width * height;
  const uniqueColors = countColors(rgba, 256);

  let transparent = 0;
  let partial = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) transparent++;
    else if (rgba[i] < 255) partial++;
  }

  // Muestra de hasta ~512×512 para medir degradés: en una foto o degradé, la mayoría
  // de los vecinos difiere un poco; en una ilustración plana, casi siempre son iguales.
  const step = Math.max(1, Math.round(Math.sqrt(pixels / 262_144)));
  let tiny = 0;
  let total = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x + 1 < width; x += step) {
      const i = (y * width + x) * 4;
      const j = i + 4;
      if (rgba[i + 3] < 250 || rgba[j + 3] < 250) continue;
      const d = Math.max(
        Math.abs(rgba[i] - rgba[j]),
        Math.abs(rgba[i + 1] - rgba[j + 1]),
        Math.abs(rgba[i + 2] - rgba[j + 2]),
      );
      total++;
      if (d > 0 && d <= 6) tiny++;
    }
  }
  const smoothness = total > 0 ? tiny / total : 0;

  let advice: FormatAdvice;
  let title: string;
  let reason: string;
  if (uniqueColors <= 256) {
    advice = 'png8-exact';
    title = 'PNG-8 sin pérdida';
    reason = `La imagen tiene ${uniqueColors} colores: entran completos en una paleta de PNG-8, que se ve idéntica y pesa menos.`;
  } else if (smoothness > 0.2) {
    advice = 'png24';
    title = 'PNG-24';
    reason = 'Tiene degradés o fotografía. Con PNG-8 aparecerían escalones de color visibles.';
  } else {
    advice = 'png8';
    title = 'PNG-8 con 256 colores';
    reason = 'Es una ilustración de colores planos: con 256 colores se verá casi igual y pesará bastante menos. Revisa la vista previa antes de guardar.';
  }

  return {
    uniqueColors,
    hasTransparency: transparent + partial > 0,
    partialAlpha: partial / pixels,
    smoothness,
    advice,
    title,
    reason,
  };
}
