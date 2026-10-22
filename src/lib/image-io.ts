// Abrir imágenes, leer su DPI y guardar archivos.
import { readJpegDpi } from '../imaging/jpeg';
import { readPngDpi } from '../imaging/png';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'];
export const ACCEPT_ATTRIBUTE = '.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,image/*';

export interface DecodedImage {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  dpi: number | null;
  hasAlpha: boolean;
}

export async function readDpi(file: Blob): Promise<number | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    if (head[0] === 0x89 && head[1] === 0x50) {
      // El bloque pHYs va antes de los datos de imagen; si el archivo se cortó en el
      // medio de los datos, igual se encuentra.
      return readPngDpiLenient(head);
    }
    if (head[0] === 0xff && head[1] === 0xd8) return readJpegDpi(head);
  } catch {
    // Sin dato de DPI.
  }
  return null;
}

function readPngDpiLenient(head: Uint8Array): number | null {
  // readChunks necesita bloques completos; se recorta hasta el último bloque entero.
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let offset = 8;
  while (offset + 12 <= head.length) {
    const length = view.getUint32(offset);
    if (offset + 12 + length > head.length) break;
    offset += 12 + length;
  }
  const complete = new Uint8Array(offset + 12);
  complete.set(head.subarray(0, offset));
  // IEND artificial para que el lector termine bien.
  complete.set([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130], offset);
  return readPngDpi(complete);
}

interface ImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decodifica el archivo con el método más fiel que el navegador acepte:
 * 1. createImageBitmap girando las fotos de celular según su EXIF (Chrome, Edge, Firefox).
 * 2. Un elemento <img>, que también respeta el EXIF (Safari y WebKit no aceptan las
 *    opciones del paso 1 en todas las versiones; solo existe fuera de los workers).
 * 3. createImageBitmap sin opciones, como último recurso.
 */
async function loadImageSource(file: Blob): Promise<ImageSource> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    // Se prueba el siguiente método.
  }
  if (typeof Image !== 'undefined') {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    throw new Error('No se pudo leer la imagen. Formatos admitidos: PNG, JPG, WebP, AVIF, GIF y BMP.');
  }
}

/** Decodifica una imagen y la achica si supera `maxPixels`. */
export async function decodeImage(file: Blob, maxPixels: number): Promise<DecodedImage> {
  const image = await loadImageSource(file);
  const originalWidth = image.width;
  const originalHeight = image.height;
  let width = originalWidth;
  let height = originalHeight;
  if (width * height > maxPixels) {
    const k = Math.sqrt(maxPixels / (width * height));
    width = Math.max(1, Math.floor(width * k));
    height = Math.max(1, Math.floor(height * k));
  }

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('El navegador no pudo preparar un lienzo para la imagen.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image.source, 0, 0, width, height);
  image.release();
  const rgba = context.getImageData(0, 0, width, height).data;

  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  const dpi = await readDpi(file);
  return { rgba, width, height, originalWidth, originalHeight, dpi, hasAlpha };
}

/** Copia reducida para la IA (los modelos trabajan a 320–1024 px). */
export function downscaleForAi(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxSide: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const source = new OffscreenCanvas(width, height);
  const sourceContext = source.getContext('2d');
  if (!sourceContext) throw new Error('No se pudo preparar la imagen para la IA.');
  // Para la IA solo importa el color: se envía opaco.
  const opaque = new Uint8ClampedArray(rgba);
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  sourceContext.putImageData(new ImageData(opaque, width, height), 0, 0);
  if (scale === 1) return { data: opaque, width, height };
  const target = new OffscreenCanvas(w, h);
  const context = target.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No se pudo preparar la imagen para la IA.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, w, h);
  return { data: context.getImageData(0, 0, w, h).data, width: w, height: h };
}

export type SaveOutcome = 'saved' | 'downloaded' | 'cancelled';

/** Guarda un archivo con "Guardar como" si el navegador lo permite; si no, lo descarga. */
export async function saveFile(bytes: Uint8Array, fileName: string, mime: string): Promise<SaveOutcome> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const extension = fileName.split('.').pop() ?? '';
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: extension.toUpperCase(), accept: { [mime]: [`.${extension}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Si "Guardar como" no está permitido aquí, se descarga normalmente.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || 'imagen';
}
