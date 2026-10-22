// Acciones de la app: abrir, recortar con IA, refinar, historial y exportar.
import { getAi, resetAi } from '../ai/client';
import type { AiProgress } from '../ai/handlers';
import { AI_INPUT_MAX_SIDE, bgModelFor } from '../ai/models';
import { APP_NAME, APP_VERSION, MAX_HISTORY } from '../config';
import { buildReport, formatLabel } from '../export/report';
import { PRESETS, planExport, safeFileName, type ExportSettings, type PresetId } from '../export/settings';
import { detectHardware } from '../hardware/detect';
import {
  TIERS,
  decideTier,
  fallbackChain,
  tierFromBenchmark,
  type LowQuality,
  type Tier,
  type TierChoice,
} from '../hardware/tiers';
import { getImaging } from '../imaging/client';
import { contentBounds, hexToRgb } from '../imaging/geometry';
import { combineMasks, invertMask } from '../imaging/mask';
import { naturalPrintCm } from '../imaging/units';
import { formatBytes, formatSeconds } from '../lib/format';
import { baseName, decodeImage, downscaleForAi, saveFile } from '../lib/image-io';
import { savePref } from '../lib/storage';
import { RpcFailure } from '../workers/rpc';
import { makeEntry, pushEntry, restoreSnapshot } from './history';
import {
  effectiveTier,
  notify,
  setBusy,
  useStore,
  type AppState,
  type PreparedExport,
  type SamPoint,
  type Tool,
} from './store';

const get = useStore.getState;
const set = useStore.setState;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return error instanceof RpcFailure ? error.code : undefined;
}

/** Traduce el progreso de la IA a la barra de estado. */
function aiProgressToBusy(label: string, detail?: string) {
  return (p: AiProgress) => {
    if (p.phase === 'download') {
      setBusy({
        label: 'Descargando el modelo (solo la primera vez)',
        progress: p.total > 0 ? p.percent : null,
        detail: p.total > 0 ? `${formatBytes(p.loaded)} de ${formatBytes(p.total)}` : formatBytes(p.loaded),
      });
    } else if (p.phase === 'loading') {
      setBusy({ label: 'Preparando el modelo', progress: null, detail });
    } else if (p.phase === 'tiles') {
      setBusy({ label, progress: (p.done / p.total) * 100, detail: `Parte ${p.done} de ${p.total}` });
    } else {
      setBusy({ label, progress: null, detail });
    }
  };
}

// ─── Equipo ────────────────────────────────────────────────────────────────

export async function initHardware(): Promise<void> {
  const info = await detectHardware();
  const decision = decideTier(info);
  const saved = get().benchmarkSeconds;
  let autoTier = decision.tier;
  const reasons = [...decision.reasons];
  if (saved !== null && info.webgpu && info.shaderF16) {
    autoTier = tierFromBenchmark(saved);
    reasons.unshift(`Medición guardada: el modelo de 512 px tardó ${formatSeconds(saved * 1000)}.`);
  }
  set({ hardware: info, autoTier, autoReasons: reasons });
}

export function setTierChoice(choice: TierChoice): void {
  savePref('tierChoice', choice);
  set({ tierChoice: choice, failedTiers: [] });
}

export function setLowQuality(value: LowQuality): void {
  savePref('lowQuality', value);
  set({ lowQuality: value });
}

export async function runBenchmark(): Promise<void> {
  const hw = get().hardware;
  if (!hw?.webgpu || !hw.shaderF16) {
    notify('info', 'No hace falta medir', 'Sin WebGPU con media precisión, la IA usa el procesador (nivel Bajo).');
    return;
  }
  setBusy({ label: 'Midiendo tu equipo', progress: null, detail: 'Descarga el modelo de 512 px una sola vez (99 MB).' });
  try {
    const ai = await getAi();
    const { seconds } = await ai.call('benchmark', {}, { onProgress: aiProgressToBusy('Midiendo tu equipo') });
    const tier = tierFromBenchmark(seconds);
    savePref('benchmarkSeconds', seconds);
    set((s) => ({
      benchmarkSeconds: seconds,
      autoTier: tier,
      autoReasons: [
        `Medición: el modelo de 512 px tardó ${formatSeconds(seconds * 1000)} en tu tarjeta gráfica.`,
        ...s.autoReasons.filter((r) => !r.startsWith('Medición')),
      ],
      failedTiers: [],
    }));
    notify('success', `Nivel recomendado: ${TIERS[tier].name}`, `El modelo de 512 px tardó ${formatSeconds(seconds * 1000)}.`);
  } catch (error) {
    resetAi();
    set((s) => ({
      autoTier: 'bajo',
      autoReasons: ['La prueba en la tarjeta gráfica falló: se usará el procesador.', ...s.autoReasons],
    }));
    notify('warning', 'La tarjeta gráfica no pudo con la prueba', `${errorMessage(error)}. Se recomienda el nivel Bajo.`);
  } finally {
    setBusy(null);
  }
}

