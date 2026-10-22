// Lectura y escritura del DPI en archivos JPEG (cabecera JFIF / APP0).

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function findJfif(bytes: Uint8Array): number {
  // El APP0 JFIF va justo después del marcador SOI (FF D8).
  if (bytes[2] === 0xff && bytes[3] === 0xe0) {
    const id = String.fromCharCode(bytes[6], bytes[7], bytes[8], bytes[9]);
    if (id === 'JFIF' && bytes[10] === 0) return 2;
  }
  return -1;
}

/** Escribe el DPI en un JPEG. Si no tiene cabecera JFIF, la agrega. */
export function setJpegDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  if (!isJpeg(jpeg)) throw new Error('El archivo no es un JPEG válido.');
  const value = Math.max(1, Math.min(65535, Math.round(dpi)));
  const at = findJfif(jpeg);
  if (at >= 0) {
    // Desde el marcador: FF E0, largo (2), "JFIF\0" (5), versión (2), unidades (1), X (2), Y (2).
    const out = jpeg.slice();
    out[at + 11] = 1; // unidades: puntos por pulgada
    out[at + 12] = value >> 8;
    out[at + 13] = value & 0xff;
    out[at + 14] = value >> 8;
    out[at + 15] = value & 0xff;
    return out;
  }
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
    value >> 8, value & 0xff, value >> 8, value & 0xff, 0x00, 0x00,
  ]);
  const out = new Uint8Array(jpeg.length + app0.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(jpeg.subarray(2), 2 + app0.length);
  return out;
}

/** Lee el DPI de la cabecera JFIF. Devuelve null si no hay dato útil. */
export function readJpegDpi(jpeg: Uint8Array): number | null {
  if (!isJpeg(jpeg)) return null;
  const at = findJfif(jpeg);
  if (at < 0) return null;
  const units = jpeg[at + 11];
  const x = (jpeg[at + 12] << 8) | jpeg[at + 13];
  if (!x) return null;
  if (units === 1) return x;
  if (units === 2) return Math.round(x * 2.54);
  return null;
}
