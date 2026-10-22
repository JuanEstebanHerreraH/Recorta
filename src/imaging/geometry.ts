// Recorte de bordes vacíos, márgenes, lienzo cuadrado y fondo sólido.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Caja mínima que contiene todo lo visible (alfa mayor que `threshold`). */
export function contentBounds(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  stride = 1,
  offset = 0,
  threshold = 2,
): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[(row + x) * stride + offset] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copia una región de una imagen RGBA. */
export function cropRgba(
  rgba: Uint8ClampedArray,
  width: number,
  rect: Rect,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const src = ((rect.y + y) * width + rect.x) * 4;
    out.set(rgba.subarray(src, src + rect.width * 4), y * rect.width * 4);
  }
  return out;
}

/**
 * Pone la imagen en un lienzo más grande (transparente) con margen.
 * Si `square` es true, el lienzo es cuadrado y la imagen queda centrada.
 */
export function padRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  padding: number,
  square: boolean,
): { data: Uint8ClampedArray; width: number; height: number } {
  let outW = width + padding * 2;
  let outH = height + padding * 2;
  if (square) outW = outH = Math.max(outW, outH);
  if (outW === width && outH === height) return { data: rgba, width, height };
  const offX = Math.floor((outW - width) / 2);
  const offY = Math.floor((outH - height) / 2);
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < height; y++) {
    out.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), ((y + offY) * outW + offX) * 4);
  }
  return { data: out, width: outW, height: outH };
}

/** Aplana la transparencia sobre un color sólido (para JPG o fondos blancos). */
export function flattenOnColor(rgba: Uint8ClampedArray, color: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const [br, bg, bb] = color;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    out[i] = Math.round(rgba[i] * a + br * (1 - a));
    out[i + 1] = Math.round(rgba[i + 1] * a + bg * (1 - a));
    out[i + 2] = Math.round(rgba[i + 2] * a + bb * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

/** Une el color (RGB de `rgb`) con la transparencia de `mask`. */
export function composeRgba(rgb: Uint8ClampedArray, mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgb.length);
  for (let i = 0, p = 0; i < rgb.length; i += 4, p++) {
    out[i] = rgb[i];
    out[i + 1] = rgb[i + 1];
    out[i + 2] = rgb[i + 2];
    out[i + 3] = mask[p];
  }
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0');
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
