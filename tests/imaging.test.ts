import { describe, expect, it } from 'vitest';
import { analyzeImage } from '../src/imaging/analyze';
import { colorKey, dominantBorderColor } from '../src/imaging/colorkey';
import { decontaminate } from '../src/imaging/decontaminate';
import { boxBlur, rankFilter, resizeBilinear } from '../src/imaging/filters';
import { contentBounds, flattenOnColor, padRgba } from '../src/imaging/geometry';
import { upsampleMask } from '../src/imaging/guided';
import { combineMasks, featherMask, hardenMask, shiftEdge } from '../src/imaging/mask';
import { countColors, indicesToRgba, quantizeRgba } from '../src/imaging/quantize';
import { resizeGray, resizeRgba } from '../src/imaging/resample';
import { circleImage, circleMask, gradientImage, meanAbsDiff } from './helpers/images';

describe('filtros', () => {
  it('el desenfoque de caja conserva un plano constante', () => {
    const plane = new Float32Array(50 * 40).fill(0.7);
    const out = boxBlur(plane, 50, 40, 6);
    expect(Math.max(...out)).toBeCloseTo(0.7, 5);
    expect(Math.min(...out)).toBeCloseTo(0.7, 5);
  });

  it('máximo y mínimo coinciden con la versión ingenua', () => {
    const w = 23;
    const h = 17;
    const src = new Float32Array(w * h).map((_, i) => ((i * 37) % 101) / 100);
    const r = 3;
    const fast = rankFilter(src, w, h, r, 'max');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = -Infinity;
        for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
          for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) m = Math.max(m, src[yy * w + xx]);
        }
        expect(fast[y * w + x]).toBeCloseTo(m, 6);
      }
    }
  });

  it('el remuestreo bilineal conserva valores constantes', () => {
    const out = resizeBilinear(new Float32Array(10 * 10).fill(0.25), 10, 10, 37, 23);
    expect(out.every((v) => Math.abs(v - 0.25) < 1e-6)).toBe(true);
  });
});

describe('máscara', () => {
  const w = 80;
  const h = 80;
  const mask = circleMask(w, h, 25);
  const area = (m: Uint8Array) => m.reduce((s, v) => s + v / 255, 0);

  it('expandir agranda y contraer achica el recorte', () => {
    expect(area(shiftEdge(mask, w, h, 3))).toBeGreaterThan(area(mask) + 100);
    expect(area(shiftEdge(mask, w, h, -3))).toBeLessThan(area(mask) - 100);
  });

  it('suavizar crea más píxeles de borde y conserva el área', () => {
    const soft = featherMask(mask, w, h, 6);
    const partial = (m: Uint8Array) => m.filter((v) => v > 0 && v < 255).length;
    expect(partial(soft)).toBeGreaterThan(partial(mask) * 2);
    expect(Math.abs(area(soft) - area(mask))).toBeLessThan(area(mask) * 0.03);
  });

  it('endurecer reduce los píxeles semitransparentes', () => {
    const soft = featherMask(mask, w, h, 8);
    const hard = hardenMask(soft, 0.8);
    const partial = (m: Uint8Array) => m.filter((v) => v > 0 && v < 255).length;
    expect(partial(hard)).toBeLessThan(partial(soft));
  });

  it('combina selecciones', () => {
    const current = new Uint8Array([255, 255, 0, 128]);
    const selection = new Uint8Array([255, 0, 255, 255]);
    expect(Array.from(combineMasks(current, selection, 'keep-only'))).toEqual([255, 0, 0, 128]);
    expect(Array.from(combineMasks(current, selection, 'remove'))).toEqual([0, 255, 0, 0]);
    expect(Array.from(combineMasks(current, selection, 'add'))).toEqual([255, 255, 255, 255]);
  });
});

describe('afinar el borde con la imagen (filtro guiado)', () => {
  it('se acerca más al borde real que la interpolación simple', () => {
    const w = 400;
    const h = 400;
    const radius = 130;
    const image = circleImage(w, h, [230, 70, 40], [30, 90, 200], radius);
    const truth = circleMask(w, h, radius);
    // La IA "ve" la imagen a 50×50 px.
    const low = new Uint8Array(50 * 50);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        let sum = 0;
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) sum += truth[(y * 8 + yy) * w + x * 8 + xx];
        low[y * 50 + x] = Math.round(sum / 64);
      }
    }
    const plain = upsampleMask(low, 50, 50, image, w, h, { guided: false });
    const guided = upsampleMask(low, 50, 50, image, w, h, { guided: true });
    expect(meanAbsDiff(guided, truth)).toBeLessThan(meanAbsDiff(plain, truth) * 0.7);
  });
});

describe('quitar halo', () => {
  it('quita el color del fondo viejo de los bordes', () => {
    const w = 120;
    const h = 120;
    const radius = 40;
    const fg: [number, number, number] = [240, 220, 40];
    const bg: [number, number, number] = [20, 40, 220];
    const mask = circleMask(w, h, radius);
    // Imagen con borde mezclado: el borde lleva parte del azul del fondo.
    const image = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const a = mask[i] / 255;
      for (let c = 0; c < 3; c++) image[i * 4 + c] = Math.round(fg[c] * a + bg[c] * (1 - a));
      image[i * 4 + 3] = 255;
    }
    const fixed = decontaminate(image, mask, w, h, 1);
    let before = 0;
    let after = 0;
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (mask[i] > 20 && mask[i] < 235) {
        before += Math.abs(image[i * 4 + 2] - fg[2]);
        after += Math.abs(fixed[i * 4 + 2] - fg[2]);
        n++;
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(after / n).toBeLessThan((before / n) * 0.35);
  });
});

