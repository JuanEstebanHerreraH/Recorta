// Ajustes de exportación, ajustes por destino (presets) y el cálculo del tamaño final.
import type { ExportFormat } from '../imaging/encode';
import { cmToPx, effectiveDpi, pxToCm } from '../imaging/units';

export type SizeMode = 'original' | 'percent' | 'width' | 'print' | 'box';
export type PngChoice = 'auto' | 'png24' | 'png8';
export type UpscaleMethod = 'quality' | 'ai';
export type PresetId = 'web' | 'print' | 'store' | 'sticker' | 'custom';

export interface ExportSettings {
  presetId: PresetId;
  format: ExportFormat;
  pngMode: PngChoice;
  colors: number;
  dither: boolean;
  optimize: boolean;
  quality: number;
  dpi: number;
  sizeMode: SizeMode;
  percent: number;
  widthPx: number;
  printWidthCm: number;
  boxPx: number;
  upscale: UpscaleMethod;
  trim: boolean;
  paddingPercent: number;
  square: boolean;
  background: 'transparent' | 'color';
  backgroundColor: string;
  embedReport: boolean;
  fileName: string;
}

export const DEFAULT_SETTINGS: ExportSettings = {
  presetId: 'web',
  format: 'png',
  pngMode: 'auto',
  colors: 256,
  dither: true,
  optimize: true,
  quality: 90,
  dpi: 72,
  sizeMode: 'original',
  percent: 100,
  widthPx: 1200,
  printWidthCm: 10,
  boxPx: 1000,
  upscale: 'quality',
  trim: true,
  paddingPercent: 0,
  square: false,
  background: 'transparent',
  backgroundColor: '#ffffff',
  embedReport: true,
  fileName: 'recorte',
};

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  patch: Partial<ExportSettings>;
}

export const PRESETS: Preset[] = [
  {
    id: 'web',
    name: 'Web y redes',
    description: 'PNG con transparencia, tamaño original y el menor peso posible.',
    patch: {
      format: 'png',
      pngMode: 'auto',
      optimize: true,
      dpi: 72,
      sizeMode: 'original',
      trim: true,
      paddingPercent: 0,
      square: false,
      background: 'transparent',
    },
  },
  {
    id: 'print',
    name: 'Imprimir',
    description: 'PNG-24 a 300 DPI. Eliges el ancho en centímetros y te avisa si faltan píxeles.',
    patch: {
      format: 'png',
      pngMode: 'png24',
      optimize: true,
      dpi: 300,
      sizeMode: 'print',
      trim: true,
      paddingPercent: 0,
      square: false,
      background: 'transparent',
    },
  },
  {
    id: 'store',
    name: 'Tienda online',
    description: 'JPG cuadrado de 2000 px con fondo blanco y margen alrededor del producto.',
    patch: {
      format: 'jpg',
      quality: 90,
      dpi: 72,
      sizeMode: 'box',
      boxPx: 2000,
      trim: true,
      paddingPercent: 6,
      square: true,
      background: 'color',
      backgroundColor: '#ffffff',
    },
  },
  {
    id: 'sticker',
    name: 'Sticker',
    description: 'WebP de 512 × 512 px, transparente y con un pequeño margen.',
    patch: {
      format: 'webp',
      quality: 90,
      dpi: 72,
      sizeMode: 'box',
      boxPx: 512,
      trim: true,
      paddingPercent: 3,
      square: true,
      background: 'transparent',
    },
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Ajusta cada opción a mano.',
    patch: {},
  },
];

export interface Size {
  width: number;
  height: number;
}

export interface ExportPlan {
  /** Tamaño del contenido visible después de quitar bordes vacíos. */
  content: Size;
  /** Lienzo con margen (y cuadrado si corresponde), antes de escalar. */
  canvas: Size;
  padding: number;
  target: Size;
  scale: number;
  upscaling: boolean;
  printCm: Size;
  /** DPI reales en modo impresión (si faltan píxeles, queda por debajo de lo pedido). */
  realDpi: number;
  /** Píxeles de ancho necesarios para el ancho en cm pedido a los DPI elegidos. */
  requiredWidthPx: number;
}

export function planExport(content: Size, settings: ExportSettings): ExportPlan {
  const padding = Math.round((settings.paddingPercent / 100) * Math.max(content.width, content.height));
  let cw = content.width + padding * 2;
  let ch = content.height + padding * 2;
  if (settings.square) cw = ch = Math.max(cw, ch);

  let scale = 1;
  let requiredWidthPx = cw;
  switch (settings.sizeMode) {
    case 'percent':
      scale = Math.max(1, settings.percent) / 100;
      break;
    case 'width':
      scale = Math.max(1, settings.widthPx) / cw;
      break;
    case 'print':
      requiredWidthPx = cmToPx(Math.max(0.1, settings.printWidthCm), settings.dpi);
      scale = requiredWidthPx / cw;
      break;
    case 'box':
      scale = Math.max(1, settings.boxPx) / Math.max(cw, ch);
      break;
    default:
      scale = 1;
  }

  const target = {
    width: Math.max(1, Math.round(cw * scale)),
    height: Math.max(1, Math.round(ch * scale)),
  };
  if (settings.sizeMode === 'box' && settings.square) target.width = target.height = Math.max(1, settings.boxPx);

  const printCm = { width: pxToCm(target.width, settings.dpi), height: pxToCm(target.height, settings.dpi) };
  // Si hay que agrandar, el archivo tendrá los DPI pedidos pero el detalle real es el de
  // los píxeles originales (la IA solo inventa detalle verosímil).
  const realDpi =
    settings.sizeMode === 'print' && scale > 1.001 ? effectiveDpi(cw, settings.printWidthCm) : settings.dpi;

  return {
    content,
    canvas: { width: cw, height: ch },
    padding,
    target,
    scale,
    upscaling: scale > 1.001,
    printCm,
    realDpi,
    requiredWidthPx,
  };
}

/** Nombre de archivo seguro (sin caracteres que Windows no acepta). */
export function safeFileName(name: string, extension: string): string {
  const base = name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .split('')
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 120);
  return `${base || 'recorte'}.${extension}`;
}
