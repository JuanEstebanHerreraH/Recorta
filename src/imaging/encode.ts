// Codificación final del archivo exportado: PNG-24, PNG-8, WebP o JPG, con DPI y ficha.
import { setJpegDpi } from './jpeg';
import { encodePngIndexed, encodePngRgb, encodePngRgba, setPngMetadata } from './png';
import { indicesToRgba, quantizeRgba } from './quantize';

export type ExportFormat = 'png' | 'webp' | 'jpg';
export type PngMode = 'png24' | 'png8';

export interface EncodeSettings {
  format: ExportFormat;
  pngMode: PngMode;
  /** Colores de la paleta para PNG-8 (2..256). */
  colors: number;
  dither: boolean;
  /** Optimización sin pérdida extra (oxipng). */
  optimize: boolean;
  /** Calidad 1..100 para WebP y JPG. */
  quality: number;
  dpi: number;
  /** true si la imagen ya no tiene transparencia (fondo de color). */
  opaque: boolean;
  /** Textos que se guardan dentro del PNG (programa y ficha). */
  text?: { software: string; description: string } | null;
}

export interface EncodedImage {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  paletteColors: number | null;
  exactPalette: boolean;
  optimized: boolean;
  /** Píxeles tal como quedan en el archivo (útil para la vista previa de PNG-8). */
  pixels: Uint8ClampedArray;
  /** Aviso si algo no se pudo aplicar (por ejemplo, la optimización extra). */
  warning?: string;
}

export interface EncodeDeps {
  /** Optimizador PNG sin pérdida; si falla, se usa el PNG sin optimizar. */
  optimizePng?: (png: Uint8Array) => Promise<Uint8Array>;
  /** Codificador del navegador para WebP y JPG. */
  canvasEncode?: (rgba: Uint8ClampedArray, width: number, height: number, mime: string, quality: number) => Promise<Uint8Array>;
}

export async function encodeImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  settings: EncodeSettings,
  deps: EncodeDeps = {},
): Promise<EncodedImage> {
  if (settings.format === 'png') {
    let bytes: Uint8Array;
    let pixels = rgba;
    let paletteColors: number | null = null;
    let exactPalette = false;

    if (settings.pngMode === 'png8') {
      const q = quantizeRgba(rgba, width, height, { colors: settings.colors, dither: settings.dither });
      bytes = encodePngIndexed(q.indices, q.palette, width, height, { level: 9 });
      pixels = indicesToRgba(q.indices, q.palette);
      paletteColors = q.colorCount;
      exactPalette = q.exact;
    } else if (settings.opaque) {
      bytes = encodePngRgb(rgba, width, height, { level: settings.optimize ? 6 : 9 });
    } else {
      bytes = encodePngRgba(rgba, width, height, { level: settings.optimize ? 6 : 9 });
    }

    let optimized = false;
    let warning: string | undefined;
    if (settings.optimize && deps.optimizePng) {
      try {
        const smaller = await deps.optimizePng(bytes);
        if (smaller.length > 0 && smaller.length < bytes.length) bytes = smaller;
        optimized = true;
      } catch {
        warning = 'No se pudo aplicar la optimización extra; el PNG se guardó con compresión normal.';
      }
    }

    bytes = setPngMetadata(bytes, {
      dpi: settings.dpi,
      srgb: true,
      text: settings.text ? { Software: settings.text.software } : undefined,
      intlText: settings.text ? { Description: settings.text.description } : undefined,
    });
    return { bytes, mime: 'image/png', extension: 'png', paletteColors, exactPalette, optimized, pixels, warning };
  }

  if (!deps.canvasEncode) throw new Error('Este entorno no puede codificar WebP ni JPG.');
  const mime = settings.format === 'webp' ? 'image/webp' : 'image/jpeg';
  let bytes = await deps.canvasEncode(rgba, width, height, mime, settings.quality / 100);
  if (settings.format === 'jpg') bytes = setJpegDpi(bytes, settings.dpi);
  return {
    bytes,
    mime,
    extension: settings.format === 'webp' ? 'webp' : 'jpg',
    paletteColors: null,
    exactPalette: false,
    optimized: false,
    pixels: rgba,
    warning:
      settings.format === 'webp'
        ? 'WebP no guarda DPI: si lo vas a imprimir, indica el tamaño en centímetros en tu programa de diseño.'
        : undefined,
  };
}