function markTierFailed(tier: Tier): void {
  set((s) => ({ failedTiers: s.failedTiers.includes(tier) ? s.failedTiers : [...s.failedTiers, tier] }));
}

// ─── Abrir y cerrar ────────────────────────────────────────────────────────

export async function openImage(file: File): Promise<void> {
  const state = get();
  const tier = effectiveTier(state);
  const maxMP = TIERS[tier].maxEditMP;
  setBusy({ label: 'Abriendo la imagen', progress: null, detail: file.name });
  try {
    const decoded = await decodeImage(file, maxMP * 1e6);
    const { width, height, rgba } = decoded;
    const mask = new Uint8Array(width * height);
    if (decoded.hasAlpha) for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3];
    else mask.fill(255);

    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
    const copy = rgba.slice();
    await getImaging().call('setImage', { id, rgba: copy, width, height }, { transfer: [copy.buffer] });
    const previous = get().prepared;
    if (previous) URL.revokeObjectURL(previous.previewUrl);

    const refine = { haloEnabled: false, haloStrength: 100 };
    const entry = makeEntry(decoded.hasAlpha ? 'Abrir imagen (ya tenía transparencia)' : 'Abrir imagen', mask, refine);
    set((s) => ({
      doc: {
        id,
        name: file.name || 'imagen',
        width,
        height,
        original: rgba,
        mask,
        maskVersion: 1,
        fg: null,
        fgVersion: 0,
        sourceDpi: decoded.dpi,
        sourceBytes: file.size,
        sourceType: file.type,
        originalSize: { width: decoded.originalWidth, height: decoded.originalHeight },
        aiModelUsed: null,
      },
      history: [entry],
      historyIndex: 0,
      refine,
      prepared: null,
      sam: { status: 'idle', docId: null, points: [], preview: null },
      step: 'recortar',
      tool: s.tool === 'select' || s.tool === 'picker' ? 'erase' : s.tool,
      fitRequest: s.fitRequest + 1,
      view: { ...s.view, mode: 'result' },
      exportSettings: { ...s.exportSettings, fileName: `${baseName(file.name || 'imagen')}-recorte` },
    }));
    getAi()
      .then((ai) => ai.call('samReset', {}))
      .catch(() => undefined);

    if (width !== decoded.originalWidth) {
      notify(
        'warning',
        'La imagen se abrió más chica',
        `Tenía ${Math.round((decoded.originalWidth * decoded.originalHeight) / 1e6)} MP y el nivel ${TIERS[tier].name} edita hasta ${maxMP} MP. Si tu equipo puede, sube de nivel en "Equipo".`,
      );
    }
  } catch (error) {
    notify('error', 'No se pudo abrir la imagen', errorMessage(error));
  } finally {
    setBusy(null);
  }
}

export function closeImage(): void {
  const prepared = get().prepared;
  if (prepared) URL.revokeObjectURL(prepared.previewUrl);
  set({ doc: null, history: [], historyIndex: -1, prepared: null, sam: { status: 'idle', docId: null, points: [], preview: null } });
  getImaging()
    .call('clearImage', {})
    .catch(() => undefined);
}

// ─── Historial ─────────────────────────────────────────────────────────────

function historyLimit(state: AppState): number {
  return Math.min(MAX_HISTORY, TIERS[effectiveTier(state)].historyLimit);
}

/** Registra un cambio ya aplicado sobre `doc.mask` como un paso del historial. */
export function commitMask(label: string, detail?: string): void {
  const s = get();
  if (!s.doc) return;
  const doc = { ...s.doc, maskVersion: s.doc.maskVersion + 1 };
  const next = pushEntry(s.history, s.historyIndex, makeEntry(label, doc.mask, s.refine, detail), historyLimit(s));
  set({ doc, history: next.entries, historyIndex: next.index });
  scheduleHalo();
}

