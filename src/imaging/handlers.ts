// Lado "worker" del procesamiento de imagen: todo lo pesado corre fuera de la interfaz.
import type { HandlerContext } from '../workers/rpc';
import { analyzeImage } from './analyze';
import { colorKey, type ColorKeyOptions } from './colorkey';
import { decontaminate } from './decontaminate';
import { encodeImage, type EncodeSettings } from './encode';
import { composeRgba, contentBounds, cropRgba, flattenOnColor, padRgba, type Rect } from './geometry';
import { upsampleMask } from './guided';
import { featherMask, hardenMask, shiftEdge } from './mask';
import { resizeGray, resizeRgba } from './resample';

interface DocImage {
  id: string;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
}

let doc: DocImage | null = null;

function requireDoc(): DocImage {
  if (!doc) throw new Error('No hay ninguna imagen abierta.');
  return doc;
}

let oxipngReady: Promise<(png: Uint8Array) => Uint8Array> | null = null;

/** Carga el optimizador PNG (oxipng en WebAssembly) solo cuando hace falta. */
async function optimizePng(png: Uint8Array): Promise<Uint8Array> {
  oxipngReady ??= (async () => {
    const [{ default: init, optimise }, { default: wasmUrl }] = await Promise.all([
      import('@jsquash/oxipng/codec/pkg/squoosh_oxipng.js'),
      import('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url'),
    ]);
    await init(wasmUrl);
    return (data: Uint8Array) => optimise(data, 2, false, true);
  })();
  oxipngReady.catch(() => {
    oxipngReady = null;
  });
  const run = await oxipngReady;
  return run(png);
}

async function canvasEncode(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mime: string,
  quality: number,
): Promise<Uint8Array> {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('Este navegador no puede exportar WebP ni JPG.');
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el lienzo para exportar.');
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: mime, quality });
  if (blob.type !== mime) {
    throw new Error(`Este navegador no sabe crear archivos ${mime === 'image/webp' ? 'WebP' : 'JPG'}. Usa PNG.`);
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function previewOf(rgba: Uint8ClampedArray, width: number, height: number, maxSide = 480) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const pw = Math.max(1, Math.round(width * scale));
  const ph = Math.max(1, Math.round(height * scale));
  return { rgba: scale < 1 ? resizeRgba(rgba, width, height, pw, ph) : rgba.slice(), width: pw, height: ph };
}

export interface PrepareArgs {
  mask: Uint8Array;
  halo: { enabled: boolean; strength: number };
  trim: boolean;
}

export interface FinishArgs {
  /** Contenido recortado (RGBA), o color agrandado con IA si `alpha` viene aparte. */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** Transparencia del contenido original (solo cuando el color se agrandó con IA). */
  alpha?: { data: Uint8Array; width: number; height: number };
  /** Tamaño del contenido sin agrandar (para calcular la escala). */
  content: { width: number; height: number };
  canvas: { width: number; height: number };
  target: { width: number; height: number };
  padding: number;
  square: boolean;
  background: [number, number, number] | null;
  pngAuto: boolean;
  encode: Omit<EncodeSettings, 'opaque'>;
}

