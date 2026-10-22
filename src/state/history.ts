// Historial (trazabilidad): cada cambio de la máscara queda como un paso con nombre.
// Las copias de la máscara se guardan comprimidas para ocupar poca memoria.
import { deflateSync, inflateSync } from 'fflate';

export interface RefineState {
  haloEnabled: boolean;
  haloStrength: number;
}

export interface HistoryEntry {
  id: number;
  label: string;
  detail?: string;
  time: number;
  snapshot: Uint8Array;
  refine: RefineState;
}

let nextId = 1;

export function makeEntry(label: string, mask: Uint8Array, refine: RefineState, detail?: string): HistoryEntry {
  return {
    id: nextId++,
    label,
    detail,
    time: Date.now(),
    snapshot: deflateSync(mask, { level: 1 }),
    refine: { ...refine },
  };
}

export function restoreSnapshot(entry: HistoryEntry, length: number): Uint8Array {
  return inflateSync(entry.snapshot, { out: new Uint8Array(length) });
}

/** Agrega un paso: descarta los pasos "rehacer" y respeta el límite de memoria. */
export function pushEntry(
  entries: HistoryEntry[],
  index: number,
  entry: HistoryEntry,
  limit: number,
): { entries: HistoryEntry[]; index: number } {
  const kept = entries.slice(0, index + 1);
  kept.push(entry);
  const overflow = Math.max(0, kept.length - limit);
  const trimmed = overflow > 0 ? kept.slice(overflow) : kept;
  return { entries: trimmed, index: trimmed.length - 1 };
}

export function historyBytes(entries: HistoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.snapshot.length, 0);
}