function replaceMask(mask: Uint8Array, label: string, detail?: string): void {
  const doc = get().doc;
  if (!doc) return;
  doc.mask.set(mask);
  commitMask(label, detail);
}

export function goToHistory(index: number): void {
  const s = get();
  const entry = s.history[index];
  if (!entry || !s.doc || index === s.historyIndex) return;
  s.doc.mask.set(restoreSnapshot(entry, s.doc.mask.length));
  set({
    historyIndex: index,
    refine: { ...entry.refine },
    doc: { ...s.doc, maskVersion: s.doc.maskVersion + 1 },
  });
  scheduleHalo(0);
}

export function undo(): void {
  goToHistory(get().historyIndex - 1);
}

export function redo(): void {
  goToHistory(get().historyIndex + 1);
}

// ─── Quitar halo ───────────────────────────────────────────────────────────

let haloTimer: ReturnType<typeof setTimeout> | undefined;
let haloRun = 0;

export function scheduleHalo(delay = 450): void {
  clearTimeout(haloTimer);
  const s = get();
  if (!s.doc) return;
  if (!s.refine.haloEnabled) {
    if (s.doc.fg) set({ doc: { ...s.doc, fg: null, fgVersion: 0 } });
    return;
  }
  haloTimer = setTimeout(runHalo, delay);
}

async function runHalo(): Promise<void> {
  const run = ++haloRun;
  const s = get();
  const doc = s.doc;
  if (!doc || !s.refine.haloEnabled) return;
  const version = doc.maskVersion;
  const mask = doc.mask.slice();
  try {
    const fg = await getImaging().call(
      'decontaminate',
      { mask, strength: s.refine.haloStrength / 100 },
      { transfer: [mask.buffer] },
    );
    const now = get();
    if (run !== haloRun || !now.doc || now.doc.id !== doc.id || !now.refine.haloEnabled) return;
    set({ doc: { ...now.doc, fg, fgVersion: version } });
  } catch (error) {
    notify('error', 'No se pudo quitar el halo', errorMessage(error));
  }
}

export function setHalo(enabled: boolean): void {
  const s = get();
  if (!s.doc) return;
  set({ refine: { ...s.refine, haloEnabled: enabled } });
  commitMask(enabled ? 'Quitar halo: activado' : 'Quitar halo: desactivado');
  scheduleHalo(0);
}

export function setHaloStrength(value: number, commit: boolean): void {
  const s = get();
  set({ refine: { ...s.refine, haloStrength: value } });
  if (commit && s.doc) {
    commitMask('Quitar halo: intensidad', `${Math.round(value)} %`);
    scheduleHalo(0);
  }
}

// ─── Recortar ──────────────────────────────────────────────────────────────

export interface AiMaskResult {
  mask: Uint8Array;
  width: number;
  height: number;
  ms: number;
  tier: Tier;
  modelLabel: string;
}

/**
 * Quita el fondo con la IA empezando por el nivel actual. Si un nivel falla (GPU sin
 * memoria, operación no soportada), baja solo al siguiente y lo recuerda en la sesión.
 */
export async function runAiRemoval(
  input: { data: Uint8ClampedArray; width: number; height: number },
  showProgress: boolean,
): Promise<AiMaskResult> {
  const start = effectiveTier(get());
  const chain = fallbackChain(start, get().failedTiers);
  let lastError: unknown = null;
  for (const tier of chain) {
    const spec = bgModelFor(tier, get().lowQuality);
    if (showProgress) {
      setBusy({ label: `Quitando el fondo (nivel ${TIERS[tier].name})`, progress: null, detail: spec.label });
    }
    try {
      const ai = await getAi();
      const result = await ai.call(
        'removeBackground',
        { modelId: spec.id, image: input },
        showProgress ? { onProgress: aiProgressToBusy('Quitando el fondo', spec.label) } : {},
      );
      return { mask: result.mask, width: result.width, height: result.height, ms: result.ms, tier, modelLabel: spec.label };
    } catch (error) {
      lastError = error;
      const code = errorCode(error);
      if (code === 'network' || tier === 'bajo') break;
      markTierFailed(tier);
      if (code === 'gpu' || code === 'memory' || code === 'crash') resetAi();
    }
  }
  throw lastError ?? new Error('La IA no está disponible.');
}

