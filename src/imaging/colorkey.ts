// "Quitar un color de fondo" sin IA: ideal para logos o productos sobre fondo liso.
// Elimina los píxeles parecidos a un color de referencia, ya sea en toda la imagen o
// solo en las zonas conectadas al punto elegido (o a los bordes de la imagen).

export interface ColorKeyOptions {
  /** Color de referencia. Si falta, se toma del punto elegido o del borde. */
  color?: [number, number, number];
  /** Puntos de inicio en píxeles de la imagen. 'borders' = todo el contorno. */
  seeds: Array<[number, number]> | 'borders';
  /** 0..100: cuánto puede diferir un color del de referencia. */
  tolerance: number;
  /** 0..100: ancho de la transición suave del borde. */
  softness: number;
  /** true = solo zonas conectadas; false = ese color en toda la imagen. */
  contiguous: boolean;
}

const MAX_DISTANCE = 765;

/** Distancia de color "redmean": barata y más cercana a la percepción que la euclidiana. */
export function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

/** Color más frecuente del contorno de la imagen (agrupado en pasos de 8). */
export function dominantBorderColor(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const j = (y * width + x) * 4;
    if (rgba[j + 3] < 128) return;
    const key = ((rgba[j] >> 3) << 10) | ((rgba[j + 1] >> 3) << 5) | (rgba[j + 2] >> 3);
    const entry = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    entry.n++;
    entry.r += rgba[j];
    entry.g += rgba[j + 1];
    entry.b += rgba[j + 2];
    counts.set(key, entry);
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }
  let best = { n: 0, r: 255, g: 255, b: 255 };
  for (const entry of counts.values()) if (entry.n > best.n) best = entry;
  if (best.n === 0) return [255, 255, 255];
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
}

/** Color promedio de 3×3 píxeles alrededor de un punto. */
export function sampleColor(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(width - 1, Math.max(0, Math.round(x) + dx));
      const yy = Math.min(height - 1, Math.max(0, Math.round(y) + dy));
      const j = (yy * width + xx) * 4;
      r += rgba[j];
      g += rgba[j + 1];
      b += rgba[j + 2];
      n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

export function colorKey(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  options: ColorKeyOptions,
): Uint8Array {
  const pixels = width * height;
  const out = mask.slice();
  const reference =
    options.color ??
    (options.seeds === 'borders'
      ? dominantBorderColor(rgba, width, height)
      : options.seeds.length > 0
        ? sampleColor(rgba, width, height, options.seeds[0][0], options.seeds[0][1])
        : [255, 255, 255]);
  const [kr, kg, kb] = reference;

  const core = (options.tolerance / 100) * 0.35 * MAX_DISTANCE;
  const band = Math.max(1, (options.softness / 100) * 0.15 * MAX_DISTANCE);

  // Factor de opacidad que deja el color: 0 = se borra del todo, 1 = no se toca.
  const factorAt = (i: number): number => {
    const j = i * 4;
    const d = colorDistance(rgba[j], rgba[j + 1], rgba[j + 2], kr, kg, kb);
    if (d <= core) return 0;
    if (d >= core + band) return 1;
    return (d - core) / band;
  };

  const apply = (i: number, factor: number) => {
    if (factor < 1) out[i] = Math.round(out[i] * factor);
  };

  if (!options.contiguous) {
    for (let i = 0; i < pixels; i++) apply(i, factorAt(i));
    return out;
  }

  // Relleno por inundación desde las semillas: se propaga por los píxeles "núcleo"
  // (iguales al color) y suaviza los de la franja de transición sin cruzarla.
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    const factor = factorAt(i);
    if (factor >= 1) return;
    apply(i, factor);
    if (factor === 0) queue[tail++] = i;
  };

  if (options.seeds === 'borders') {
    for (let x = 0; x < width; x++) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width);
      push(y * width + width - 1);
    }
  } else {
    for (const [sx, sy] of options.seeds) {
      const x = Math.min(width - 1, Math.max(0, Math.round(sx)));
      const y = Math.min(height - 1, Math.max(0, Math.round(sy)));
      const i = y * width + x;
      // La semilla siempre arranca, aunque el color exacto difiera un poco.
      visited[i] = 1;
      out[i] = 0;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < pixels - width) push(i + width);
  }
  return out;
}
