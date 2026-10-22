// Detección del equipo: tarjeta gráfica (WebGPU), procesador y memoria.
// Todo se consulta localmente; no se envía nada a ningún servidor.

export interface GpuInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  isFallback: boolean;
}

export interface HardwareInfo {
  webgpu: boolean;
  gpu: GpuInfo | null;
  /** La GPU admite media precisión (shader-f16), necesaria para los modelos rápidos. */
  shaderF16: boolean;
  maxStorageBuffersPerShaderStage: number;
  maxBufferSizeMB: number;
  cpuThreads: number;
  /** Memoria aproximada en GB (solo Chrome/Edge la informan, y con tope de 8). */
  memoryGB: number | null;
  /** El navegador permite varios hilos para la IA en procesador. */
  multiThread: boolean;
  isDesktopApp: boolean;
  browser: string;
  /** Motivo por el que no hay WebGPU, si corresponde. */
  webgpuProblem: string | null;
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Navegador';
}

export async function detectHardware(): Promise<HardwareInfo> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const isDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const base: HardwareInfo = {
    webgpu: false,
    gpu: null,
    shaderF16: false,
    maxStorageBuffersPerShaderStage: 0,
    maxBufferSizeMB: 0,
    cpuThreads: nav.hardwareConcurrency || 2,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    multiThread: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    isDesktopApp,
    browser: isDesktopApp ? 'App de escritorio' : browserName(),
    webgpuProblem: null,
  };

  if (!('gpu' in navigator) || !navigator.gpu) {
    base.webgpuProblem = 'Este navegador no tiene WebGPU (o está desactivado).';
    return base;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      base.webgpuProblem = 'WebGPU existe, pero no encontró una tarjeta gráfica compatible (drivers viejos o GPU bloqueada).';
      return base;
    }
    const legacy = adapter as GPUAdapter & {
      isFallbackAdapter?: boolean;
      requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
    };
    const info: Partial<GPUAdapterInfo> & { isFallbackAdapter?: boolean } =
      adapter.info ?? (legacy.requestAdapterInfo ? await legacy.requestAdapterInfo() : {});
    const isFallback = Boolean(info.isFallbackAdapter ?? legacy.isFallbackAdapter);

    base.gpu = {
      vendor: info.vendor ?? '',
      architecture: info.architecture ?? '',
      device: info.device ?? '',
      description: info.description ?? '',
      isFallback,
    };
    base.shaderF16 = adapter.features.has('shader-f16');
    base.maxStorageBuffersPerShaderStage = adapter.limits.maxStorageBuffersPerShaderStage;
    base.maxBufferSizeMB = Math.round(adapter.limits.maxBufferSize / 1024 / 1024);

    if (isFallback) {
      base.webgpuProblem = 'WebGPU usa un adaptador por software (sin tarjeta gráfica real): sería más lento que el procesador.';
      return base;
    }
    base.webgpu = true;
  } catch (error) {
    base.webgpuProblem = `No se pudo consultar la tarjeta gráfica: ${error instanceof Error ? error.message : String(error)}`;
  }
  return base;
}

/** Nombre legible de la GPU para mostrar en pantalla. */
export function gpuLabel(info: HardwareInfo): string {
  if (!info.gpu) return 'No disponible';
  const { description, vendor, architecture } = info.gpu;
  if (description) return description;
  const v = vendor ? vendor.charAt(0).toUpperCase() + vendor.slice(1) : 'GPU';
  return architecture ? `${v} (${architecture})` : v;
}