export async function removeBackgroundAi(): Promise<void> {
  const s = get();
  const doc = s.doc;
  if (!doc || s.busy) return;
  const start = effectiveTier(s);
  try {
    const input = downscaleForAi(doc.original, doc.width, doc.height, AI_INPUT_MAX_SIDE);
    const result = await runAiRemoval(input, true);
    setBusy({ label: 'Ajustando el borde a la imagen original', progress: null });
    const full = await getImaging().call(
      'upsample',
      { low: result.mask, lowWidth: result.width, lowHeight: result.height, guided: get().guidedEdges },
      { transfer: [result.mask.buffer] },
    );
    const current = get().doc;
    if (!current || current.id !== doc.id) return;
    current.mask.set(full);
    set({ doc: { ...current, aiModelUsed: result.modelLabel } });
    commitMask('Quitar fondo con IA', `${result.modelLabel}, ${formatSeconds(result.ms)}`);
    if (result.tier !== start) {
      notify(
        'warning',
        `Se usó el nivel ${TIERS[result.tier].name}`,
        `El nivel ${TIERS[start].name} no funcionó en este equipo; la app bajó de nivel automáticamente.`,
      );
    } else {
      notify('success', 'Fondo quitado', 'Revisa el borde en "Refinar". Cambiar el fondo de la vista ayuda a ver halos.');
    }
  } catch (error) {
    if (errorCode(error) === 'network') {
      notify(
        'error',
        'No se pudo descargar el modelo',
        'La primera vez hace falta internet para descargarlo; después funciona sin conexión. Revisa tu conexión e inténtalo de nuevo.',
      );
    } else {
      notify(
        'error',
        'La IA no pudo procesar esta imagen',
        `${errorMessage(error)}. Prueba "Quitar color de fondo" o una imagen más chica.`,
      );
    }
  } finally {
    setBusy(null);
  }
}

export async function colorKeyAt(seeds: Array<[number, number]> | 'borders'): Promise<void> {
  const s = get();
  const doc = s.doc;
  if (!doc) return;
  setBusy({ label: 'Quitando el color de fondo', progress: null });
  try {
    const mask = doc.mask.slice();
    const result = await getImaging().call(
      'colorKey',
      { mask, options: { seeds, ...s.colorKey } },
      { transfer: [mask.buffer] },
    );
    replaceMask(
      result,
      seeds === 'borders' ? 'Quitar color de fondo (desde los bordes)' : 'Quitar color con el gotero',
      `Tolerancia ${s.colorKey.tolerance} %, suavidad ${s.colorKey.softness} %`,
    );
  } catch (error) {
    notify('error', 'No se pudo quitar el color', errorMessage(error));
  } finally {
    setBusy(null);
  }
}

export function restoreAll(): void {
  const doc = get().doc;
  if (!doc) return;
  doc.mask.fill(255);
  commitMask('Restaurar toda la imagen');
}

export function invertSelection(): void {
  const doc = get().doc;
  if (!doc) return;
  doc.mask.set(invertMask(doc.mask));
  commitMask('Invertir lo visible y lo borrado');
}

// ─── Seleccionar con un clic (SAM) ─────────────────────────────────────────

