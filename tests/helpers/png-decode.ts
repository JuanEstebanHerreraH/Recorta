// Decodificador PNG mínimo, solo para las pruebas (8 bits; RGB, RGBA y paleta).
import { unzlibSync } from 'fflate';
import { readChunks } from '../../src/imaging/png';

export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray } {
  const chunks = readChunks(png);
  const header = chunks.find((c) => c.type === 'IHDR');
  if (!header) throw new Error('Sin IHDR');
  const view = new DataView(header.data.buffer, header.data.byteOffset, 13);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  const depth = header.data[8];
  const colorType = header.data[9];
  if (depth !== 8) throw new Error(`Profundidad no soportada en pruebas: ${depth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`Tipo de color no soportado: ${colorType}`);

  const idat = chunks.filter((c) => c.type === 'IDAT');
  const total = idat.reduce((sum, c) => sum + c.data.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of idat) {
    joined.set(c.data, offset);
    offset += c.data.length;
  }
  const raw = unzlibSync(joined);
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  if (colorType === 3) {
    const plte = chunks.find((c) => c.type === 'PLTE')!.data;
    const trns = chunks.find((c) => c.type === 'tRNS')?.data;
    for (let i = 0; i < width * height; i++) {
      const k = pixels[i];
      rgba[i * 4] = plte[k * 3];
      rgba[i * 4 + 1] = plte[k * 3 + 1];
      rgba[i * 4 + 2] = plte[k * 3 + 2];
      rgba[i * 4 + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  } else {
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = pixels[i * channels + (channels >= 3 ? c : 0)];
      rgba[i * 4 + 3] = channels === 4 ? pixels[i * 4 + 3] : 255;
    }
  }
  return { width, height, rgba };
}
