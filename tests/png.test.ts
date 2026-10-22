import { describe, expect, it } from 'vitest';
import { setJpegDpi, readJpegDpi } from '../src/imaging/jpeg';
import {
  crc32,
  encodePngIndexed,
  encodePngRgb,
  encodePngRgba,
  readChunks,
  readPngDpi,
  readPngText,
  setPngMetadata,
} from '../src/imaging/png';
import { decodePng } from './helpers/png-decode';
import { circleImage, gradientImage } from './helpers/images';

describe('PNG', () => {
  it('calcula el CRC32 estándar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('codifica RGBA sin pérdida (ida y vuelta exacta)', () => {
    const w = 37;
    const h = 23;
    const rgba = gradientImage(w, h);
    for (let i = 3; i < rgba.length; i += 16) rgba[i] = (i * 7) % 256;
    const png = encodePngRgba(rgba, w, h);
    const decoded = decodePng(png);
    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(Array.from(decoded.rgba)).toEqual(Array.from(rgba));
  });

  it('codifica RGB opaco sin pérdida', () => {
    const rgba = circleImage(20, 16, [200, 30, 40], [250, 250, 250], 6);
    const decoded = decodePng(encodePngRgb(rgba, 20, 16));
    expect(Array.from(decoded.rgba)).toEqual(Array.from(rgba));
  });

  it('codifica paleta con transparencia (tRNS)', () => {
    const palette = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 128]);
    const indices = new Uint8Array([0, 1, 2, 1, 0, 2]);
    const decoded = decodePng(encodePngIndexed(indices, palette, 3, 2));
    expect(Array.from(decoded.rgba.subarray(0, 12))).toEqual([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 128]);
    expect(readChunks(encodePngIndexed(indices, palette, 3, 2)).map((c) => c.type)).toContain('tRNS');
  });

  it('escribe y lee DPI y textos con acentos sin tocar los píxeles', () => {
    const rgba = circleImage(10, 10, [10, 200, 90], [255, 255, 255], 3);
    const plain = encodePngRgba(rgba, 10, 10);
    const tagged = setPngMetadata(plain, {
      dpi: 300,
      srgb: true,
      text: { Software: 'Recorta 1.0.0' },
      intlText: { Description: 'Ficha: tamaño 10 × 10 px, impresión a 300 DPI' },
    });
    expect(readPngDpi(tagged)).toBe(300);
    expect(readPngText(tagged)).toEqual({
      Software: 'Recorta 1.0.0',
      Description: 'Ficha: tamaño 10 × 10 px, impresión a 300 DPI',
    });
    const types = readChunks(tagged).map((c) => c.type);
    expect(types.indexOf('pHYs')).toBeLessThan(types.indexOf('IDAT'));
    expect(types.indexOf('sRGB')).toBeLessThan(types.indexOf('IDAT'));
    expect(Array.from(decodePng(tagged).rgba)).toEqual(Array.from(rgba));

    // Volver a etiquetar reemplaza, no duplica.
    const again = setPngMetadata(tagged, { dpi: 72 });
    expect(readPngDpi(again)).toBe(72);
    expect(readChunks(again).filter((c) => c.type === 'pHYs')).toHaveLength(1);
  });
});

describe('JPEG', () => {
  it('escribe el DPI en la cabecera JFIF existente', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
      0x00, 0x00, 0xff, 0xd9,
    ]);
    const out = setJpegDpi(jpeg, 300);
    expect(readJpegDpi(out)).toBe(300);
    expect(out.length).toBe(jpeg.length);
  });

  it('agrega la cabecera JFIF si no la tiene', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
    const out = setJpegDpi(jpeg, 150);
    expect(readJpegDpi(out)).toBe(150);
    expect(out.length).toBe(jpeg.length + 18);
  });
});
