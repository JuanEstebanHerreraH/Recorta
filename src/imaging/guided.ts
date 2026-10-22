// Agranda una máscara de baja resolución (la que entrega la IA) a la resolución de la
// imagen, usando la propia imagen como guía para que el borde siga los bordes reales.
// Implementa el "Fast Guided Filter" (He y Sun, 2015): los coeficientes se calculan a
// baja resolución y se aplican a resolución completa, con poca memoria.
import { boxBlur, resizeBilinear, type Plane } from './filters';

export interface UpsampleOptions {
  /** Usar la imagen como guía. Si es false, solo interpola (bilineal). */
  guided: boolean;
  /** Radio del filtro en píxeles de la imagen final. */
  radius?: number;
  /** Regularización: más alto = borde más suave. */
  eps?: number;
}

/** Muestra bilineal de un plano de baja resolución en el centro de un píxel final. */
function makeSampler(src: Plane, sw: number, sh: number, dw: number, dh: number) {
  const sx = sw / dw;
  const sy = sh / dh;
  return (x: number, y: number): number => {
    const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), sw - 1);
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), sh - 1);
    const x0 = fx | 0;
    const y0 = fy | 0;
    const x1 = x0 + 1 < sw ? x0 + 1 : x0;
    const y1 = y0 + 1 < sh ? y0 + 1 : y0;
    const wx = fx - x0;
    const wy = fy - y0;
    const top = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx;
    const bottom = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx;
    return top * (1 - wy) + bottom * wy;
  };
}

export function upsampleMask(
  lowMask: Uint8Array,
  lowWidth: number,
  lowHeight: number,
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: UpsampleOptions,
): Uint8Array {
  const low = new Float32Array(lowMask.length);
  for (let i = 0; i < low.length; i++) low[i] = lowMask[i] / 255;

  const scale = Math.max(width / lowWidth, height / lowHeight);
  const out = new Uint8Array(width * height);
  const coarse = makeSampler(low, lowWidth, lowHeight, width, height);

  if (!options.guided || scale <= 1.05) {
    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i++) out[i] = clamp255(coarse(x, y));
    }
    return out;
  }

  // Resolución de trabajo de los coeficientes: hasta ~1,5 megapíxeles.
  const step = Math.max(1, Math.ceil(Math.sqrt((width * height) / 1.5e6)));
  const ww = Math.max(1, Math.round(width / step));
  const wh = Math.max(1, Math.round(height / step));

  const lum = (j: number) => (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255;
  const guide = downsampleLuminance(rgba, width, height, ww, wh);
  const p = resizeBilinear(low, lowWidth, lowHeight, ww, wh);

  // Valores medidos en las pruebas: radio de ~3 veces la ampliación y regularización baja
  // siguen bien tanto bordes de mucho como de poco contraste.
  const radius = options.radius ?? Math.max(4, Math.round(scale * 3));
  const r = Math.max(1, Math.round(radius / step));
  const eps = options.eps ?? 1e-4;

  const meanI = boxBlur(guide, ww, wh, r);
  const meanP = boxBlur(p, ww, wh, r);
  const ii = new Float32Array(guide.length);
  const ip = new Float32Array(guide.length);
  for (let i = 0; i < guide.length; i++) {
    ii[i] = guide[i] * guide[i];
    ip[i] = guide[i] * p[i];
  }
  const corrI = boxBlur(ii, ww, wh, r);
  const corrIP = boxBlur(ip, ww, wh, r);
  const a = new Float32Array(guide.length);
  const b = new Float32Array(guide.length);
  for (let i = 0; i < guide.length; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i];
    const covIP = corrIP[i] - meanI[i] * meanP[i];
    a[i] = covIP / (varI + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }
  const sampleA = makeSampler(boxBlur(a, ww, wh, r), ww, wh, width, height);
  const sampleB = makeSampler(boxBlur(b, ww, wh, r), ww, wh, width, height);

  // Solo se corrige la franja de borde: donde la IA dijo "seguro opaco" o "seguro
  // transparente" se respeta, para no crear fantasmas lejos del contorno.
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      const c = coarse(x, y);
      if (c <= 0.004 || c >= 0.996) {
        out[i] = clamp255(c);
      } else {
        out[i] = clamp255(sampleA(x, y) * lum(i * 4) + sampleB(x, y));
      }
    }
  }
  return out;
}

/** Luminancia promediada por bloques, sin crear un plano a resolución completa. */
function downsampleLuminance(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  dw: number,
  dh: number,
): Plane {
  const sum = new Float32Array(dw * dh);
  const count = new Float32Array(dw * dh);
  for (let y = 0; y < height; y++) {
    const ty = Math.min(dh - 1, Math.floor((y * dh) / height));
    for (let x = 0; x < width; x++) {
      const tx = Math.min(dw - 1, Math.floor((x * dw) / width));
      const j = (y * width + x) * 4;
      sum[ty * dw + tx] += (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255;
      count[ty * dw + tx] += 1;
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] = count[i] ? sum[i] / count[i] : 0;
  return sum;
}

function clamp255(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}
