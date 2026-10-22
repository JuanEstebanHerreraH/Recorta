// "Quitar halo": estima el color real del objeto en los píxeles semitransparentes del
// borde, que conservan parte del color del fondo viejo.
// Método: "Approximate Fast Foreground Colour Estimation" (Forte y Pitié, ICIP 2021),
// el mismo "blur fusion" que usa el repositorio de BiRefNet para refinar el primer plano.
// Se procesa por mosaicos para que la memoria no crezca con imágenes grandes.
import { boxBlur } from './filters';

const TILE = 1024;

export function decontaminate(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  strength = 1,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);
  if (strength <= 0) return out;

  // Los radios se escalan con el tamaño (el método original usa cajas de 90 y 6 px a ~1024 px).
  const size = Math.max(width, height);
  const r1 = clampInt(Math.round((90 * size) / 1024 / 2), 15, 150);
  const r2 = clampInt(Math.round((6 * size) / 1024 / 2), 1, 10);
  const margin = r1 + r2 + 2;

  for (let ty = 0; ty < height; ty += TILE) {
    for (let tx = 0; tx < width; tx += TILE) {
      const cw = Math.min(TILE, width - tx);
      const ch = Math.min(TILE, height - ty);
      if (!hasEdge(mask, width, tx, ty, cw, ch)) continue;

      const x0 = Math.max(0, tx - margin);
      const y0 = Math.max(0, ty - margin);
      const x1 = Math.min(width, tx + cw + margin);
      const y1 = Math.min(height, ty + ch + margin);
      const rw = x1 - x0;
      const rh = y1 - y0;

      const subRgba = new Uint8ClampedArray(rw * rh * 4);
      const subMask = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) {
        const src = ((y0 + y) * width + x0) * 4;
        subRgba.set(rgba.subarray(src, src + rw * 4), y * rw * 4);
        subMask.set(mask.subarray((y0 + y) * width + x0, (y0 + y) * width + x1), y * rw);
      }

      const result = decontaminateRegion(subRgba, subMask, rw, rh, r1, r2, strength);

      for (let y = ty; y < ty + ch; y++) {
        const srcRow = ((y - y0) * rw + (tx - x0)) * 4;
        out.set(result.subarray(srcRow, srcRow + cw * 4), (y * width + tx) * 4);
      }
    }
  }
  return out;
}

function hasEdge(mask: Uint8Array, width: number, x: number, y: number, w: number, h: number): boolean {
  for (let yy = y; yy < y + h; yy++) {
    const row = yy * width;
    for (let xx = x; xx < x + w; xx++) {
      const m = mask[row + xx];
      if (m > 0 && m < 255) return true;
    }
  }
  return false;
}

function decontaminateRegion(
  rgba: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  r1: number,
  r2: number,
  strength: number,
): Uint8ClampedArray {
  const pixels = width * height;
  const out = rgba.slice();

  const alpha = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) alpha[i] = mask[i] / 255;
  const blurredAlpha1 = boxBlur(alpha, width, height, r1);
  const blurredAlpha2 = boxBlur(alpha, width, height, r2);

  const image = new Float32Array(pixels);
  const tmp = new Float32Array(pixels);
  const firstF = new Float32Array(pixels);
  const firstB = new Float32Array(pixels);

  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < pixels; i++) image[i] = rgba[i * 4 + c] / 255;

    // Pasada 1: F = B = imagen, caja grande.
    for (let i = 0; i < pixels; i++) tmp[i] = image[i] * alpha[i];
    const fa1 = boxBlur(tmp, width, height, r1);
    for (let i = 0; i < pixels; i++) tmp[i] = image[i] * (1 - alpha[i]);
    const ba1 = boxBlur(tmp, width, height, r1);
    for (let i = 0; i < pixels; i++) {
      const a = alpha[i];
      const bf = fa1[i] / (blurredAlpha1[i] + 1e-5);
      const bb = ba1[i] / (1 - blurredAlpha1[i] + 1e-5);
      firstF[i] = clamp01(bf + a * (image[i] - a * bf - (1 - a) * bb));
      firstB[i] = bb;
    }

    // Pasada 2: con la estimación anterior y caja chica.
    for (let i = 0; i < pixels; i++) tmp[i] = firstF[i] * alpha[i];
    const fa2 = boxBlur(tmp, width, height, r2);
    for (let i = 0; i < pixels; i++) tmp[i] = firstB[i] * (1 - alpha[i]);
    const ba2 = boxBlur(tmp, width, height, r2);
    for (let i = 0; i < pixels; i++) {
      const m = mask[i];
      if (m === 0 || m === 255) continue;
      const a = alpha[i];
      const bf = fa2[i] / (blurredAlpha2[i] + 1e-5);
      const bb = ba2[i] / (1 - blurredAlpha2[i] + 1e-5);
      const f = clamp01(bf + a * (image[i] - a * bf - (1 - a) * bb));
      const original = image[i];
      out[i * 4 + c] = Math.round((original + (f - original) * strength) * 255);
    }
  }
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
