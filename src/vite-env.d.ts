/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MODEL_HOST?: string;
  readonly VITE_ALLOW_REMOTE_MODELS?: string;
  readonly VITE_DEFAULT_TIER?: string;
  readonly VITE_MAX_HISTORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;

// API de "Guardar como" del navegador (Chrome, Edge y la app de escritorio).
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}
