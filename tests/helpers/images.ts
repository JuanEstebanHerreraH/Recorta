// Imágenes sintéticas para las pruebas.

/** Círculo de color sobre un fondo de otro color (opaco). */
export function circleImage(
  width: number,
  height: number,
  fg: [number, number, number],
  bg: [number, number, number],
  radius: number,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < radius * radius;
      const c = inside ? fg : bg;
      const i = (y * width + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

/** Máscara exacta del círculo (con borde suave de 1 px por cobertura). */
export function circleMask(width: number, height: number, radius: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.min(1, Math.max(0, radius - d + 0.5));
      mask[y * width + x] = Math.round(a * 255);
    }
  }
  return mask;
}

export function meanAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Degradé horizontal (muchos colores, transiciones suaves). */
export function gradientImage(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = Math.round((x / (width - 1)) * 255);
      rgba[i + 1] = Math.round((y / (height - 1)) * 255);
      rgba[i + 2] = 128;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}
