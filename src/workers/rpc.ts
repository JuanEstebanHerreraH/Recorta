// Comunicación simple y tipada con los Web Workers (hilos en segundo plano).
// La interfaz nunca se congela: todo el trabajo pesado corre en los workers.

export interface RpcError {
  message: string;
  /** Códigos conocidos: 'gpu' (falló la tarjeta gráfica), 'memory', 'network', 'unsupported'. */
  code?: string;
}

type Message =
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; error: RpcError }
  | { id: number; type: 'progress'; progress: unknown };

export type Handlers = Record<string, (args: never, ctx: HandlerContext) => unknown>;

export interface HandlerContext {
  progress: (value: unknown) => void;
  /** Marca buffers para transferir sin copiar. */
  transfer: (...items: Transferable[]) => void;
}

export class RpcFailure extends Error {
  code?: string;
  constructor(error: RpcError) {
    super(error.message);
    this.code = error.code;
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (value: unknown) => void;
}

export class RpcClient<H extends Handlers> {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      if (message.type === 'progress') {
        entry.onProgress?.(message.progress);
        return;
      }
      this.pending.delete(message.id);
      if (message.type === 'result') entry.resolve(message.result);
      else entry.reject(new RpcFailure(message.error));
    };
    worker.onerror = (event) => {
      const error = new RpcFailure({ message: event.message || 'El proceso en segundo plano se detuvo.', code: 'crash' });
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  call<K extends keyof H & string>(
    op: K,
    args: Parameters<H[K]>[0] extends undefined ? Record<string, never> | undefined : Parameters<H[K]>[0],
    options: { transfer?: Transferable[]; onProgress?: (value: never) => void } = {},
  ): Promise<Awaited<ReturnType<H[K]>>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress: options.onProgress as ((value: unknown) => void) | undefined,
      });
      this.worker.postMessage({ id, op, args }, options.transfer ?? []);
    });
  }

  terminate(): void {
    this.worker.terminate();
    const error = new RpcFailure({ message: 'Proceso cancelado.', code: 'cancelled' });
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
}

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

/** Lado del worker: atiende pedidos uno por uno, en orden. */
export function serveRpc(handlers: Handlers): void {
  const scope = self as unknown as WorkerScope;
  let queue: Promise<void> = Promise.resolve();

  scope.onmessage = (event: MessageEvent<{ id: number; op: string; args: unknown }>) => {
    const { id, op, args } = event.data;
    queue = queue.then(async () => {
      const transfers: Transferable[] = [];
      const ctx: HandlerContext = {
        progress: (value) => scope.postMessage({ id, type: 'progress', progress: value }),
        transfer: (...items) => transfers.push(...items),
      };
      try {
        const handler = handlers[op];
        if (!handler) throw new Error(`Operación desconocida: ${op}`);
        const result = await (handler as (a: unknown, c: HandlerContext) => unknown)(args, ctx);
        scope.postMessage({ id, type: 'result', result }, transfers);
      } catch (error) {
        scope.postMessage({ id, type: 'error', error: toRpcError(error) });
      }
    });
  };
}

export function toRpcError(error: unknown): RpcError {
  if (error instanceof RpcFailure) return { message: error.message, code: error.code };
  const message = error instanceof Error ? error.message : String(error);
  const ownCode = (error as { code?: unknown } | null)?.code;
  if (typeof ownCode === 'string') return { message, code: ownCode };
  const lower = message.toLowerCase();
  let code: string | undefined;
  if (/out of memory|bad_alloc|allocation failed|array buffer allocation|memory access out of bounds/.test(lower)) {
    code = 'memory';
  } else if (/webgpu|gpu|adapter|device (was )?lost|shader|storage buffer/.test(lower)) {
    code = 'gpu';
  } else if (/fetch|network|failed to load|404|could not locate file|unable to get model file/.test(lower)) {
    code = 'network';
  }
  return { message, code };
}
