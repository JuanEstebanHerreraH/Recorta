import { describe, expect, it } from 'vitest';
import { StrokeBuffer, interpolate } from '../src/editor/brush';
import { DEFAULT_SETTINGS, planExport, safeFileName } from '../src/export/settings';
import { buildReport } from '../src/export/report';
import type { HardwareInfo } from '../src/hardware/detect';
import { decideTier, fallbackChain, tierFromBenchmark } from '../src/hardware/tiers';
import { encodeImage } from '../src/imaging/encode';
import { readPngDpi, readPngText } from '../src/imaging/png';
import { cmToPx, effectiveDpi, naturalPrintCm, printVerdict, pxToCm } from '../src/imaging/units';
import { makeEntry, pushEntry, restoreSnapshot } from '../src/state/history';
import { decodePng } from './helpers/png-decode';
import { circleImage } from './helpers/images';

const hw = (patch: Partial<HardwareInfo>): HardwareInfo => ({
  webgpu: true,
  gpu: { vendor: 'intel', architecture: 'gen-12lp', device: '', description: '', isFallback: false },
  shaderF16: true,
  maxStorageBuffersPerShaderStage: 10,
  maxBufferSizeMB: 2048,
  cpuThreads: 8,
  memoryGB: 8,
  multiThread: true,
  isDesktopApp: false,
  browser: 'Chrome',
  webgpuProblem: null,
  ...patch,
});

describe('unidades', () => {
  it('convierte píxeles, centímetros y DPI', () => {
    expect(pxToCm(3000, 300)).toBeCloseTo(25.4, 5);
    expect(pxToCm(3000, 72)).toBeCloseTo(105.83, 2);
    expect(cmToPx(50, 300)).toBe(5906);
    expect(effectiveDpi(3000, 50)).toBeCloseTo(152.4, 1);
    expect(printVerdict(300)).toBe('excelente');
    expect(printVerdict(152)).toBe('lejos');
    expect(printVerdict(90)).toBe('baja');
  });

  it('el ancho impreso natural vuelve exactamente a los mismos píxeles', () => {
    expect(naturalPrintCm(1200, 300)).toBe(10.16);
    for (const dpi of [72, 150, 300, 600]) {
      for (let px = 1; px <= 6000; px++) expect(cmToPx(naturalPrintCm(px, dpi), dpi)).toBe(px);
    }
  });
});

describe('niveles de equipo', () => {
  it('sin WebGPU elige Bajo y lo explica', () => {
    const d = decideTier(hw({ webgpu: false, gpu: null, webgpuProblem: 'Sin WebGPU' }));
    expect(d.tier).toBe('bajo');
    expect(d.reasons.join(' ')).toContain('procesador');
  });

  it('sin media precisión elige Bajo', () => {
    expect(decideTier(hw({ shaderF16: false })).tier).toBe('bajo');
  });

  it('gráfica integrada: Medio; NVIDIA: Alto; poca memoria baja a Medio', () => {
    expect(decideTier(hw({})).tier).toBe('medio');
    const nvidia = { vendor: 'nvidia', architecture: 'ampere', device: '', description: '', isFallback: false };
    expect(decideTier(hw({ gpu: nvidia })).tier).toBe('alto');
    expect(decideTier(hw({ gpu: nvidia, memoryGB: 4 })).tier).toBe('medio');
  });

  it('la medición real manda', () => {
    expect(tierFromBenchmark(0.5)).toBe('alto');
    expect(tierFromBenchmark(2)).toBe('medio');
    expect(tierFromBenchmark(9)).toBe('bajo');
    expect(tierFromBenchmark(null)).toBe('bajo');
  });

  it('si un nivel falla, se sigue con el siguiente', () => {
    expect(fallbackChain('alto')).toEqual(['alto', 'medio', 'bajo']);
    expect(fallbackChain('alto', ['alto'])).toEqual(['medio', 'bajo']);
    expect(fallbackChain('medio', ['medio', 'bajo'])).toEqual(['bajo']);
  });
});

describe('plan de exportación', () => {
  const content = { width: 3000, height: 2000 };

  it('impresión: avisa si faltan píxeles y calcula el detalle real', () => {
    const plan = planExport(content, { ...DEFAULT_SETTINGS, sizeMode: 'print', dpi: 300, printWidthCm: 50 });
    expect(plan.target.width).toBe(5906);
    expect(plan.upscaling).toBe(true);
    expect(plan.realDpi).toBeCloseTo(152.4, 1);
  });

  it('sticker: cuadrado exacto con margen', () => {
    const plan = planExport(content, { ...DEFAULT_SETTINGS, sizeMode: 'box', boxPx: 512, square: true, paddingPercent: 3 });
    expect(plan.target).toEqual({ width: 512, height: 512 });
    expect(plan.padding).toBe(90);
  });

  it('original: sin cambios', () => {
    const plan = planExport(content, DEFAULT_SETTINGS);
    expect(plan.target).toEqual(content);
    expect(plan.upscaling).toBe(false);
  });

  it('nombres de archivo seguros para Windows', () => {
    expect(safeFileName('mi:foto*nueva?.png', 'png')).toBe('mifotonueva.png');
    expect(safeFileName('', 'webp')).toBe('recorte.webp');
  });
});