export const handlers = {
  setImage(args: DocImage) {
    doc = args;
    return { ok: true };
  },

  clearImage() {
    doc = null;
    return { ok: true };
  },

  upsample(args: { low: Uint8Array; lowWidth: number; lowHeight: number; guided: boolean }, ctx: HandlerContext) {
    const d = requireDoc();
    const mask = upsampleMask(args.low, args.lowWidth, args.lowHeight, d.rgba, d.width, d.height, {
      guided: args.guided,
    });
    ctx.transfer(mask.buffer);
    return mask;
  },

  feather(args: { mask: Uint8Array; radius: number }, ctx: HandlerContext) {
    const d = requireDoc();
    const mask = featherMask(args.mask, d.width, d.height, args.radius);
    ctx.transfer(mask.buffer);
    return mask;
  },

  shiftEdge(args: { mask: Uint8Array; px: number }, ctx: HandlerContext) {
    const d = requireDoc();
    const mask = shiftEdge(args.mask, d.width, d.height, args.px);
    ctx.transfer(mask.buffer);
    return mask;
  },

  harden(args: { mask: Uint8Array; amount: number }, ctx: HandlerContext) {
    const mask = hardenMask(args.mask, args.amount);
    ctx.transfer(mask.buffer);
    return mask;
  },

  colorKey(args: { mask: Uint8Array; options: ColorKeyOptions }, ctx: HandlerContext) {
    const d = requireDoc();
    const mask = colorKey(d.rgba, args.mask, d.width, d.height, args.options);
    ctx.transfer(mask.buffer);
    return mask;
  },

  /** Ajusta una selección (por ejemplo, de la IA de un clic) al tamaño de la imagen. */
  resizeSelection(args: { mask: Uint8Array; width: number; height: number; guided: boolean }, ctx: HandlerContext) {
    const d = requireDoc();
    const mask = upsampleMask(args.mask, args.width, args.height, d.rgba, d.width, d.height, {
      guided: args.guided,
    });
    ctx.transfer(mask.buffer);
    return mask;
  },

  decontaminate(args: { mask: Uint8Array; strength: number }, ctx: HandlerContext) {
    const d = requireDoc();
    const rgba = decontaminate(d.rgba, args.mask, d.width, d.height, args.strength);
    ctx.transfer(rgba.buffer);
    return rgba;
  },

  /** Une color y transparencia, quita halo si corresponde y recorta los bordes vacíos. */
  prepareExport(args: PrepareArgs, ctx: HandlerContext) {
    const d = requireDoc();
    const color = args.halo.enabled ? decontaminate(d.rgba, args.mask, d.width, d.height, args.halo.strength) : d.rgba;
    let rgba = composeRgba(color, args.mask);
    let rect: Rect = { x: 0, y: 0, width: d.width, height: d.height };
    if (args.trim) {
      const bounds = contentBounds(args.mask, d.width, d.height);
      if (bounds) {
        rect = bounds;
        rgba = cropRgba(rgba, d.width, bounds);
      }
    }
    ctx.transfer(rgba.buffer);
    return { rgba, width: rect.width, height: rect.height, rect };
  },

  /** Escala, agrega margen y fondo, codifica y escribe los metadatos. */
  async finishExport(args: FinishArgs, ctx: HandlerContext) {
    const scale = args.target.width / args.canvas.width;
    const contentW = Math.max(1, Math.round(args.content.width * scale));
    const contentH = Math.max(1, Math.round(args.content.height * scale));

    let scaled: Uint8ClampedArray;
    if (args.alpha) {
      // Color agrandado con IA + transparencia original agrandada con Lanczos.
      const color = resizeRgba(args.rgba, args.width, args.height, contentW, contentH);
      const alpha = resizeGray(args.alpha.data, args.alpha.width, args.alpha.height, contentW, contentH);
      for (let i = 0, p = 0; p < alpha.length; i += 4, p++) color[i + 3] = alpha[p];
      scaled = color;
    } else {
      scaled = resizeRgba(args.rgba, args.width, args.height, contentW, contentH);
    }

    const padding = Math.round(args.padding * scale);
    let placed = padRgba(scaled, contentW, contentH, padding, args.square);
    if (placed.width !== args.target.width || placed.height !== args.target.height) {
      // Ajuste fino por redondeo: se centra en el lienzo exacto pedido.
      const exact = new Uint8ClampedArray(args.target.width * args.target.height * 4);
      const offX = Math.floor((args.target.width - placed.width) / 2);
      const offY = Math.floor((args.target.height - placed.height) / 2);
      for (let y = 0; y < placed.height; y++) {
        const ty = y + offY;
        if (ty < 0 || ty >= args.target.height) continue;
        for (let x = 0; x < placed.width; x++) {
          const tx = x + offX;
          if (tx < 0 || tx >= args.target.width) continue;
          const s = (y * placed.width + x) * 4;
          const t = (ty * args.target.width + tx) * 4;
          exact[t] = placed.data[s];
          exact[t + 1] = placed.data[s + 1];
          exact[t + 2] = placed.data[s + 2];
          exact[t + 3] = placed.data[s + 3];
        }
      }
      placed = { data: exact, width: args.target.width, height: args.target.height };
    }

    const forceOpaque = args.encode.format === 'jpg';
    const background = args.background ?? (forceOpaque ? ([255, 255, 255] as [number, number, number]) : null);
    const finalPixels = background ? flattenOnColor(placed.data, background) : placed.data;

    let analysis = null;
    const encode: EncodeSettings = { ...args.encode, opaque: Boolean(background) };
    if (args.encode.format === 'png' && args.pngAuto) {
      analysis = analyzeImage(finalPixels, placed.width, placed.height);
      encode.pngMode = analysis.advice === 'png24' ? 'png24' : 'png8';
      if (analysis.advice === 'png8-exact') encode.colors = 256;
    }

    const encoded = await encodeImage(finalPixels, placed.width, placed.height, encode, {
      optimizePng,
      canvasEncode,
    });
    const preview = previewOf(encoded.pixels, placed.width, placed.height);
    ctx.transfer(encoded.bytes.buffer, preview.rgba.buffer);
    return {
      bytes: encoded.bytes,
      mime: encoded.mime,
      extension: encoded.extension,
      width: placed.width,
      height: placed.height,
      paletteColors: encoded.paletteColors,
      exactPalette: encoded.exactPalette,
      optimized: encoded.optimized,
      pngMode: args.encode.format === 'png' ? encode.pngMode : null,
      warning: encoded.warning ?? null,
      analysis,
      preview,
    };
  },

  /** Recomendación de formato sobre el contenido actual (sin escalar). */
  analyze(args: { mask: Uint8Array; trim: boolean }) {
    const d = requireDoc();
    let rect: Rect = { x: 0, y: 0, width: d.width, height: d.height };
    if (args.trim) rect = contentBounds(args.mask, d.width, d.height) ?? rect;
    // Submuestreo por saltos (sin interpolar, para no inventar colores nuevos).
    const step = Math.max(1, Math.ceil(Math.sqrt((rect.width * rect.height) / 4e6)));
    const w = Math.ceil(rect.width / step);
    const h = Math.ceil(rect.height / step);
    const sample = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = rect.x + x * step;
        const sy = rect.y + y * step;
        const s = (sy * d.width + sx) * 4;
        const t = (y * w + x) * 4;
        sample[t] = d.rgba[s];
        sample[t + 1] = d.rgba[s + 1];
        sample[t + 2] = d.rgba[s + 2];
        sample[t + 3] = args.mask[sy * d.width + sx];
      }
    }
    return analyzeImage(sample, w, h);
  },
};

export type ImagingHandlers = typeof handlers;
