// Codificador PNG propio: control total sobre el formato (24 bits o paleta de 8 bits)
// y sobre los metadatos (DPI en pHYs, ficha de exportación en iTXt, perfil sRGB).
import { zlibSync } from 'fflate';
import { dpiToPixelsPerMeter, pixelsPerMeterToDpi } from './units';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function asciiBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(asciiBytes(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk, 4, 8 + data.length));
  return chunk;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function ihdr(width: number, height: number, bitDepth: number, colorType: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = bitDepth;
  data[9] = colorType;
  data[10] = 0; // compresión deflate
  data[11] = 0; // filtros estándar
  data[12] = 0; // sin entrelazado
  return makeChunk('IHDR', data);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Aplica los filtros PNG por fila. Con `adaptive` elige, para cada fila, el filtro
 * que minimiza la suma de diferencias absolutas (la heurística de libpng).
 */
function filterScanlines(
  raw: Uint8Array,
  width: number,
  height: number,
  bpp: number,
  adaptive: boolean,
): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  const best = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const prev = row - stride;
    const outRow = y * (stride + 1);

    if (!adaptive) {
      out[outRow] = 0;
      out.set(raw.subarray(row, row + stride), outRow + 1);
      continue;
    }

    let bestSum = Infinity;
    let bestType = 0;
    for (let type = 0; type < 5; type++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const cur = raw[row + x];
        const left = x >= bpp ? raw[row + x - bpp] : 0;
        const up = y > 0 ? raw[prev + x] : 0;
        const upLeft = y > 0 && x >= bpp ? raw[prev + x - bpp] : 0;
        let value: number;
        switch (type) {
          case 0:
            value = cur;
            break;
          case 1:
            value = cur - left;
            break;
          case 2:
            value = cur - up;
            break;
          case 3:
            value = cur - ((left + up) >> 1);
            break;
          default:
            value = cur - paeth(left, up, upLeft);
        }
        value &= 0xff;
        candidate[x] = value;
        sum += value < 128 ? value : 256 - value;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        bestType = type;
        best.set(candidate);
      }
    }
    out[outRow] = bestType;
    out.set(best, outRow + 1);
  }
  return out;
}

export interface EncodeOptions {
  /** Nivel de compresión deflate (1 = rápido, 9 = máximo). */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

const IEND = makeChunk('IEND', new Uint8Array(0));

/** PNG de 24 bits + transparencia (RGBA, 8 bits por canal). */
export function encodePngRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: EncodeOptions = {},
): Uint8Array {
  const raw = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length);
  const filtered = filterScanlines(raw, width, height, 4, true);
  const idat = zlibSync(filtered, { level: options.level ?? 6 });
  return concat([SIGNATURE, ihdr(width, height, 8, 6), makeChunk('IDAT', idat), IEND]);
}

/** PNG de 24 bits sin transparencia (RGB), para fondos sólidos. */
export function encodePngRgb(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: EncodeOptions = {},
): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  const filtered = filterScanlines(rgb, width, height, 3, true);
  const idat = zlibSync(filtered, { level: options.level ?? 6 });
  return concat([SIGNATURE, ihdr(width, height, 8, 2), makeChunk('IDAT', idat), IEND]);
}

/**
 * PNG de paleta (PNG-8): cada píxel es un índice a una paleta de hasta 256 colores.
 * `palette` contiene RGBA por color; la transparencia va en el bloque tRNS.
 */
export function encodePngIndexed(
  indices: Uint8Array,
  palette: Uint8Array,
  width: number,
  height: number,
  options: EncodeOptions = {},
): Uint8Array {
  const count = palette.length / 4;
  if (count < 1 || count > 256) throw new Error('La paleta debe tener entre 1 y 256 colores.');

  const plte = new Uint8Array(count * 3);
  let lastOpaque = -1;
  for (let i = 0; i < count; i++) {
    plte[i * 3] = palette[i * 4];
    plte[i * 3 + 1] = palette[i * 4 + 1];
    plte[i * 3 + 2] = palette[i * 4 + 2];
    if (palette[i * 4 + 3] !== 255) lastOpaque = i;
  }

  const parts: Uint8Array[] = [SIGNATURE, ihdr(width, height, 8, 3), makeChunk('PLTE', plte)];
  if (lastOpaque >= 0) {
    const trns = new Uint8Array(lastOpaque + 1);
    for (let i = 0; i <= lastOpaque; i++) trns[i] = palette[i * 4 + 3];
    parts.push(makeChunk('tRNS', trns));
  }
  // Para imágenes de paleta, libpng recomienda no filtrar las filas.
  const filtered = filterScanlines(indices, width, height, 1, false);
  parts.push(makeChunk('IDAT', zlibSync(filtered, { level: options.level ?? 9 })), IEND);
  return concat(parts);
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) return false;
  return true;
}