describe('codificación final', () => {
  it('PNG con DPI, ficha y optimizador inyectado', async () => {
    const rgba = circleImage(64, 48, [220, 40, 40], [0, 0, 0], 16);
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i - 1] === 0 && rgba[i - 3] === 0) rgba[i] = 0;
    let optimizerCalled = false;
    const result = await encodeImage(
      rgba,
      64,
      48,
      {
        format: 'png',
        pngMode: 'png24',
        colors: 256,
        dither: false,
        optimize: true,
        quality: 90,
        dpi: 300,
        opaque: false,
        text: { software: 'Recorta prueba', description: 'Ficha con acentos: año, tamaño' },
      },
      {
        optimizePng: async (png) => {
          optimizerCalled = true;
          return png;
        },
      },
    );
    expect(optimizerCalled).toBe(true);
    expect(readPngDpi(result.bytes)).toBe(300);
    expect(readPngText(result.bytes).Description).toBe('Ficha con acentos: año, tamaño');
    expect(Array.from(decodePng(result.bytes).rgba)).toEqual(Array.from(rgba));
  });

  it('si el optimizador falla, igual guarda y avisa', async () => {
    const rgba = circleImage(8, 8, [1, 2, 3], [4, 5, 6], 2);
    const result = await encodeImage(
      rgba,
      8,
      8,
      { format: 'png', pngMode: 'png24', colors: 256, dither: false, optimize: true, quality: 90, dpi: 72, opaque: true },
      {
        optimizePng: async () => {
          throw new Error('sin wasm');
        },
      },
    );
    expect(result.optimized).toBe(false);
    expect(result.warning).toBeTruthy();
    expect(decodePng(result.bytes).width).toBe(8);
  });

  it('PNG-8 con pocos colores queda exacto', async () => {
    const rgba = circleImage(30, 30, [0, 120, 80], [255, 255, 255], 9);
    const result = await encodeImage(rgba, 30, 30, {
      format: 'png',
      pngMode: 'png8',
      colors: 256,
      dither: true,
      optimize: false,
      quality: 90,
      dpi: 150,
      opaque: true,
    });
    expect(result.exactPalette).toBe(true);
    expect(Array.from(decodePng(result.bytes).rgba)).toEqual(Array.from(rgba));
  });
});

describe('pincel', () => {
  it('pasar dos veces por el mismo lugar no acumula dentro de un trazo', () => {
    const w = 40;
    const h = 40;
    const mask = new Uint8Array(w * h).fill(255);
    const stroke = new StrokeBuffer(w, h);
    stroke.begin(mask);
    const brush = { radius: 6, hardness: 1, opacity: 0.5 };
    stroke.stamp(mask, 20, 20, brush, true);
    const once = mask[20 * w + 20];
    stroke.stamp(mask, 20, 20, brush, true);
    expect(mask[20 * w + 20]).toBe(once);
    expect(once).toBeGreaterThan(120);
    expect(once).toBeLessThan(135);
    expect(stroke.end()).toBe(true);

    // Un trazo nuevo sí suma sobre el anterior.
    stroke.begin(mask);
    stroke.stamp(mask, 20, 20, brush, true);
    expect(mask[20 * w + 20]).toBeLessThan(once);
    stroke.end();
  });

  it('restaurar devuelve la opacidad', () => {
    const mask = new Uint8Array(20 * 20);
    const stroke = new StrokeBuffer(20, 20);
    stroke.begin(mask);
    stroke.stamp(mask, 10, 10, { radius: 4, hardness: 1, opacity: 1 }, false);
    stroke.end();
    expect(mask[10 * 20 + 10]).toBe(255);
    expect(mask[0]).toBe(0);
  });

  it('interpola puntos intermedios', () => {
    const points = interpolate({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
    expect(points.map((p) => p.x)).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('historial', () => {
  it('guarda copias comprimidas y respeta el límite', () => {
    const mask = new Uint8Array(1000 * 1000).fill(255);
    const refine = { haloEnabled: false, haloStrength: 100 };
    let state = { entries: [makeEntry('Abrir', mask, refine)], index: 0 };
    mask.fill(0, 0, 500_000);
    state = pushEntry(state.entries, state.index, makeEntry('Borrar', mask, refine), 3);
    expect(state.entries[1].snapshot.length).toBeLessThan(20_000);
    expect(restoreSnapshot(state.entries[0], mask.length)[0]).toBe(255);
    expect(restoreSnapshot(state.entries[1], mask.length)[0]).toBe(0);
    for (let i = 0; i < 5; i++) state = pushEntry(state.entries, state.index, makeEntry(`Paso ${i}`, mask, refine), 3);
    expect(state.entries).toHaveLength(3);
    expect(state.index).toBe(2);
  });

  it('un paso nuevo después de deshacer descarta los pasos rehacer', () => {
    const mask = new Uint8Array(4);
    const refine = { haloEnabled: false, haloStrength: 100 };
    const entries = ['a', 'b', 'c'].map((l) => makeEntry(l, mask, refine));
    const next = pushEntry(entries, 0, makeEntry('d', mask, refine), 10);
    expect(next.entries.map((e) => e.label)).toEqual(['a', 'd']);
  });
});

describe('ficha', () => {
  it('incluye medidas, DPI, pasos y peso', () => {
    const text = buildReport({
      appName: 'Recorta',
      appVersion: '1.0.0',
      sourceName: 'foto.jpg',
      sourceSize: { width: 4000, height: 3000 },
      fileName: 'foto-recorte.png',
      finalSize: { width: 1200, height: 900 },
      dpi: 300,
      formatLabel: 'PNG-24 con transparencia',
      steps: ['Quitar fondo con IA', 'Borrar con pincel'],
      trimmed: true,
      padding: 0,
      background: null,
      bytes: 512_000,
      tierLabel: 'Medio',
      date: new Date(2026, 9, 13, 12, 0),
    });
    expect(text).toContain('10,2 × 7,6 cm');
    expect(text).toContain('1. Quitar fondo con IA');
    expect(text).toContain('Peso: 500 KB');
  });
});
