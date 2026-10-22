// Lado "worker" de la IA: carga los modelos y los ejecuta fuera del hilo de la interfaz.
import {
  AutoModel,
  AutoProcessor,
  RawImage,
  SamModel,
  Tensor,
  env,
  pipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import type { HandlerContext } from '../workers/rpc';
import { BG_MODELS, SAM_MODEL, UPSCALE_MODEL, type BgModelId } from './models';

export interface AiInitArgs {
  wasmPaths: { mjs: string; wasm: string } | null;
  remoteHost: string;
  allowRemote: boolean;
  /** Carpeta de modelos incluidos con la app (ruta desde la raíz, p. ej. "/models/"). */
  localModelPath: string | null;
  /** Repositorios que de verdad están en esa carpeta (según models/manifest.json). */
  localRepos: string[];
}

export interface ImageInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type AiProgress =
  | { phase: 'download'; file: string; loaded: number; total: number; percent: number }
  | { phase: 'loading' }
  | { phase: 'running' }
  | { phase: 'tiles'; done: number; total: number };

// La librería devuelve tensores y modelos con tipos muy genéricos; aquí se usan como `any`.
type AnyModel = any;
type AnyProcessor = any;

const backgroundModels = new Map<BgModelId, Promise<{ model: AnyModel; processor: AnyProcessor }>>();
let samLoaded: Promise<{ model: AnyModel; processor: AnyProcessor; device: string }> | null = null;
let samState: { inputs: AnyModel; embeddings: AnyModel; width: number; height: number } | null = null;
let upscaler: Promise<{ pipe: AnyModel; device: string }> | null = null;

const notFound = () => new Response(null, { status: 404, statusText: 'Not Found' });

/**
 * Envuelve `fetch` para la carpeta local de modelos: si un modelo no está incluido con
 * la app, responde 404 al instante para que la librería lo descargue de internet.
 * Hace falta porque varios servidores (Vite, la app de escritorio) devuelven la página
 * principal (HTML) en lugar de un 404, y la librería la tomaría por un modelo roto.
 */
export function localModelFetch(
  localModelPath: string,
  localRepos: string[],
  baseFetch: typeof fetch,
  origin: string = self.location.origin,
) {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input.href;
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    const sameOrigin = !absolute || new URL(raw).origin === origin;
    const path = absolute ? new URL(raw).pathname : raw;
    if (!sameOrigin || !path.startsWith(localModelPath)) return baseFetch(input, init);

    const rest = decodeURIComponent(path.slice(localModelPath.length));
    if (!localRepos.some((repo) => rest.startsWith(`${repo}/`))) return notFound();
    const response = await baseFetch(input, init);
    if ((response.headers.get('content-type') ?? '').includes('text/html')) return notFound();
    return response;
  };
}

