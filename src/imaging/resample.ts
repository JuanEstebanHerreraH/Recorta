// Cambio de tamaño de alta calidad (Lanczos 3) con alfa premultiplicado.
// Premultiplicar evita el halo oscuro o de colores raros que aparece al achicar o
// agrandar imágenes con transparencia: los píxeles invisibles no "manchan" el borde.

function lanczos(x: number, a = 3): number {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

interface Contributions {
  start: Int32Array;
  count: Int32Array;
  weights: Float32Array;
  maxCount: number;
}

function contributions(srcSize: number, dstSize: number): Contributions {
  const scale = srcSize / dstSize;
  const filterScale = Math.max(1, scale);
  const support = 3 * filterScale;
  const maxCount = Math.ceil(support * 2) + 1;
  const start = new Int32Array(dstSize);
  const count = new Int32Array(dstSize);
  const weights = new Float32Array(dstSize * maxCount);

  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) * scale - 0.5;
    const left = Math.max(0, Math.ceil(center - support));
    const right = Math.min(srcSize - 1, Math.floor(center + support));
    let total = 0;
    let n = 0;
    for (let j = left; j <= right && n < maxCount; j++, n++) {
      const w = lanczos((j - center) / filterScale);
      weights[i * maxCount + n] = w;
      total += w;
    }
    if (total !== 0) for (let k = 0; k < n; k++) weights[i * maxCount + k] /= total;
    start[i] = left;
    count[i] = n;
  }
  return { start, count, weights, maxCount };
}

/** Redimensiona una imagen RGBA a `dw`×`dh` con Lanczos 3. */
export function resizeRgba(
  src: Uint8Array | Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8ClampedArray {
  if (sw === dw && sh === dh) return new Uint8ClampedArray(src);

  // Premultiplicar.
  const pre = new Float32Array(sw * sh * 4);
  for (let i = 0; i < pre.length; i += 4) {
    const a = src[i + 3] / 255;
    pre[i] = src[i] * a;
    pre[i + 1] = src[i + 1] * a;
    pre[i + 2] = src[i + 2] * a;
    pre[i + 3] = src[i + 3];
  }

  // Pasada horizontal: sw×sh -> dw×sh.
  const h = contributions(sw, dw);
  const mid = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const srcRow = y * sw * 4;
    const dstRow = y * dw * 4;
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const base = x * h.maxCount;
      const first = h.start[x];
      for (let k = 0; k < h.count[x]; k++) {
        const w = h.weights[base + k];
        const p = srcRow + (first + k) * 4;
        r += pre[p] * w;
        g += pre[p + 1] * w;
        b += pre[p + 2] * w;
        a += pre[p + 3] * w;
      }
      const o = dstRow + x * 4;
      mid[o] = r;
      mid[o + 1] = g;
      mid[o + 2] = b;
      mid[o + 3] = a;
    }
  }

  // Pasada vertical: dw×sh -> dw×dh, y des-premultiplicar.
  const v = contributions(sh, dh);
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const base = y * v.maxCount;
    const first = v.start[y];
    for (let x = 0; x < dw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < v.count[y]; k++) {
        const w = v.weights[base + k];
        const p = ((first + k) * dw + x) * 4;
        r += mid[p] * w;
        g += mid[p + 1] * w;
        b += mid[p + 2] * w;
        a += mid[p + 3] * w;
      }
      const o = (y * dw + x) * 4;
      if (a <= 0.5) {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
        continue;
      }
      // El color premultiplicado está en unidades de color × (alfa / 255).
      const alpha = Math.min(255, a);
      const k = 255 / alpha;
      out[o] = r * k;
      out[o + 1] = g * k;
      out[o + 2] = b * k;
      out[o + 3] = alpha;
    }
  }
  return out;
}

/** Redimensiona un plano de un canal (máscara) con Lanczos 3. */
export function resizeGray(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  if (sw === dw && sh === dh) return src.slice();
  const h = contributions(sw, dw);
  const mid = new Float32Array(dw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      let s = 0;
      const base = x * h.maxCount;
      for (let k = 0; k < h.count[x]; k++) s += src[y * sw + h.start[x] + k] * h.weights[base + k];
      mid[y * dw + x] = s;
    }
  }
  const v = contributions(sh, dh);
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const base = y * v.maxCount;
    for (let x = 0; x < dw; x++) {
      let s = 0;
      for (let k = 0; k < v.count[y]; k++) s += mid[(v.start[y] + k) * dw + x] * v.weights[base + k];
      out[y * dw + x] = s <= 0 ? 0 : s >= 255 ? 255 : Math.round(s);
    }
  }
  return out;
}
