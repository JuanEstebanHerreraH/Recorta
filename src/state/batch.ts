// Lote: procesar muchas imágenes con los mismos ajustes y descargarlas en un .zip.
import { zipSync } from 'fflate';
import { create } from 'zustand';
import { AI_INPUT_MAX_SIDE } from '../ai/models';
import { planExport, safeFileName } from '../export/settings';
import { TIERS } from '../hardware/tiers';
import { createImagingWorker } from '../imaging/client';
import { hexToRgb } from '../imaging/geometry';
import { formatBytes } from '../lib/format';
import { baseName, decodeImage, downscaleForAi, saveFile } from '../lib/image-io';
import { runAiRemoval, openImage } from './actions';
import { effectiveTier, notify, useStore } from './store';

export type BatchMethod = 'ia' | 'color' | 'ninguno';

export interface BatchItem {
  id: string;
  file: File;
  status: 'pendiente' | 'procesando' | 'listo' | 'error';
  error?: string;
  thumbUrl?: string;
  result?: { bytes: Uint8Array; fileName: string; width: number; height: number };
}

export interface BatchSettings {
  method: BatchMethod;
  feather: number;
  shift: number;
  halo: boolean;
}

interface BatchState {
  items: BatchItem[];
  running: boolean;
  cancelRequested: boolean;
  settings: BatchSettings;
}

export const useBatch = create<BatchState>(() => ({
  items: [],
  running: false,
  cancelRequested: false,
  settings: { method: 'ia', feather: 0, shift: 0, halo: true },
}));

let counter = 0;

export function addBatchFiles(files: File[]): void {
  const images = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(f.name));
  if (images.length < files.length) notify('warning', 'Algunos archivos no son imágenes', 'Se ignoraron.');
  useBatch.setState((s) => ({
    items: [...s.items, ...images.map((file) => ({ id: `item-${++counter}`, file, status: 'pendiente' as const }))],
  }));
}