export function readChunks(png: Uint8Array): PngChunk[] {
  if (!isPng(png)) throw new Error('El archivo no es un PNG válido.');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function physData(dpi: number): Uint8Array {
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  const ppm = dpiToPixelsPerMeter(dpi);
  view.setUint32(0, ppm);
  view.setUint32(4, ppm);
  data[8] = 1; // unidad: metro
  return data;
}

function itxtData(keyword: string, text: string): Uint8Array {
  const key = asciiBytes(keyword);
  const value = new TextEncoder().encode(text);
  // palabra clave \0 compresión(0) método(0) idioma\0 palabra traducida\0 texto UTF-8
  const header = new Uint8Array(key.length + 5);
  header.set(key, 0);
  // los 5 bytes siguientes quedan en 0: separador, sin compresión, método, idioma vacío, traducción vacía
  return concat([header, value]);
}

function textData(keyword: string, text: string): Uint8Array {
  return concat([asciiBytes(keyword), new Uint8Array([0]), asciiBytes(text)]);
}

export interface PngMetadata {
  /** DPI que se escriben en el bloque pHYs. */
  dpi?: number;
  /** Marca la imagen como sRGB (colores consistentes en web e impresión de escritorio). */
  srgb?: boolean;
  /** Textos ASCII (bloque tEXt), por ejemplo Software. */
  text?: Record<string, string>;
  /** Textos con acentos (bloque iTXt, UTF-8), por ejemplo Description. */
  intlText?: Record<string, string>;
}

/**
 * Reemplaza los metadatos de un PNG ya codificado: quita pHYs, sRGB, tEXt e iTXt
 * existentes y escribe los nuevos. No toca los píxeles.
 */
export function setPngMetadata(png: Uint8Array, meta: PngMetadata): Uint8Array {
  const chunks = readChunks(png);
  const drop = new Set(['pHYs', 'sRGB', 'tEXt', 'iTXt', 'zTXt', 'gAMA', 'cHRM', 'iCCP']);
  const kept = chunks.filter((c) => !drop.has(c.type));

  const before: Uint8Array[] = [];
  if (meta.srgb) before.push(makeChunk('sRGB', new Uint8Array([0])));
  if (meta.dpi && meta.dpi > 0) before.push(makeChunk('pHYs', physData(meta.dpi)));
  const texts: Uint8Array[] = [];
  for (const [k, v] of Object.entries(meta.text ?? {})) texts.push(makeChunk('tEXt', textData(k, v)));
  for (const [k, v] of Object.entries(meta.intlText ?? {})) texts.push(makeChunk('iTXt', itxtData(k, v)));

  const parts: Uint8Array[] = [SIGNATURE];
  for (const chunk of kept) {
    if (chunk.type === 'IEND') parts.push(...texts);
    parts.push(makeChunk(chunk.type, chunk.data));
    // sRGB y pHYs deben ir antes de PLTE e IDAT: justo después de IHDR.
    if (chunk.type === 'IHDR') parts.push(...before);
  }
  return concat(parts);
}

/** Lee el DPI guardado en un PNG (bloque pHYs). Devuelve null si no hay dato. */
export function readPngDpi(png: Uint8Array): number | null {
  try {
    const phys = readChunks(png).find((c) => c.type === 'pHYs');
    if (!phys || phys.data.length < 9 || phys.data[8] !== 1) return null;
    const view = new DataView(phys.data.buffer, phys.data.byteOffset, 9);
    const dpi = pixelsPerMeterToDpi(view.getUint32(0));
    return dpi > 0 ? dpi : null;
  } catch {
    return null;
  }
}

/** Lee los textos (tEXt e iTXt sin comprimir) de un PNG. */
export function readPngText(png: Uint8Array): Record<string, string> {
  const result: Record<string, string> = {};
  for (const chunk of readChunks(png)) {
    if (chunk.type === 'tEXt') {
      const zero = chunk.data.indexOf(0);
      if (zero > 0) {
        const key = String.fromCharCode(...chunk.data.subarray(0, zero));
        result[key] = String.fromCharCode(...chunk.data.subarray(zero + 1));
      }
    } else if (chunk.type === 'iTXt') {
      const zero = chunk.data.indexOf(0);
      if (zero <= 0) continue;
      const key = String.fromCharCode(...chunk.data.subarray(0, zero));
      const compressed = chunk.data[zero + 1];
      if (compressed) continue;
      let pos = zero + 3;
      pos = chunk.data.indexOf(0, pos) + 1; // idioma
      pos = chunk.data.indexOf(0, pos) + 1; // palabra traducida
      result[key] = new TextDecoder().decode(chunk.data.subarray(pos));
    }
  }
  return result;
}
