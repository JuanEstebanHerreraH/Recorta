// Filtros básicos sobre planos de un canal: desenfoque de caja, gaussiano aproximado,
// máximo/mínimo (dilatar/erosionar) y remuestreo bilineal. Todos son O(n): el tiempo
// no depende del radio, así que funcionan igual con radios grandes.

export type Plane = Float32Array;

/**
 * Desenfoque de caja separable con radio `r` (ventana de 2r+1). En los bordes promedia
 * solo los píxeles que existen, para no oscurecer las orillas de la imagen.
 */
export function boxBlur(src: Plane, width: number, height: number, r: number): Plane {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(r, width - 1); x++) {
      sum += src[row + x];
      count++;
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / count;
      const add = x + r + 1;
      const remove = x - r;
      if (add < width) {
        sum += src[row + add];
        count++;
      }
      if (remove >= 0) {
        sum -= src[row + remove];
        count--;
      }
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y++) {
      sum += tmp[y * width + x];
      count++;
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / count;
      const add = y + r + 1;
      const remove = y - r;
      if (add < height) {
        sum += tmp[add * width + x];
        count++;
      }
      if (remove >= 0) {
        sum -= tmp[remove * width + x];
        count--;
      }
    }
  }
  return out;
}

/** Aproxima un desenfoque gaussiano con tres desenfoques de caja. */
export function gaussianBlur(src: Plane, width: number, height: number, sigma: number): Plane {
  if (sigma <= 0.3) return src.slice();
  // Radios de caja equivalentes (Kovesi, "Fast almost-Gaussian filtering").
  const n = 3;
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let out = src;
  for (let i = 0; i < n; i++) {
    const size = i < m ? wl : wu;
    out = boxBlur(out, width, height, Math.max(0, (size - 1) >> 1));
  }
  return out;
}

/**
 * Máximo (dilatar) o mínimo (erosionar) en una ventana cuadrada de radio r,
 * con el algoritmo de van Herk / Gil-Werman (3 comparaciones por píxel).
 */
export function rankFilter(src: Plane, width: number, height: number, r: number, mode: 'max' | 'min'): Plane {
  if (r < 1) return src.slice();
  const pick = mode === 'max' ? Math.max : Math.min;
  const fill = mode === 'max' ? -Infinity : Infinity;
  const size = 2 * r + 1;

  const pass = (input: Plane, length: number, lines: number, stride: number, step: number): Plane => {
    const output = new Float32Array(input.length);
    const padded = length + 2 * r;
    const g = new Float32Array(padded);
    const h = new Float32Array(padded);
    const line = new Float32Array(padded);
    for (let l = 0; l < lines; l++) {
      const base = l * stride;
      for (let i = 0; i < padded; i++) {
        const j = i - r;
        line[i] = j >= 0 && j < length ? input[base + j * step] : fill;
      }
      for (let i = 0; i < padded; i++) {
        g[i] = i % size === 0 ? line[i] : pick(g[i - 1], line[i]);
      }
      for (let i = padded - 1; i >= 0; i--) {
        h[i] = i === padded - 1 || (i + 1) % size === 0 ? line[i] : pick(h[i + 1], line[i]);
      }
      for (let j = 0; j < length; j++) {
        // Ventana [j, j + 2r] en coordenadas con relleno.
        output[base + j * step] = pick(h[j], g[j + 2 * r]);
      }
    }
    return output;
  };

  const horizontal = pass(src, width, height, width, 1);
  return pass(horizontal, height, width, 1, width);
}

/** Remuestreo bilineal de un plano (para agrandar máscaras de baja resolución). */
export function resizeBilinear(src: Plane, sw: number, sh: number, dw: number, dh: number): Plane {
  const out = new Float32Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), sh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, sh - 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), sw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, sw - 1);
      const wx = fx - x0;
      const top = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx;
      const bottom = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx;
      out[y * dw + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return out;
}

/** Reduce un plano promediando bloques (para trabajar a menor resolución). */
export function downsampleBox(src: Plane, sw: number, sh: number, dw: number, dh: number): Plane {
  const out = new Float32Array(dw * dh);
  const count = new Float32Array(dw * dh);
  for (let y = 0; y < sh; y++) {
    const ty = Math.min(dh - 1, Math.floor((y * dh) / sh));
    for (let x = 0; x < sw; x++) {
      const tx = Math.min(dw - 1, Math.floor((x * dw) / sw));
      out[ty * dw + tx] += src[y * sw + x];
      count[ty * dw + tx] += 1;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = count[i] ? out[i] / count[i] : 0;
  return out;
}

export function maskToPlane(mask: Uint8Array): Plane {
  const out = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] / 255;
  return out;
}

export function planeToMask(plane: Plane): Uint8Array {
  const out = new Uint8Array(plane.length);
  for (let i = 0; i < plane.length; i++) {
    const v = plane[i];
    out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  }
  return out;
}

/** Luminancia (0..1) de una imagen RGBA, usada como guía para afinar bordes. */
export function luminance(rgba: Uint8Array | Uint8ClampedArray, pixels: number): Plane {
  const out = new Float32Array(pixels);
  for (let i = 0, j = 0; i < pixels; i++, j += 4) {
    out[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255;
  }
  return out;
}
