// Reducción de colores para PNG-8 (paleta de hasta 256 colores con transparencia).
// La paleta se calcula con el cuantizador de Wu (librería image-q) sobre una muestra,
// y la asignación de cada píxel (con o sin tramado) se hace aquí con poca memoria.
import { buildPaletteSync, utils } from 'image-q';

const { PointContainer } = utils;

export interface QuantizeOptions {
  /** Cantidad máxima de colores (2..256). */
  colors: number;
  /** Tramado Floyd–Steinberg: disimula escalones en degradés a cambio de un leve ruido. */
  dither: boolean;
}

export interface QuantizeResult {
  indices: Uint8Array;
  /** RGBA por color de la paleta. */
  palette: Uint8Array;
  colorCount: number;
  /** true si la imagen ya tenía pocos colores y no se perdió nada. */
  exact: boolean;
}

function keyOf(r: number, g: number, b: number, a: number): number {
  // Los píxeles totalmente transparentes son todos el mismo "color".
  return a === 0 ? 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

/** Cuenta colores distintos y se detiene al pasar `limit`. */
export function countColors(rgba: Uint8Array | Uint8ClampedArray, limit = 256): number {
  const seen = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) {
    seen.add(keyOf(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]));
    if (seen.size > limit) return seen.size;
  }
  return seen.size;
}

function exactPalette(rgba: Uint8Array | Uint8ClampedArray): QuantizeResult {
  const map = new Map<number, number>();
  const palette: number[] = [];
  const indices = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const a = rgba[i + 3];
    const key = keyOf(rgba[i], rgba[i + 1], rgba[i + 2], a);
    let index = map.get(key);
    if (index === undefined) {
      index = map.size;
      map.set(key, index);
      if (a === 0) palette.push(0, 0, 0, 0);
      else palette.push(rgba[i], rgba[i + 1], rgba[i + 2], a);
    }
    indices[p] = index;
  }
  return { indices, palette: Uint8Array.from(palette), colorCount: map.size, exact: true };
}

function buildPalette(rgba: Uint8Array | Uint8ClampedArray, colors: number, reserveTransparent: boolean): Uint8Array {
  const pixels = rgba.length / 4;
  const maxSamples = 250_000;
  const step = Math.max(1, Math.floor(pixels / maxSamples));
  const sample: number[] = [];
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    if (rgba[i + 3] === 0) continue;
    sample.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
  }
  const target = Math.max(2, colors - (reserveTransparent ? 1 : 0));
  if (sample.length === 0) return new Uint8Array([0, 0, 0, 0]);

  const container = PointContainer.fromUint8Array(Uint8Array.from(sample), sample.length / 4, 1);
  const palette = buildPaletteSync([container], {
    colorDistanceFormula: 'euclidean-bt709',
    paletteQuantization: 'wuquant',
    colors: target,
  });
  const colorsRgba = palette.getPointContainer().toUint8Array();
  if (!reserveTransparent) return colorsRgba;
  const out = new Uint8Array(colorsRgba.length + 4);
  out.set(colorsRgba, 4); // índice 0 = transparente
  return out;
}

