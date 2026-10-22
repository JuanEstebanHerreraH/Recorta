// Acceso al worker de procesamiento de imagen desde la interfaz.
import { RpcClient } from '../workers/rpc';
import type { ImagingHandlers } from './handlers';

let client: RpcClient<ImagingHandlers> | null = null;

export function createImagingWorker(name = 'recorta-imagen'): RpcClient<ImagingHandlers> {
  const worker = new Worker(new URL('./imaging.worker.ts', import.meta.url), { type: 'module', name });
  return new RpcClient<ImagingHandlers>(worker);
}

/** Worker del editor (uno solo, guarda la imagen abierta). */
export function getImaging(): RpcClient<ImagingHandlers> {
  client ??= createImagingWorker();
  return client;
}
