// Estado global de la app (zustand). Las acciones con trabajo pesado están en actions.ts.
import { create } from 'zustand';
import { DEFAULT_TIER_CHOICE } from '../config';
import { DEFAULT_SETTINGS, type ExportSettings } from '../export/settings';
import type { HardwareInfo } from '../hardware/detect';
import { fallbackChain, type LowQuality, type Tier, type TierChoice } from '../hardware/tiers';
import { loadPref } from '../lib/storage';
import type { HistoryEntry, RefineState } from './history';

/** Tamaño máximo del pincel en píxeles (control deslizante y teclas [ ]). */
export const BRUSH_MAX = 500;

export type Tool = 'pan' | 'erase' | 'restore' | 'select' | 'picker';
export type Step = 'recortar' | 'refinar' | 'calidad' | 'exportar';
export type ViewBackground = 'checker' | 'black' | 'white' | 'color';
export type ViewMode = 'result' | 'mask' | 'original';
export type Mode = 'editor' | 'lote';

export interface DocState {
  id: string;
  name: string;
  width: number;
  height: number;
  original: Uint8ClampedArray;
  /** Máscara viva: el pincel la modifica directamente; `maskVersion` avisa los cambios. */
  mask: Uint8Array;
  maskVersion: number;
  /** Color sin halo (solo si "Quitar halo" está activo y ya se calculó). */
  fg: Uint8ClampedArray | null;
  fgVersion: number;
  sourceDpi: number | null;
  sourceBytes: number;
  sourceType: string;
  originalSize: { width: number; height: number };
  /** El modelo de IA que se usó por última vez (para la ficha). */
  aiModelUsed: string | null;
}

export interface BrushSettings {
  size: number;
  hardness: number;
  opacity: number;
  pressure: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
}

export interface Busy {
  label: string;
  /** 0..100, o null si no se sabe cuánto falta. */
  progress: number | null;
  detail?: string;
}

export interface SamPoint {
  x: number;
  y: number;
  positive: boolean;
}

export interface SamState {
  status: 'idle' | 'preparing' | 'ready' | 'error';
  docId: string | null;
  points: SamPoint[];
  preview: { mask: Uint8Array; width: number; height: number; score: number } | null;
}

export interface PreparedExport {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  fileName: string;
  width: number;
  height: number;
  dpi: number;
  paletteColors: number | null;
  exactPalette: boolean;
  optimized: boolean;
  pngMode: 'png24' | 'png8' | null;
  warning: string | null;
  analysisReason: string | null;
  previewUrl: string;
  report: string;
  /** Clave de los ajustes usados; si cambian, el resultado queda desactualizado. */
  key: string;
}

export interface ColorKeySettings {
  tolerance: number;
  softness: number;
  contiguous: boolean;
}

export interface AppState {
  mode: Mode;
  step: Step;
  hardware: HardwareInfo | null;
  autoTier: Tier;
  autoReasons: string[];
  tierChoice: TierChoice;
  lowQuality: LowQuality;
  failedTiers: Tier[];
  benchmarkSeconds: number | null;

  doc: DocState | null;
  history: HistoryEntry[];
  historyIndex: number;
  refine: RefineState;
  guidedEdges: boolean;

  tool: Tool;
  brush: BrushSettings;
  colorKey: ColorKeySettings;
  view: { background: ViewBackground; color: string; mode: ViewMode; zoom: number };
  fitRequest: number;
  zoomRequest: { value: number; id: number } | null;

  exportSettings: ExportSettings;
  prepared: PreparedExport | null;

  sam: SamState;
  busy: Busy | null;
  toasts: Toast[];
  hardwareOpen: boolean;
}

const savedBrush = loadPref<BrushSettings>('brush', { size: 60, hardness: 70, opacity: 100, pressure: true });

export const useStore = create<AppState>(() => ({
  mode: 'editor',
  step: 'recortar',
  hardware: null,
  autoTier: 'bajo',
  autoReasons: [],
  tierChoice: loadPref<TierChoice>('tierChoice', DEFAULT_TIER_CHOICE),
  lowQuality: loadPref<LowQuality>('lowQuality', 'rapida'),
  failedTiers: [],
  benchmarkSeconds: loadPref<number | null>('benchmarkSeconds', null),

  doc: null,
  history: [],
  historyIndex: -1,
  refine: { haloEnabled: false, haloStrength: 100 },
  guidedEdges: true,

  tool: 'erase',
  brush: savedBrush,
  colorKey: { tolerance: 18, softness: 30, contiguous: true },
  view: { background: 'checker', color: '#3f9b73', mode: 'result', zoom: 1 },
  fitRequest: 0,
  zoomRequest: null,

  exportSettings: { ...DEFAULT_SETTINGS, ...loadPref<Partial<ExportSettings>>('exportSettings', {}) },
  prepared: null,

  sam: { status: 'idle', docId: null, points: [], preview: null },
  busy: null,
  toasts: [],
  hardwareOpen: false,
}));

/** Nivel que se usa realmente: la elección del usuario, limitada por lo que el equipo puede. */
export function effectiveTier(state: AppState): Tier {
  const hw = state.hardware;
  const gpuOk = Boolean(hw?.webgpu && hw.shaderF16);
  let tier: Tier = state.tierChoice === 'auto' ? state.autoTier : state.tierChoice;
  if (!gpuOk) tier = 'bajo';
  // Si un nivel ya falló en esta sesión, se usa el siguiente que quede.
  return fallbackChain(tier, state.failedTiers)[0];
}

let toastId = 1;

export function notify(kind: Toast['kind'], title: string, body?: string): void {
  const toast: Toast = { id: toastId++, kind, title, body };
  useStore.setState((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
  const ttl = kind === 'error' ? 12000 : kind === 'warning' ? 9000 : 5000;
  setTimeout(() => dismissToast(toast.id), ttl);
}

export function dismissToast(id: number): void {
  useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function setBusy(busy: Busy | null): void {
  useStore.setState({ busy });
}