export async function prepareSam(): Promise<boolean> {
  const s = get();
  const doc = s.doc;
  if (!doc) return false;
  if (s.sam.status === 'ready' && s.sam.docId === doc.id) return true;
  if (s.sam.status === 'preparing') return false;
  set({ sam: { status: 'preparing', docId: doc.id, points: [], preview: null } });
  const input = downscaleForAi(doc.original, doc.width, doc.height, 1024);
  const devices: Array<'webgpu' | 'wasm'> = effectiveTier(s) === 'bajo' ? ['wasm'] : ['webgpu', 'wasm'];
  for (const device of devices) {
    setBusy({ label: 'Preparando la selección con un clic', progress: null });
    try {
      const ai = await getAi();
      await ai.call('samEncode', { device, image: input }, { onProgress: aiProgressToBusy('Analizando la imagen') });
      set({ sam: { status: 'ready', docId: doc.id, points: [], preview: null } });
      return true;
    } catch (error) {
      if (device === 'webgpu' && errorCode(error) !== 'network') {
        resetAi();
        continue;
      }
      set({ sam: { status: 'error', docId: doc.id, points: [], preview: null } });
      notify('error', 'No se pudo preparar la selección', errorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  }
  return false;
}

let samDecoding = false;
let samPending: SamPoint[] | null = null;

export async function addSamPoint(x: number, y: number, positive: boolean): Promise<void> {
  const s = get();
  const doc = s.doc;
  if (!doc) return;
  if (s.sam.status !== 'ready' || s.sam.docId !== doc.id) {
    const ok = await prepareSam();
    if (!ok) return;
  }
  const points = [...get().sam.points, { x: x / doc.width, y: y / doc.height, positive }];
  set((st) => ({ sam: { ...st.sam, points } }));
  samPending = points;
  if (samDecoding) return;
  samDecoding = true;
  try {
    while (samPending) {
      const current = samPending;
      samPending = null;
      const ai = await getAi();
      const preview = await ai.call('samDecode', { points: current });
      if (get().sam.docId === doc.id) set((st) => ({ sam: { ...st.sam, preview } }));
    }
  } catch (error) {
    notify('error', 'No se pudo calcular la selección', errorMessage(error));
  } finally {
    samDecoding = false;
  }
}

export function clearSamPoints(): void {
  set((s) => ({ sam: { ...s.sam, points: [], preview: null } }));
}

export async function applySam(mode: 'keep-only' | 'remove' | 'add'): Promise<void> {
  const s = get();
  const doc = s.doc;
  const preview = s.sam.preview;
  if (!doc || !preview) return;
  setBusy({ label: 'Aplicando la selección', progress: null });
  try {
    const low = preview.mask.slice();
    const full = await getImaging().call(
      'resizeSelection',
      { mask: low, width: preview.width, height: preview.height, guided: s.guidedEdges },
      { transfer: [low.buffer] },
    );
    const combined = combineMasks(doc.mask, full, mode);
    const labels = {
      'keep-only': 'Selección con un clic: dejar solo esto',
      remove: 'Selección con un clic: quitar esto',
      add: 'Selección con un clic: sumar esto',
    } as const;
    replaceMask(combined, labels[mode]);
    clearSamPoints();
  } catch (error) {
    notify('error', 'No se pudo aplicar la selección', errorMessage(error));
  } finally {
    setBusy(null);
  }
}

// ─── Refinar ───────────────────────────────────────────────────────────────

export async function edgeOperation(kind: 'feather' | 'shiftEdge' | 'harden', amount: number): Promise<void> {
  const doc = get().doc;
  if (!doc || amount === 0) return;
  setBusy({ label: 'Ajustando el borde', progress: null });
  try {
    const imaging = getImaging();
    const mask = doc.mask.slice();
    const options = { transfer: [mask.buffer] };
    let result: Uint8Array;
    let label: string;
    if (kind === 'feather') {
      result = await imaging.call('feather', { mask, radius: amount }, options);
      label = 'Suavizar borde';
    } else if (kind === 'shiftEdge') {
      result = await imaging.call('shiftEdge', { mask, px: amount }, options);
      label = amount > 0 ? 'Expandir borde' : 'Contraer borde';
    } else {
      result = await imaging.call('harden', { mask, amount: amount / 100 }, options);
      label = 'Endurecer borde';
    }
    replaceMask(result, label, kind === 'harden' ? `${amount} %` : `${Math.abs(amount)} px`);
  } catch (error) {
    notify('error', 'No se pudo ajustar el borde', errorMessage(error));
  } finally {
    setBusy(null);
  }
}

// ─── Herramientas y vista ──────────────────────────────────────────────────

export function setTool(tool: Tool): void {
  set({ tool });
  if (tool === 'select') void prepareSam();
}

export function updateBrush(patch: Partial<AppState['brush']>): void {
  const brush = { ...get().brush, ...patch };
  savePref('brush', brush);
  set({ brush });
}

export function requestFit(): void {
  set((s) => ({ fitRequest: s.fitRequest + 1 }));
}

export function requestZoom(value: number): void {
  set((s) => ({ zoomRequest: { value, id: (s.zoomRequest?.id ?? 0) + 1 } }));
}

// ─── Exportar ──────────────────────────────────────────────────────────────

export function updateExport(patch: Partial<ExportSettings>): void {
  const s = get();
  const exportSettings: ExportSettings = { ...s.exportSettings, ...patch };
  if (!('presetId' in patch) && !('fileName' in patch)) exportSettings.presetId = 'custom';
  const { fileName: _ignored, ...persist } = exportSettings;
  void _ignored;
  savePref('exportSettings', persist);
  set({ exportSettings });
}

export function applyPreset(id: PresetId): void {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  const patch: Partial<ExportSettings> = { ...preset.patch, presetId: id };
  const doc = get().doc;
  if (id === 'print' && doc) {
    // Ancho inicial: el que da la imagen a 300 DPI sin agrandar ni achicar.
    const bounds = contentBounds(doc.mask, doc.width, doc.height) ?? { width: doc.width, height: doc.height };
    patch.printWidthCm = naturalPrintCm(bounds.width, 300);
  }
  updateExport(patch);
}

/** Clave que identifica el resultado: si cambia algo, hay que preparar de nuevo. */
export function exportKey(state: AppState): string {
  if (!state.doc) return '';
  return JSON.stringify([
    state.doc.id,
    state.doc.maskVersion,
    state.refine,
    { ...state.exportSettings, fileName: undefined },
    effectiveTier(state),
  ]);
}

async function rgbaToObjectUrl(rgba: Uint8ClampedArray, width: number, height: number): Promise<string> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return URL.createObjectURL(blob);
}

function extractAlpha(rgba: Uint8ClampedArray): Uint8Array {
  const alpha = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

function historySteps(state: AppState): string[] {
  return state.history
    .slice(1, state.historyIndex + 1)
    .map((entry) => (entry.detail ? `${entry.label} (${entry.detail})` : entry.label));
}

export async function prepareExport(): Promise<PreparedExport | null> {
  const s = get();
  const doc = s.doc;
  if (!doc) return null;
  const settings = s.exportSettings;
  const key = exportKey(s);
  const tier = effectiveTier(s);
  const profile = TIERS[tier];

  setBusy({ label: 'Preparando la exportación', progress: null });
  try {
    const imaging = getImaging();
    const mask = doc.mask.slice();
    const prep = await imaging.call(
      'prepareExport',
      { mask, halo: { enabled: s.refine.haloEnabled, strength: s.refine.haloStrength / 100 }, trim: settings.trim },
      { transfer: [mask.buffer] },
    );
    const plan = planExport({ width: prep.width, height: prep.height }, settings);
    const background = settings.background === 'color' || settings.format === 'jpg' ? hexToRgb(settings.backgroundColor) : null;
    const steps = historySteps(s);
    const reportBase = {
      appName: APP_NAME,
      appVersion: APP_VERSION,
      sourceName: doc.name,
      sourceSize: doc.originalSize,
      finalSize: plan.target,
      dpi: settings.dpi,
      steps,
      trimmed: settings.trim,
      padding: Math.round(plan.padding * (plan.target.width / plan.canvas.width)),
      background: background ? settings.backgroundColor.toUpperCase() : null,
      tierLabel: profile.name,
      date: new Date(),
    };

    let rgba = prep.rgba;
    let width = prep.width;
    let height = prep.height;
    let alpha: { data: Uint8Array; width: number; height: number } | undefined;
    let aiNote: string | null = null;

    if (plan.upscaling && settings.upscale === 'ai') {
      const inputMP = (prep.width * prep.height) / 1e6;
      if (profile.aiUpscaleMaxMP === 0) {
        aiNote = 'Agrandar con IA no está disponible en nivel Bajo: se usó el método de alta calidad.';
      } else if (inputMP > profile.aiUpscaleMaxMP) {
        aiNote = `Para agrandar con IA, el nivel ${profile.name} admite hasta ${profile.aiUpscaleMaxMP} MP: se usó el método de alta calidad.`;
      } else {
        try {
          const ai = await getAi();
          const passes = plan.scale > 2.05 && inputMP * 4 <= profile.aiUpscaleMaxMP ? 2 : 1;
          let current = { data: prep.rgba.slice(), width: prep.width, height: prep.height };
          for (let pass = 0; pass < passes; pass++) {
            const label = passes > 1 ? `Agrandando con IA (pasada ${pass + 1} de ${passes})` : 'Agrandando con IA';
            current = await ai.call(
              'upscale',
              { device: 'webgpu', image: current },
              { onProgress: aiProgressToBusy(label), transfer: [current.data.buffer] },
            );
          }
          alpha = { data: extractAlpha(prep.rgba), width: prep.width, height: prep.height };
          rgba = current.data;
          width = current.width;
          height = current.height;
          steps.push(`Agrandar con IA (Swin2SR ×${passes === 2 ? 4 : 2})`);
        } catch (error) {
          resetAi();
          aiNote = `No se pudo agrandar con IA (${errorMessage(error)}); se usó el método de alta calidad.`;
        }
      }
    }
    if (plan.upscaling && !alpha) steps.push('Agrandar con alta calidad (Lanczos)');

    const embedded =
      settings.embedReport && settings.format === 'png'
        ? { software: `${APP_NAME} ${APP_VERSION}`, description: buildReport({ ...reportBase, formatLabel: 'PNG', steps }) }
        : null;

    setBusy({ label: 'Creando el archivo', progress: null });
    const transfer: Transferable[] = [rgba.buffer];
    if (alpha) transfer.push(alpha.data.buffer);
    const result = await imaging.call(
      'finishExport',
      {
        rgba,
        width,
        height,
        alpha,
        content: { width: prep.width, height: prep.height },
        canvas: plan.canvas,
        target: plan.target,
        padding: plan.padding,
        square: settings.square,
        background,
        pngAuto: settings.format === 'png' && settings.pngMode === 'auto',
        encode: {
          format: settings.format,
          pngMode: settings.pngMode === 'png8' ? 'png8' : 'png24',
          colors: settings.colors,
          dither: settings.dither,
          optimize: settings.optimize,
          quality: settings.quality,
          dpi: settings.dpi,
          text: embedded,
        },
      },
      { transfer },
    );

    const fileName = safeFileName(settings.fileName, result.extension);
    const label = formatLabel(
      settings.format,
      result.pngMode,
      result.paletteColors,
      result.exactPalette,
      result.optimized,
      settings.quality,
    );
    const report = buildReport({
      ...reportBase,
      fileName,
      finalSize: { width: result.width, height: result.height },
      formatLabel: label,
      bytes: result.bytes.length,
      steps,
    });
    const previewUrl = await rgbaToObjectUrl(result.preview.rgba, result.preview.width, result.preview.height);
    const old = get().prepared;
    if (old) URL.revokeObjectURL(old.previewUrl);

    const prepared: PreparedExport = {
      bytes: result.bytes,
      mime: result.mime,
      extension: result.extension,
      fileName,
      width: result.width,
      height: result.height,
      dpi: settings.dpi,
      paletteColors: result.paletteColors,
      exactPalette: result.exactPalette,
      optimized: result.optimized,
      pngMode: result.pngMode,
      warning: [aiNote, result.warning].filter(Boolean).join(' ') || null,
      analysisReason: result.analysis?.reason ?? null,
      previewUrl,
      report,
      key,
    };
    set({ prepared });
    return prepared;
  } catch (error) {
    notify('error', 'No se pudo exportar', errorMessage(error));
    return null;
  } finally {
    setBusy(null);
  }
}

export async function saveExport(): Promise<void> {
  let prepared = get().prepared;
  if (!prepared || prepared.key !== exportKey(get())) prepared = await prepareExport();
  if (!prepared) return;
  const fileName = safeFileName(get().exportSettings.fileName, prepared.extension);
  const outcome = await saveFile(prepared.bytes, fileName, prepared.mime);
  if (outcome === 'saved') notify('success', 'Archivo guardado', `${fileName}, ${formatBytes(prepared.bytes.length)}.`);
  else if (outcome === 'downloaded') notify('success', 'Archivo descargado', `${fileName}, ${formatBytes(prepared.bytes.length)}. Está en tu carpeta de descargas.`);
}

export async function saveReport(): Promise<void> {
  const prepared = get().prepared;
  if (!prepared) return;
  const name = prepared.fileName.replace(/\.[^.]+$/, '') + '-ficha.txt';
  const outcome = await saveFile(new TextEncoder().encode(prepared.report), name, 'text/plain');
  if (outcome !== 'cancelled') notify('success', 'Ficha guardada', name);
}