export function removeBatchItem(id: string): void {
  useBatch.setState((s) => {
    const item = s.items.find((i) => i.id === id);
    if (item?.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
    return { items: s.items.filter((i) => i.id !== id) };
  });
}

export function clearBatch(): void {
  for (const item of useBatch.getState().items) if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  useBatch.setState({ items: [] });
}

export function updateBatchSettings(patch: Partial<BatchSettings>): void {
  useBatch.setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export function cancelBatch(): void {
  useBatch.setState({ cancelRequested: true });
}

function patchItem(id: string, patch: Partial<BatchItem>): void {
  useBatch.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
}

async function thumbnail(rgba: Uint8ClampedArray, width: number, height: number): Promise<string> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
}

export async function runBatch(): Promise<void> {
  const { items, settings } = useBatch.getState();
  const pending = items.filter((i) => i.status !== 'listo');
  if (pending.length === 0) return;
  useBatch.setState({ running: true, cancelRequested: false });

  // Worker propio para el lote, así no interfiere con la imagen abierta en el editor.
  const imaging = createImagingWorker('recorta-lote');
  const app = useStore.getState();
  const exportSettings = { ...app.exportSettings, upscale: 'quality' as const };
  const tier = effectiveTier(app);
  const maxPixels = TIERS[tier].maxEditMP * 1e6;
  const usedNames = new Set<string>();

  try {
    for (const item of pending) {
      if (useBatch.getState().cancelRequested) break;
      patchItem(item.id, { status: 'procesando', error: undefined });
      try {
        const decoded = await decodeImage(item.file, maxPixels);
        const { width, height } = decoded;
        const copy = decoded.rgba.slice();
        await imaging.call('setImage', { id: item.id, rgba: copy, width, height }, { transfer: [copy.buffer] });

        let mask: Uint8Array = new Uint8Array(width * height);
        if (decoded.hasAlpha) for (let i = 0; i < mask.length; i++) mask[i] = decoded.rgba[i * 4 + 3];
        else mask.fill(255);

        if (settings.method === 'ia') {
          const input = downscaleForAi(decoded.rgba, width, height, AI_INPUT_MAX_SIDE);
          const ai = await runAiRemoval(input, false);
          mask = await imaging.call(
            'upsample',
            { low: ai.mask, lowWidth: ai.width, lowHeight: ai.height, guided: true },
            { transfer: [ai.mask.buffer] },
          );
        } else if (settings.method === 'color') {
          mask = await imaging.call(
            'colorKey',
            { mask, options: { seeds: 'borders', ...useStore.getState().colorKey } },
            { transfer: [mask.buffer] },
          );
        }
        if (settings.shift !== 0) {
          mask = await imaging.call('shiftEdge', { mask, px: settings.shift }, { transfer: [mask.buffer] });
        }
        if (settings.feather > 0) {
          mask = await imaging.call('feather', { mask, radius: settings.feather }, { transfer: [mask.buffer] });
        }

        const prep = await imaging.call(
          'prepareExport',
          { mask, halo: { enabled: settings.halo, strength: 1 }, trim: exportSettings.trim },
          { transfer: [mask.buffer] },
        );
        const plan = planExport({ width: prep.width, height: prep.height }, exportSettings);
        const background =
          exportSettings.background === 'color' || exportSettings.format === 'jpg'
            ? hexToRgb(exportSettings.backgroundColor)
            : null;
        const result = await imaging.call(
          'finishExport',
          {
            rgba: prep.rgba,
            width: prep.width,
            height: prep.height,
            content: { width: prep.width, height: prep.height },
            canvas: plan.canvas,
            target: plan.target,
            padding: plan.padding,
            square: exportSettings.square,
            background,
            pngAuto: exportSettings.format === 'png' && exportSettings.pngMode === 'auto',
            encode: {
              format: exportSettings.format,
              pngMode: exportSettings.pngMode === 'png8' ? 'png8' : 'png24',
              colors: exportSettings.colors,
              dither: exportSettings.dither,
              optimize: exportSettings.optimize,
              quality: exportSettings.quality,
              dpi: exportSettings.dpi,
              text: null,
            },
          },
          { transfer: [prep.rgba.buffer] },
        );

        let fileName = safeFileName(`${baseName(item.file.name)}-recorte`, result.extension);
        for (let n = 2; usedNames.has(fileName); n++) {
          fileName = safeFileName(`${baseName(item.file.name)}-recorte-${n}`, result.extension);
        }
        usedNames.add(fileName);
        const thumbUrl = await thumbnail(result.preview.rgba, result.preview.width, result.preview.height);
        patchItem(item.id, {
          status: 'listo',
          thumbUrl,
          result: { bytes: result.bytes, fileName, width: result.width, height: result.height },
        });
      } catch (error) {
        patchItem(item.id, { status: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    imaging.terminate();
    useBatch.setState({ running: false });
  }

  const done = useBatch.getState().items.filter((i) => i.status === 'listo').length;
  const failed = useBatch.getState().items.filter((i) => i.status === 'error').length;
  if (failed > 0) notify('warning', `Listas ${done}, con error ${failed}`, 'Revisa las que fallaron: puedes abrirlas en el editor.');
  else notify('success', `Listas ${done} imágenes`, 'Descárgalas juntas en un .zip.');
}

export async function downloadBatchZip(): Promise<void> {
  const ready = useBatch.getState().items.filter((i) => i.status === 'listo' && i.result);
  if (ready.length === 0) return;
  const files: Record<string, Uint8Array> = {};
  for (const item of ready) files[item.result!.fileName] = item.result!.bytes;
  // Las imágenes ya están comprimidas: guardarlas sin volver a comprimir es más rápido.
  const zip = zipSync(files, { level: 0 });
  const total = ready.reduce((sum, i) => sum + i.result!.bytes.length, 0);
  const outcome = await saveFile(zip, 'recortes.zip', 'application/zip');
  if (outcome !== 'cancelled') notify('success', 'Lote descargado', `${ready.length} archivos, ${formatBytes(total)}.`);
}

export async function openBatchItemInEditor(id: string): Promise<void> {
  const item = useBatch.getState().items.find((i) => i.id === id);
  if (!item) return;
  useStore.setState({ mode: 'editor' });
  await openImage(item.file);
}
