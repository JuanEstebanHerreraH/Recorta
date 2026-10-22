// Acceso a la IA desde la interfaz: crea el worker la primera vez y le indica de dónde
// sacar el motor (empaquetado con la app) y los modelos (public/models o Hugging Face).
//
// El motor de IA (ONNX Runtime en WebAssembly) viaja dentro de la app compilada: no se
// descarga de ningún CDN, así funciona sin internet una vez que los modelos están en caché.
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { ALLOW_REMOTE_MODELS, MODEL_HOST, publicBaseUrl } from '../config';
import { RpcClient } from '../workers/rpc';
import type { AiHandlers } from './handlers';

let client: RpcClient<AiHandlers> | null = null;
let ready: Promise<RpcClient<AiHandlers>> | null = null;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getAi(): Promise<RpcClient<AiHandlers>> {
  if (ready) return ready;
  ready = (async () => {
    const base = publicBaseUrl();
    const models = await fetchJson<{ repos: string[] }>(`${base}models/manifest.json`);
    const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module', name: 'recorta-ia' });
    client = new RpcClient<AiHandlers>(worker);
    await client.call('init', {
      wasmPaths: {
        mjs: new URL(ortMjsUrl, document.baseURI).href,
        wasm: new URL(ortWasmUrl, document.baseURI).href,
      },
      remoteHost: MODEL_HOST,
      allowRemote: ALLOW_REMOTE_MODELS,
      // Ruta desde la raíz del sitio (sin "http://…"): así Transformers.js la trata como
      // carpeta local y no consulta Hugging Face por archivos que ya vienen con la app.
      localModelPath: models && models.repos.length > 0 ? new URL('models/', base).pathname : null,
      localRepos: models?.repos ?? [],
    });
    return client;
  })();
  ready.catch(() => {
    ready = null;
    client?.terminate();
    client = null;
  });
  return ready;
}

/** Reinicia el worker de IA (por ejemplo, si la tarjeta gráfica se colgó). */
export function resetAi(): void {
  client?.terminate();
  client = null;
  ready = null;
}