function progressReporter(ctx: HandlerContext) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (info: ProgressInfo) => {
    const data = info as unknown as { status: string; file?: string; loaded?: number; total?: number };
    if (data.status === 'progress' && data.file) {
      files.set(data.file, { loaded: data.loaded ?? 0, total: data.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      ctx.progress({
        phase: 'download',
        file: data.file,
        loaded,
        total,
        percent: total > 0 ? (loaded / total) * 100 : 0,
      } satisfies AiProgress);
    } else if (data.status === 'done' || data.status === 'ready') {
      ctx.progress({ phase: 'loading' } satisfies AiProgress);
    }
  };
}

function requireWebGpu(device: string): void {
  if (device === 'webgpu' && !(self.navigator as Navigator & { gpu?: unknown }).gpu) {
    throw Object.assign(new Error('WebGPU no está disponible en este equipo.'), { code: 'gpu' });
  }
}

/** Convierte la salida del modelo en una máscara de 0 a 255. */
export function tensorToMask(output: AnyModel): { mask: Uint8Array; width: number; height: number } {
  let tensor = output;
  if (tensor.type === 'float16') tensor = tensor.to('float32');
  const dims: number[] = tensor.dims;
  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const n = width * height;
  const data = tensor.data as ArrayLike<number>;
  const mask = new Uint8Array(n);

  if (tensor.type === 'uint8' || tensor.type === 'bool') {
    for (let i = 0; i < n; i++) mask[i] = tensor.type === 'bool' ? (data[i] ? 255 : 0) : data[i];
    return { mask, width, height };
  }

  // Si hay valores fuera de 0..1, la salida son "logits": se pasan por una sigmoide.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const logits = min < -0.01 || max > 1.01;
  for (let i = 0; i < n; i++) {
    const v = data[i];
    const p = logits ? 1 / (1 + Math.exp(-v)) : v;
    mask[i] = p <= 0 ? 0 : p >= 1 ? 255 : Math.round(p * 255);
  }
  return { mask, width, height };
}

async function loadBackgroundModel(id: BgModelId, ctx: HandlerContext) {
  let entry = backgroundModels.get(id);
  if (!entry) {
    const spec = BG_MODELS[id];
    requireWebGpu(spec.device);
    // Un solo modelo de fondo en memoria a la vez.
    for (const [otherId, other] of backgroundModels) {
      backgroundModels.delete(otherId);
      other.then(({ model }) => model.dispose?.()).catch(() => undefined);
    }
    const onProgress = progressReporter(ctx);
    entry = (async () => {
      const model = await AutoModel.from_pretrained(spec.repo, {
        device: spec.device,
        dtype: spec.dtype,
        ...(spec.modelFileName ? { model_file_name: spec.modelFileName } : {}),
        progress_callback: onProgress,
      });
      const processor = await AutoProcessor.from_pretrained(spec.repo, { progress_callback: onProgress });
      return { model, processor };
    })();
    entry.catch(() => backgroundModels.delete(id));
    backgroundModels.set(id, entry);
  }
  return entry;
}

async function runBackground(id: BgModelId, image: ImageInput, ctx: HandlerContext) {
  const { model, processor } = await loadBackgroundModel(id, ctx);
  ctx.progress({ phase: 'running' } satisfies AiProgress);
  const raw = new RawImage(image.data, image.width, image.height, 4);
  const inputs = await processor(raw);
  const session = model.sessions?.model;
  const inputName: string = session?.inputNames?.[0] ?? 'pixel_values';
  const outputName: string | undefined = session?.outputNames?.[0];
  const outputs = await model({ [inputName]: inputs.pixel_values });
  const output = outputName && outputs[outputName] ? outputs[outputName] : Object.values(outputs)[0];
  return tensorToMask(output);
}

export const handlers = {
  async init(args: AiInitArgs) {
    env.remoteHost = args.remoteHost;
    env.allowRemoteModels = args.allowRemote;
    env.allowLocalModels = Boolean(args.localModelPath);
    if (args.localModelPath) {
      env.localModelPath = args.localModelPath;
      env.fetch = localModelFetch(args.localModelPath, args.localRepos, globalThis.fetch.bind(globalThis));
    }
    env.useBrowserCache = true;
    const onnx = env.backends.onnx;
    if (args.wasmPaths && onnx.wasm) onnx.wasm.wasmPaths = args.wasmPaths;
    return { version: env.version, webgpu: Boolean((self.navigator as Navigator & { gpu?: unknown }).gpu) };
  },

  async removeBackground(args: { modelId: BgModelId; image: ImageInput }, ctx: HandlerContext) {
    const started = performance.now();
    const result = await runBackground(args.modelId, args.image, ctx);
    ctx.transfer(result.mask.buffer);
    return { ...result, ms: performance.now() - started };
  },

  /** Mide cuánto tarda el modelo de 512 px en la GPU (la primera pasada compila, se mide la segunda). */
  async benchmark(_args: Record<string, never>, ctx: HandlerContext) {
    const size = 512;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const inside = (x - 256) ** 2 + (y - 256) ** 2 < 150 ** 2;
        data[i] = inside ? 220 : x / 2;
        data[i + 1] = inside ? 60 : y / 2;
        data[i + 2] = inside ? 40 : 200;
        data[i + 3] = 255;
      }
    }
    const image = { data, width: size, height: size };
    await runBackground('birefnet-512', image, ctx);
    const started = performance.now();
    await runBackground('birefnet-512', image, ctx);
    return { seconds: (performance.now() - started) / 1000 };
  },

  async samEncode(args: { device: 'webgpu' | 'wasm'; image: ImageInput }, ctx: HandlerContext) {
    requireWebGpu(args.device);
    if (samLoaded) {
      const current = await samLoaded.catch(() => null);
      if (!current || current.device !== args.device) {
        current?.model.dispose?.();
        samLoaded = null;
        samState = null;
      }
    }
    if (!samLoaded) {
      const onProgress = progressReporter(ctx);
      samLoaded = (async () => {
        const model = await SamModel.from_pretrained(SAM_MODEL.repo, {
          device: args.device,
          dtype: SAM_MODEL.dtypeFor(args.device),
          progress_callback: onProgress,
        });
        const processor = await AutoProcessor.from_pretrained(SAM_MODEL.repo, { progress_callback: onProgress });
        return { model, processor, device: args.device };
      })();
      samLoaded.catch(() => {
        samLoaded = null;
      });
    }
    const { model, processor } = await samLoaded;
    ctx.progress({ phase: 'running' } satisfies AiProgress);
    const raw = new RawImage(args.image.data, args.image.width, args.image.height, 4);
    const inputs = await processor(raw);
    const embeddings = await model.get_image_embeddings(inputs);
    samState = { inputs, embeddings, width: args.image.width, height: args.image.height };
    return { ready: true };
  },

  async samDecode(args: { points: Array<{ x: number; y: number; positive: boolean }> }) {
    if (!samLoaded || !samState) throw new Error('Primero hay que preparar la imagen para seleccionar.');
    if (args.points.length === 0) throw new Error('Marca al menos un punto.');
    const { model, processor } = await samLoaded;
    const { inputs, embeddings } = samState;
    const reshaped: number[] = inputs.reshaped_input_sizes[0];
    const coords = new Float32Array(args.points.length * 2);
    const labels = new BigInt64Array(args.points.length);
    args.points.forEach((p, i) => {
      coords[i * 2] = p.x * reshaped[1];
      coords[i * 2 + 1] = p.y * reshaped[0];
      labels[i] = p.positive ? 1n : 0n;
    });
    const input_points = new Tensor('float32', coords, [1, 1, args.points.length, 2]);
    const input_labels = new Tensor('int64', labels, [1, 1, args.points.length]);
    const { pred_masks, iou_scores } = await model({ ...embeddings, input_points, input_labels });
    const masks = await processor.post_process_masks(pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
    const image = RawImage.fromTensor(masks[0][0]);
    const scores = iou_scores.data as Float32Array;
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    const count = scores.length;
    const mask = new Uint8Array(image.width * image.height);
    for (let i = 0; i < mask.length; i++) mask[i] = image.data[count * i + best] ? 255 : 0;
    return { mask, width: image.width, height: image.height, score: scores[best] };
  },

  async samReset() {
    samState = null;
    return { ok: true };
  },

  /** Agranda ×2 con Swin2SR, por mosaicos para no agotar la memoria. */
  async upscale(args: { device: 'webgpu' | 'wasm'; image: ImageInput }, ctx: HandlerContext) {
    requireWebGpu(args.device);
    if (upscaler) {
      const current = await upscaler.catch(() => null);
      if (!current || current.device !== args.device) {
        current?.pipe.dispose?.();
        upscaler = null;
      }
    }
    if (!upscaler) {
      const onProgress = progressReporter(ctx);
      upscaler = (async () => {
        const pipe = await pipeline('image-to-image', UPSCALE_MODEL.repo, {
          device: args.device,
          dtype: UPSCALE_MODEL.dtype,
          progress_callback: onProgress,
        });
        return { pipe, device: args.device };
      })();
      upscaler.catch(() => {
        upscaler = null;
      });
    }
    const { pipe } = await upscaler;
    const { data, width, height } = args.image;
    const tile = 192;
    const pad = 16;
    const outW = width * 2;
    const outH = height * 2;
    const out = new Uint8ClampedArray(outW * outH * 4);
    const tilesX = Math.ceil(width / tile);
    const tilesY = Math.ceil(height / tile);
    const total = tilesX * tilesY;
    let done = 0;

    for (let ty = 0; ty < height; ty += tile) {
      for (let tx = 0; tx < width; tx += tile) {
        const x0 = Math.max(0, tx - pad);
        const y0 = Math.max(0, ty - pad);
        const x1 = Math.min(width, tx + tile + pad);
        const y1 = Math.min(height, ty + tile + pad);
        const rw = x1 - x0;
        const rh = y1 - y0;
        const rgb = new Uint8ClampedArray(rw * rh * 3);
        for (let y = 0; y < rh; y++) {
          for (let x = 0; x < rw; x++) {
            const s = ((y0 + y) * width + (x0 + x)) * 4;
            const d = (y * rw + x) * 3;
            rgb[d] = data[s];
            rgb[d + 1] = data[s + 1];
            rgb[d + 2] = data[s + 2];
          }
        }
        const result = (await pipe(new RawImage(rgb, rw, rh, 3))) as AnyModel;
        const resultData = result.data as Uint8ClampedArray;
        const channels: number = result.channels;
        const resultWidth: number = result.width;
        // Se copia solo el centro del mosaico (sin el margen de contexto).
        const cw = Math.min(tile, width - tx);
        const ch = Math.min(tile, height - ty);
        for (let y = 0; y < ch * 2; y++) {
          for (let x = 0; x < cw * 2; x++) {
            const sx = (tx - x0) * 2 + x;
            const sy = (ty - y0) * 2 + y;
            const s = (sy * resultWidth + sx) * channels;
            const d = ((ty * 2 + y) * outW + (tx * 2 + x)) * 4;
            out[d] = resultData[s];
            out[d + 1] = resultData[s + 1];
            out[d + 2] = resultData[s + 2];
            out[d + 3] = 255;
          }
        }
        done++;
        ctx.progress({ phase: 'tiles', done, total } satisfies AiProgress);
      }
    }
    ctx.transfer(out.buffer);
    return { data: out, width: outW, height: outH };
  },

  async dispose() {
    for (const [id, entry] of backgroundModels) {
      backgroundModels.delete(id);
      await entry.then(({ model }) => model.dispose?.()).catch(() => undefined);
    }
    if (samLoaded) {
      await samLoaded.then(({ model }) => model.dispose?.()).catch(() => undefined);
      samLoaded = null;
      samState = null;
    }
    if (upscaler) {
      await upscaler.then(({ pipe }) => pipe.dispose?.()).catch(() => undefined);
      upscaler = null;
    }
    return { ok: true };
  },
};

export type AiHandlers = typeof handlers;