export function quantizeRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: QuantizeOptions,
): QuantizeResult {
  const colors = Math.min(256, Math.max(2, Math.round(options.colors)));
  if (countColors(rgba, colors) <= colors) return exactPalette(rgba);

  let hasTransparent = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] === 0) {
      hasTransparent = true;
      break;
    }
  }
  const palette = buildPalette(rgba, colors, hasTransparent);
  const count = palette.length / 4;

  // Paleta premultiplicada para comparar colores con transparencia.
  const pr = new Float32Array(count);
  const pg = new Float32Array(count);
  const pb = new Float32Array(count);
  const pa = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = palette[i * 4 + 3];
    pr[i] = (palette[i * 4] * a) / 255;
    pg[i] = (palette[i * 4 + 1] * a) / 255;
    pb[i] = (palette[i * 4 + 2] * a) / 255;
    pa[i] = a;
  }

  const nearest = (r: number, g: number, b: number, a: number): number => {
    const qr = (r * a) / 255;
    const qg = (g * a) / 255;
    const qb = (b * a) / 255;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < count; i++) {
      const dr = qr - pr[i];
      const dg = qg - pg[i];
      const db = qb - pb[i];
      const da = a - pa[i];
      const d = 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db + da * da;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // Caché: 6 bits por canal de color + 4 de alfa = 4 194 304 entradas.
  const cache = new Int16Array(1 << 22).fill(-1);
  const lookup = (r: number, g: number, b: number, a: number): number => {
    const key = ((r >> 2) << 16) | ((g >> 2) << 10) | ((b >> 2) << 4) | (a >> 4);
    let index = cache[key];
    if (index < 0) {
      index = nearest((r & ~3) | 2, (g & ~3) | 2, (b & ~3) | 2, (a & ~15) | 8);
      cache[key] = index;
    }
    return index;
  };

  const pixels = width * height;
  const indices = new Uint8Array(pixels);
  const transparentIndex = hasTransparent ? 0 : -1;

  if (!options.dither) {
    for (let p = 0; p < pixels; p++) {
      const i = p * 4;
      const a = rgba[i + 3];
      indices[p] = a === 0 && transparentIndex >= 0 ? 0 : lookup(rgba[i], rgba[i + 1], rgba[i + 2], a);
    }
    return { indices, palette, colorCount: count, exact: false };
  }

  // Floyd–Steinberg en serpentina, solo sobre el color (el alfa no se trama para no
  // ensuciar los bordes).
  let errCur = new Float32Array((width + 2) * 3);
  let errNext = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    const leftToRight = y % 2 === 0;
    errNext.fill(0);
    for (let n = 0; n < width; n++) {
      const x = leftToRight ? n : width - 1 - n;
      const p = y * width + x;
      const i = p * 4;
      const a = rgba[i + 3];
      if (a === 0 && transparentIndex >= 0) {
        indices[p] = 0;
        continue;
      }
      const e = (x + 1) * 3;
      const r = clamp(rgba[i] + errCur[e]);
      const g = clamp(rgba[i + 1] + errCur[e + 1]);
      const b = clamp(rgba[i + 2] + errCur[e + 2]);
      const index = lookup(r, g, b, a);
      indices[p] = index;
      const er = r - palette[index * 4];
      const eg = g - palette[index * 4 + 1];
      const eb = b - palette[index * 4 + 2];
      const dir = leftToRight ? 1 : -1;
      const ahead = e + dir * 3;
      const behind = e - dir * 3;
      errCur[ahead] += (er * 7) / 16;
      errCur[ahead + 1] += (eg * 7) / 16;
      errCur[ahead + 2] += (eb * 7) / 16;
      errNext[behind] += (er * 3) / 16;
      errNext[behind + 1] += (eg * 3) / 16;
      errNext[behind + 2] += (eb * 3) / 16;
      errNext[e] += (er * 5) / 16;
      errNext[e + 1] += (eg * 5) / 16;
      errNext[e + 2] += (eb * 5) / 16;
      errNext[ahead] += er / 16;
      errNext[ahead + 1] += eg / 16;
      errNext[ahead + 2] += eb / 16;
    }
    const swap = errCur;
    errCur = errNext;
    errNext = swap;
  }
  return { indices, palette, colorCount: count, exact: false };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Devuelve la imagen RGBA que resulta de aplicar la paleta (para vista previa). */
export function indicesToRgba(indices: Uint8Array, palette: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(indices.length * 4);
  for (let p = 0; p < indices.length; p++) {
    const k = indices[p] * 4;
    out[p * 4] = palette[k];
    out[p * 4 + 1] = palette[k + 1];
    out[p * 4 + 2] = palette[k + 2];
    out[p * 4 + 3] = palette[k + 3];
  }
  return out;
}
