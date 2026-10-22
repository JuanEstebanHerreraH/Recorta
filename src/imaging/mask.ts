// Operaciones sobre la máscara (canal de transparencia, 0 = transparente, 255 = opaco).
import { gaussianBlur, maskToPlane, planeToMask, rankFilter } from './filters';

/** Suaviza el borde: desenfoque gaussiano de la máscara. */
export function featherMask(mask: Uint8Array, width: number, height: number, radiusPx: number): Uint8Array {
  if (radiusPx <= 0) return mask.slice();
  return planeToMask(gaussianBlur(maskToPlane(mask), width, height, radiusPx / 2));
}

/**
 * Desplaza el borde hacia afuera (px > 0, agranda el recorte) o hacia adentro (px < 0).
 * Conserva la transparencia suave del borde original y redondea las esquinas.
 */
export function shiftEdge(mask: Uint8Array, width: number, height: number, px: number): Uint8Array {
  const r = Math.round(Math.abs(px));
  if (r === 0) return mask.slice();
  const moved = rankFilter(maskToPlane(mask), width, height, r, px > 0 ? 'max' : 'min');
  const soften = Math.min(3, r / 4);
  return planeToMask(soften > 0.3 ? gaussianBlur(moved, width, height, soften) : moved);
}

/**
 * Endurece el borde: aumenta el contraste de la transparencia.
 * amount 0 = sin cambio, 1 = borde totalmente duro.
 */
export function hardenMask(mask: Uint8Array, amount: number): Uint8Array {
  const a = Math.min(Math.max(amount, 0), 0.98);
  if (a === 0) return mask.slice();
  const low = 127.5 * a;
  const high = 255 - 127.5 * a;
  const out = new Uint8Array(mask.length);
  const scale = 255 / (high - low);
  for (let i = 0; i < mask.length; i++) {
    const v = (mask[i] - low) * scale;
    out[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }
  return out;
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = 255 - mask[i];
  return out;
}

/** Combina una selección (0..255) con la máscara actual. */
export function combineMasks(
  current: Uint8Array,
  selection: Uint8Array,
  mode: 'keep-only' | 'remove' | 'add',
): Uint8Array {
  const out = new Uint8Array(current.length);
  for (let i = 0; i < current.length; i++) {
    const s = selection[i];
    const c = current[i];
    if (mode === 'keep-only') out[i] = Math.min(c, s);
    else if (mode === 'remove') out[i] = Math.round((c * (255 - s)) / 255);
    else out[i] = Math.max(c, s);
  }
  return out;
}

/** Cuenta píxeles visibles, transparentes y de borde (semitransparentes). */
export function maskStats(mask: Uint8Array): { opaque: number; transparent: number; partial: number } {
  let opaque = 0;
  let transparent = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 255) opaque++;
    else if (mask[i] === 0) transparent++;
  }
  return { opaque, transparent, partial: mask.length - opaque - transparent };
}
