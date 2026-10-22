// Pincel sobre la máscara. Cada trazo guarda cuánto cubrió en cada píxel, así pasar dos
// veces por el mismo lugar dentro de un trazo no acumula (como en Photoshop).

export interface BrushStamp {
  radius: number;
  /** 0..1: 1 = borde duro. */
  hardness: number;
  /** 0..1 */
  opacity: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class StrokeBuffer {
  readonly width: number;
  readonly height: number;
  private coverage: Uint8Array;
  private base: Uint8Array | null = null;
  private touched: Rect | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.coverage = new Uint8Array(width * height);
  }

  begin(mask: Uint8Array): void {
    this.base = mask.slice();
    this.touched = null;
  }

  get active(): boolean {
    return this.base !== null;
  }

  /** Aplica un sello circular. Devuelve la zona modificada (o null si quedó fuera). */
  stamp(mask: Uint8Array, cx: number, cy: number, brush: BrushStamp, erase: boolean): Rect | null {
    const base = this.base;
    if (!base) return null;
    const r = Math.max(0.5, brush.radius);
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r + 1));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r + 1));
    if (x0 > x1 || y0 > y1) return null;

    const hard = brush.hardness >= 0.99;
    const inner = r * Math.min(brush.hardness, 0.99);
    const span = Math.max(0.5, r - inner);
    const opacity = Math.min(1, Math.max(0, brush.opacity));
    const width = this.width;
    const coverage = this.coverage;

    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const d = Math.sqrt(dx * dx + dy * dy);
        let a: number;
        if (hard) {
          a = r - d + 0.5;
          if (a <= 0) continue;
          if (a > 1) a = 1;
        } else {
          if (d >= r) continue;
          if (d <= inner) a = 1;
          else {
            const t = (d - inner) / span;
            a = 1 - t * t * (3 - 2 * t);
          }
        }
        const cov = Math.round(a * opacity * 255);
        const i = row + x;
        if (cov <= coverage[i]) continue;
        coverage[i] = cov;
        const b = base[i];
        mask[i] = erase ? Math.round((b * (255 - cov)) / 255) : b + Math.round(((255 - b) * cov) / 255);
      }
    }

    const rect = { x0, y0, x1, y1 };
    this.touched = this.touched
      ? {
          x0: Math.min(this.touched.x0, x0),
          y0: Math.min(this.touched.y0, y0),
          x1: Math.max(this.touched.x1, x1),
          y1: Math.max(this.touched.y1, y1),
        }
      : rect;
    return rect;
  }

  /** Termina el trazo. Devuelve si hubo cambios. */
  end(): boolean {
    const touched = this.touched;
    if (touched) {
      for (let y = touched.y0; y <= touched.y1; y++) {
        this.coverage.fill(0, y * this.width + touched.x0, y * this.width + touched.x1 + 1);
      }
    }
    this.base = null;
    this.touched = null;
    return touched !== null;
  }
}

/** Puntos intermedios entre dos posiciones para que el trazo no quede punteado. */
export function interpolate(
  from: { x: number; y: number },
  to: { x: number; y: number },
  spacing: number,
): Array<{ x: number; y: number }> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < spacing) return [];
  const steps = Math.floor(distance / spacing);
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= steps; i++) {
    const t = (i * spacing) / distance;
    points.push({ x: from.x + dx * t, y: from.y + dy * t });
  }
  return points;
}
