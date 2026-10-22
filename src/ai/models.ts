// Modelos de IA que usa Recorta. Todos se descargan una sola vez desde Hugging Face
// (o desde public/models si se descargaron antes) y corren en la computadora del usuario.
// Si cambias algo aquí, actualiza también scripts/download-models.mjs y docs/LICENCIAS.md.
import type { LowQuality, Tier } from '../hardware/tiers';

export type BgModelId = 'birefnet-1024' | 'birefnet-512' | 'u2netp' | 'u2net';

export interface BgModelSpec {
  id: BgModelId;
  label: string;
  repo: string;
  device: 'webgpu' | 'wasm';
  /** dtype que se pide a la librería ('fp32' + model_file_name permite cargar un archivo fp16). */
  dtype: 'fp32' | 'fp16' | 'q8';
  modelFileName?: string;
  /** Resolución con la que el modelo ve la imagen. */
  inputSize: number;
  downloadMB: number;
  license: string;
}

export const BG_MODELS: Record<BgModelId, BgModelSpec> = {
  'birefnet-1024': {
    id: 'birefnet-1024',
    label: 'BiRefNet lite, 1024 px (GPU)',
    repo: 'jiabins0303/birefnet-lite-1024-webgpu',
    device: 'webgpu',
    dtype: 'fp32',
    modelFileName: 'model_fp16',
    inputSize: 1024,
    downloadMB: 115,
    license: 'MIT',
  },
  'birefnet-512': {
    id: 'birefnet-512',
    label: 'BiRefNet lite, 512 px (GPU)',
    repo: 'Wattsey/birefnet-lite-512-webgpu',
    device: 'webgpu',
    dtype: 'fp32',
    modelFileName: 'model_fp16',
    inputSize: 512,
    downloadMB: 99,
    license: 'MIT',
  },
  u2netp: {
    id: 'u2netp',
    label: 'U²-Net liviano, 320 px (procesador)',
    repo: 'BritishWerewolf/U-2-Netp',
    device: 'wasm',
    dtype: 'fp32',
    inputSize: 320,
    downloadMB: 5,
    license: 'Apache-2.0',
  },
  u2net: {
    id: 'u2net',
    label: 'U²-Net completo, 320 px (procesador)',
    repo: 'BritishWerewolf/U-2-Net',
    device: 'wasm',
    dtype: 'fp32',
    inputSize: 320,
    downloadMB: 176,
    license: 'Apache-2.0',
  },
};

export function bgModelFor(tier: Tier, lowQuality: LowQuality): BgModelSpec {
  if (tier === 'alto') return BG_MODELS['birefnet-1024'];
  if (tier === 'medio') return BG_MODELS['birefnet-512'];
  return lowQuality === 'mejor' ? BG_MODELS.u2net : BG_MODELS.u2netp;
}

export const SAM_MODEL = {
  repo: 'Xenova/slimsam-77-uniform',
  label: 'SlimSAM (seleccionar con un clic)',
  dtypeFor: (device: 'webgpu' | 'wasm') => (device === 'webgpu' ? 'fp16' : 'q8') as 'fp16' | 'q8',
  downloadMB: { webgpu: 21, wasm: 14 },
  license: 'Apache-2.0',
};

export const UPSCALE_MODEL = {
  repo: 'Xenova/swin2SR-classical-sr-x2-64',
  label: 'Swin2SR ×2 (agrandar con IA)',
  dtype: 'fp32' as const,
  downloadMB: 54,
  license: 'Apache-2.0',
};

/** Resolución máxima de la copia que se envía a la IA (la IA la reduce igual). */
export const AI_INPUT_MAX_SIDE = 2048;
