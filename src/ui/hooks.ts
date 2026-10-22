import { useEffect, useMemo, useState } from 'react';
import type { ImageAnalysis } from '../imaging/analyze';
import { getImaging } from '../imaging/client';
import { contentBounds } from '../imaging/geometry';
import { useStore } from '../state/store';

/** Tamaño del contenido visible (sin bordes vacíos si `trim`). */
export function useContentSize(trim: boolean): { width: number; height: number } | null {
  const doc = useStore((s) => s.doc);
  const version = doc?.maskVersion;
  return useMemo(() => {
    if (!doc) return null;
    if (!trim) return { width: doc.width, height: doc.height };
    const bounds = contentBounds(doc.mask, doc.width, doc.height);
    return bounds ? { width: bounds.width, height: bounds.height } : { width: doc.width, height: doc.height };
    // La máscara se modifica en el lugar: `version` avisa cuándo recalcular.
  }, [doc?.id, version, trim]);
}

/** Miniatura del recorte actual (muestreo rápido, sin interpolar). */
export function useDocThumbnail(maxSide = 360): string | null {
  const doc = useStore((s) => s.doc);
  const version = doc?.maskVersion;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let created: string | null = null;
    const timer = setTimeout(async () => {
      const bounds = contentBounds(doc.mask, doc.width, doc.height) ?? {
        x: 0,
        y: 0,
        width: doc.width,
        height: doc.height,
      };
      const scale = Math.min(1, maxSide / Math.max(bounds.width, bounds.height));
      const w = Math.max(1, Math.round(bounds.width * scale));
      const h = Math.max(1, Math.round(bounds.height * scale));
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        const sy = Math.min(doc.height - 1, bounds.y + Math.floor(y / scale));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(doc.width - 1, bounds.x + Math.floor(x / scale));
          const s = sy * doc.width + sx;
          const t = (y * w + x) * 4;
          data[t] = doc.original[s * 4];
          data[t + 1] = doc.original[s * 4 + 1];
          data[t + 2] = doc.original[s * 4 + 2];
          data[t + 3] = doc.mask[s];
        }
      }
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')?.putImageData(new ImageData(data, w, h), 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      if (cancelled) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (created) URL.revokeObjectURL(created);
    };
    // Igual que arriba: se recalcula cuando cambia la imagen o su versión de máscara.
  }, [doc?.id, version, maxSide]);

  return url;
}

/** Recomendación de formato (PNG-24 o PNG-8) calculada en segundo plano. */
export function useAnalysis(trim: boolean): ImageAnalysis | null {
  const doc = useStore((s) => s.doc);
  const version = doc?.maskVersion;
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const mask = doc.mask.slice();
      getImaging()
        .call('analyze', { mask, trim }, { transfer: [mask.buffer] })
        .then((result) => {
          if (!cancelled) setAnalysis(result);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Igual que arriba: se recalcula cuando cambia la imagen o su versión de máscara.
  }, [doc?.id, version, trim]);

  return analysis;
}