describe('quitar un color de fondo', () => {
  const w = 60;
  const h = 40;
  const image = circleImage(w, h, [200, 20, 20], [255, 255, 255], 12);

  it('detecta el color dominante del borde', () => {
    expect(dominantBorderColor(image, w, h)).toEqual([255, 255, 255]);
  });

  it('borra el fondo conectado y conserva el objeto', () => {
    const mask = colorKey(image, new Uint8Array(w * h).fill(255), w, h, {
      seeds: 'borders',
      tolerance: 10,
      softness: 10,
      contiguous: true,
    });
    expect(mask[0]).toBe(0);
    expect(mask[(h / 2) * w + w / 2]).toBe(255);
  });

  it('en modo conectado no borra islas del mismo color encerradas', () => {
    // Un anillo rojo con el centro blanco: el centro no está conectado al borde.
    const ring = new Uint8ClampedArray(image);
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 5) {
          const i = (y * w + x) * 4;
          ring[i] = ring[i + 1] = ring[i + 2] = 255;
        }
      }
    }
    const base = new Uint8Array(w * h).fill(255);
    const contiguous = colorKey(ring, base, w, h, { seeds: 'borders', tolerance: 10, softness: 0, contiguous: true });
    const global = colorKey(ring, base, w, h, { seeds: 'borders', tolerance: 10, softness: 0, contiguous: false });
    const center = Math.floor(cy) * w + Math.floor(cx);
    expect(contiguous[center]).toBe(255);
    expect(global[center]).toBe(0);
  });
});

describe('paleta (PNG-8)', () => {
  it('si hay 256 colores o menos, la paleta es exacta', () => {
    const image = circleImage(40, 40, [10, 20, 30], [200, 210, 220], 10);
    const q = quantizeRgba(image, 40, 40, { colors: 256, dither: false });
    expect(q.exact).toBe(true);
    expect(q.colorCount).toBe(2);
    expect(Array.from(indicesToRgba(q.indices, q.palette))).toEqual(Array.from(image));
  });

  it('reduce un degradé a la cantidad pedida con poco error', () => {
    const image = gradientImage(64, 64);
    expect(countColors(image)).toBeGreaterThan(256);
    const q = quantizeRgba(image, 64, 64, { colors: 64, dither: false });
    expect(q.colorCount).toBeLessThanOrEqual(64);
    expect(meanAbsDiff(indicesToRgba(q.indices, q.palette), image)).toBeLessThan(12);
    const dithered = quantizeRgba(image, 64, 64, { colors: 64, dither: true });
    expect(meanAbsDiff(indicesToRgba(dithered.indices, dithered.palette), image)).toBeLessThan(14);
  });

  it('reserva un color totalmente transparente', () => {
    const image = gradientImage(32, 32);
    for (let i = 0; i < 32 * 8; i++) image[i * 4 + 3] = 0;
    const q = quantizeRgba(image, 32, 32, { colors: 16, dither: true });
    expect(q.palette[3]).toBe(0);
    expect(q.indices[0]).toBe(0);
  });
});

describe('análisis de formato', () => {
  it('recomienda PNG-8 sin pérdida para pocos colores', () => {
    expect(analyzeImage(circleImage(50, 50, [0, 0, 0], [255, 255, 255], 10), 50, 50).advice).toBe('png8-exact');
  });

  it('recomienda PNG-24 para degradés', () => {
    expect(analyzeImage(gradientImage(300, 300), 300, 300).advice).toBe('png24');
  });
});

describe('cambio de tamaño', () => {
  it('no oscurece los bordes de una imagen con transparencia', () => {
    // Rojo opaco a la izquierda, transparente "negro" a la derecha.
    const w = 40;
    const h = 10;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w / 2; x++) {
        const i = (y * w + x) * 4;
        src[i] = 255;
        src[i + 3] = 255;
      }
    }
    const out = resizeRgba(src, w, h, 13, 4);
    for (let i = 0; i < out.length; i += 4) {
      if (out[i + 3] > 10) expect(out[i]).toBeGreaterThan(240);
    }
  });

  it('conserva colores planos al agrandar', () => {
    const src = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const out = resizeRgba(src, 4, 4, 9, 9);
    expect(out.every((v) => Math.abs(v - 200) <= 1)).toBe(true);
    const gray = resizeGray(new Uint8Array(16).fill(128), 4, 4, 11, 7);
    expect(gray.every((v) => Math.abs(v - 128) <= 1)).toBe(true);
  });
});

describe('geometría', () => {
  it('encuentra la caja del contenido visible', () => {
    const mask = new Uint8Array(10 * 10);
    mask[3 * 10 + 4] = 255;
    mask[6 * 10 + 7] = 200;
    expect(contentBounds(mask, 10, 10)).toEqual({ x: 4, y: 3, width: 4, height: 4 });
    expect(contentBounds(new Uint8Array(100), 10, 10)).toBeNull();
  });

  it('agrega margen y centra en un lienzo cuadrado', () => {
    const rgba = new Uint8ClampedArray(4 * 2 * 4).fill(255);
    const padded = padRgba(rgba, 4, 2, 1, true);
    expect([padded.width, padded.height]).toEqual([6, 6]);
    expect(padded.data[(2 * 6 + 1) * 4 + 3]).toBe(255);
    expect(padded.data[3]).toBe(0);
  });

  it('aplana sobre un color', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 0, 0]);
    expect(Array.from(flattenOnColor(rgba, [255, 255, 255]))).toEqual([255, 127, 127, 255, 255, 255, 255, 255]);
  });
});
