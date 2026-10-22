// Motor del lienzo: dibuja la imagen, el fondo de control y el cursor; maneja zoom,
// desplazamiento y pinceles. Trabaja fuera de React para que pintar sea fluido.
import type { BrushSettings, DocState, SamPoint, Tool, ViewBackground, ViewMode } from '../state/store';
import { StrokeBuffer, interpolate, type Rect } from './brush';

export interface EngineCallbacks {
  /** Al terminar un trazo: registra el paso y devuelve la nueva versión de la máscara. */
  onStrokeEnd: (kind: 'erase' | 'restore') => number;
  onZoomChange: (zoom: number) => void;
  onPick: (x: number, y: number) => void;
  onSamPoint: (x: number, y: number, positive: boolean) => void;
}

export interface EngineTheme {
  workspace: string;
  outline: string;
  checkerA: string;
  checkerB: string;
}

const RUBY: [number, number, number] = [229, 83, 61];
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;

export class EditorEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly callbacks: EngineCallbacks;
  private doc: DocState;
  private readonly display: OffscreenCanvas;
  private readonly displayCtx: OffscreenCanvasRenderingContext2D;
  private readonly original: OffscreenCanvas;
  private readonly stroke: StrokeBuffer;
  private colorSource: Uint8ClampedArray | null = null;
  private renderedVersion = -1;

  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private zoom = 1;
  private panX = 0;
  private panY = 0;

  private tool: Tool = 'erase';
  private brush: BrushSettings = { size: 60, hardness: 70, opacity: 100, pressure: true };
  private background: ViewBackground = 'checker';
  private backgroundColor = '#3f9b73';
  private mode: ViewMode = 'result';
  private theme: EngineTheme = { workspace: '#34373b', outline: 'rgba(255,255,255,0.18)', checkerA: '#d9d9d9', checkerB: '#ffffff' };
  private checker: CanvasPattern | null = null;

  private samCanvas: OffscreenCanvas | null = null;
  private samPoints: SamPoint[] = [];

  private pointer: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
  private panning: { pointerId: number; startX: number; startY: number; panX: number; panY: number } | null = null;
  private strokeState: { pointerId: number; erase: boolean; last: { x: number; y: number } } | null = null;
  private spaceDown = false;
  private altDown = false;
  private frame = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, doc: DocState, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no pudo crear el lienzo.');
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.doc = doc;

    this.display = new OffscreenCanvas(doc.width, doc.height);
    const displayCtx = this.display.getContext('2d');
    if (!displayCtx) throw new Error('El navegador no pudo crear el lienzo.');
    this.displayCtx = displayCtx;

    this.original = new OffscreenCanvas(doc.width, doc.height);
    const originalCtx = this.original.getContext('2d');
    originalCtx?.putImageData(new ImageData(this.opaqueCopy(doc.original), doc.width, doc.height), 0, 0);

    this.stroke = new StrokeBuffer(doc.width, doc.height);
    this.refreshAll();

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  // ─── Estado que llega desde React ──────────────────────────────────────

  /** Se llama cuando la máscara cambió fuera del pincel (IA, historial, bordes). */
  syncDoc(doc: DocState): void {
    this.doc = doc;
    if (doc.maskVersion !== this.renderedVersion && !this.stroke.active) this.refreshAll();
  }

  setColorSource(fg: Uint8ClampedArray | null): void {
    if (fg === this.colorSource) return;
    this.colorSource = fg && fg.length === this.doc.original.length ? fg : null;
    this.refreshAll();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.updateCursor();
    this.requestDraw();
  }

  setBrush(brush: BrushSettings): void {
    this.brush = brush;
    this.requestDraw();
  }

  setView(background: ViewBackground, color: string, mode: ViewMode): void {
    const modeChanged = mode !== this.mode;
    this.background = background;
    this.backgroundColor = color;
    this.mode = mode;
    if (modeChanged) this.refreshAll();
    else this.requestDraw();
  }

  setTheme(theme: EngineTheme): void {
    this.theme = theme;
    this.checker = null;
    this.requestDraw();
  }

  setSam(preview: { mask: Uint8Array; width: number; height: number } | null, points: SamPoint[]): void {
    this.samPoints = points;
    if (!preview) {
      this.samCanvas = null;
    } else {
      const canvas = new OffscreenCanvas(preview.width, preview.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const data = new Uint8ClampedArray(preview.width * preview.height * 4);
        for (let i = 0; i < preview.mask.length; i++) {
          if (!preview.mask[i]) continue;
          data[i * 4] = 61;
          data[i * 4 + 1] = 123;
          data[i * 4 + 2] = 253;
          data[i * 4 + 3] = 115;
        }
        ctx.putImageData(new ImageData(data, preview.width, preview.height), 0, 0);
      }
      this.samCanvas = canvas;
    }
    this.requestDraw();
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.requestDraw();
  }

  fit(): void {
    const margin = 32;
    const z = Math.min(
      (this.cssWidth - margin * 2) / this.doc.width,
      (this.cssHeight - margin * 2) / this.doc.height,
      4,
    );
    this.setZoom(Math.max(MIN_ZOOM, z), this.cssWidth / 2, this.cssHeight / 2, true);
  }

  zoomTo(value: number): void {
    this.setZoom(value, this.cssWidth / 2, this.cssHeight / 2, false);
  }

  // ─── Píxeles ───────────────────────────────────────────────────────────

  private opaqueCopy(rgba: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
    const copy = new Uint8ClampedArray(rgba.length);
    copy.set(rgba);
    for (let i = 3; i < copy.length; i += 4) copy[i] = 255;
    return copy;
  }

  private refreshAll(): void {
    this.updateRegion({ x0: 0, y0: 0, x1: this.doc.width - 1, y1: this.doc.height - 1 });
    this.renderedVersion = this.doc.maskVersion;
    this.requestDraw();
  }

  /** Recalcula los píxeles visibles de una zona según el modo de vista. */
  private updateRegion(rect: Rect): void {
    const { width } = this.doc;
    const w = rect.x1 - rect.x0 + 1;
    const h = rect.y1 - rect.y0 + 1;
    if (w <= 0 || h <= 0) return;
    const out = new Uint8ClampedArray(w * h * 4);
    const color = this.colorSource ?? this.doc.original;
    const original = this.doc.original;
    const mask = this.doc.mask;
    const overlay = this.mode === 'mask';

    for (let y = 0; y < h; y++) {
      let src = (rect.y0 + y) * width + rect.x0;
      let o = y * w * 4;
      for (let x = 0; x < w; x++, src++, o += 4) {
        const m = mask[src];
        const j = src * 4;
        if (overlay) {
          const k = ((255 - m) / 255) * 0.62;
          out[o] = original[j] + (RUBY[0] - original[j]) * k;
          out[o + 1] = original[j + 1] + (RUBY[1] - original[j + 1]) * k;
          out[o + 2] = original[j + 2] + (RUBY[2] - original[j + 2]) * k;
          out[o + 3] = 255;
        } else {
          out[o] = color[j];
          out[o + 1] = color[j + 1];
          out[o + 2] = color[j + 2];
          out[o + 3] = m;
        }
      }
    }
    this.displayCtx.putImageData(new ImageData(out, w, h), rect.x0, rect.y0);
  }

  // ─── Dibujo ────────────────────────────────────────────────────────────

  private requestDraw(): void {
    if (this.frame || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private checkerPattern(): CanvasPattern | null {
    if (this.checker) return this.checker;
    const size = 10;
    const tile = new OffscreenCanvas(size * 2, size * 2);
    const t = tile.getContext('2d');
    if (!t) return null;
    t.fillStyle = this.theme.checkerB;
    t.fillRect(0, 0, size * 2, size * 2);
    t.fillStyle = this.theme.checkerA;
    t.fillRect(0, 0, size, size);
    t.fillRect(size, size, size, size);
    this.checker = this.ctx.createPattern(tile, 'repeat');
    return this.checker;
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.workspace;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const x = this.panX;
    const y = this.panY;
    const w = this.doc.width * this.zoom;
    const h = this.doc.height * this.zoom;

    if (this.mode === 'result') {
      if (this.background === 'checker') {
        const pattern = this.checkerPattern();
        ctx.fillStyle = pattern ?? this.theme.checkerB;
      } else {
        ctx.fillStyle =
          this.background === 'black' ? '#000000' : this.background === 'white' ? '#ffffff' : this.backgroundColor;
      }
      ctx.fillRect(x, y, w, h);
    }

    ctx.imageSmoothingEnabled = this.zoom < 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.mode === 'original' ? this.original : this.display, x, y, w, h);

    if (this.samCanvas && this.tool === 'select') {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.samCanvas, x, y, w, h);
    }

    ctx.strokeStyle = this.theme.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(w) + 1, Math.round(h) + 1);

    if (this.tool === 'select') this.drawSamPoints(x, y, w, h);
    if (this.pointer.inside && (this.tool === 'erase' || this.tool === 'restore') && !this.isPanMode()) {
      this.drawBrushCursor();
    }
  }

  private drawSamPoints(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    for (const p of this.samPoints) {
      const px = x + p.x * w;
      const py = y + p.y * h;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fillStyle = p.positive ? '#2f7d5b' : '#c93b27';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 3.5, py);
      ctx.lineTo(px + 3.5, py);
      if (p.positive) {
        ctx.moveTo(px, py - 3.5);
        ctx.lineTo(px, py + 3.5);
      }
      ctx.stroke();
    }
  }

  private drawBrushCursor(): void {
    const ctx = this.ctx;
    const pressureless = (this.brush.size / 2) * this.zoom;
    const r = Math.max(1.5, pressureless);
    const { x, y } = this.pointer;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.stroke();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = this.effectiveErase() ? '#ff8a75' : '#8fe0b8';
    ctx.stroke();
    if (this.brush.hardness < 99 && r > 6) {
      ctx.beginPath();
      ctx.arc(x, y, r * (this.brush.hardness / 100), 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── Zoom y desplazamiento ─────────────────────────────────────────────

  private setZoom(value: number, anchorX: number, anchorY: number, center: boolean): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    if (center) {
      this.zoom = zoom;
      this.panX = (this.cssWidth - this.doc.width * zoom) / 2;
      this.panY = (this.cssHeight - this.doc.height * zoom) / 2;
    } else {
      const ix = (anchorX - this.panX) / this.zoom;
      const iy = (anchorY - this.panY) / this.zoom;
      this.zoom = zoom;
      this.panX = anchorX - ix * zoom;
      this.panY = anchorY - iy * zoom;
    }
    this.callbacks.onZoomChange(this.zoom);
    this.requestDraw();
  }

  private toImage(cssX: number, cssY: number): { x: number; y: number } {
    return { x: (cssX - this.panX) / this.zoom, y: (cssY - this.panY) / this.zoom };
  }

  private localPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private isPanMode(): boolean {
    return this.tool === 'pan' || this.spaceDown;
  }

  private effectiveErase(): boolean {
    const erase = this.tool === 'erase';
    return this.altDown ? !erase : erase;
  }

  private updateCursor(): void {
    let cursor = 'default';
    if (this.panning) cursor = 'grabbing';
    else if (this.isPanMode()) cursor = 'grab';
    else if (this.tool === 'erase' || this.tool === 'restore') cursor = 'none';
    else if (this.tool === 'select' || this.tool === 'picker') cursor = 'crosshair';
    this.canvas.style.cursor = cursor;
  }

  // ─── Eventos ───────────────────────────────────────────────────────────

  private onPointerDown = (event: PointerEvent): void => {
    const p = this.localPoint(event);
    this.pointer = { ...p, inside: true };

    if (event.button === 1 || (event.button === 0 && this.isPanMode())) {
      event.preventDefault();
      this.panning = { pointerId: event.pointerId, startX: p.x, startY: p.y, panX: this.panX, panY: this.panY };
      this.canvas.setPointerCapture(event.pointerId);
      this.updateCursor();
      return;
    }

    const img = this.toImage(p.x, p.y);
    const inside = img.x >= 0 && img.y >= 0 && img.x < this.doc.width && img.y < this.doc.height;

    if (this.tool === 'select') {
      if ((event.button === 0 || event.button === 2) && inside) {
        this.callbacks.onSamPoint(img.x, img.y, event.button === 0 && !event.altKey);
      }
      return;
    }
    if (this.tool === 'picker') {
      if (event.button === 0 && inside) this.callbacks.onPick(img.x, img.y);
      return;
    }
    if ((this.tool === 'erase' || this.tool === 'restore') && event.button === 0) {
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.stroke.begin(this.doc.mask);
      this.strokeState = { pointerId: event.pointerId, erase: this.effectiveErase(), last: img };
      this.applyStamps([img], event);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    const p = this.localPoint(event);
    this.pointer = { ...p, inside: true };

    if (this.panning && event.pointerId === this.panning.pointerId) {
      this.panX = this.panning.panX + (p.x - this.panning.startX);
      this.panY = this.panning.panY + (p.y - this.panning.startY);
      this.requestDraw();
      return;
    }

    if (this.strokeState && event.pointerId === this.strokeState.pointerId) {
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
      const points: Array<{ x: number; y: number }> = [];
      const radius = this.radiusFor(event);
      const spacing = Math.max(0.75, radius * 0.22);
      let last = this.strokeState.last;
      for (const e of events.length ? events : [event]) {
        const lp = this.localPoint(e);
        const target = this.toImage(lp.x, lp.y);
        const steps = interpolate(last, target, spacing);
        if (steps.length) {
          points.push(...steps);
          last = steps[steps.length - 1];
        }
      }
      this.strokeState.last = last;
      if (points.length) this.applyStamps(points, event);
      return;
    }
    this.requestDraw();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.panning && event.pointerId === this.panning.pointerId) {
      this.panning = null;
      this.updateCursor();
      return;
    }
    if (this.strokeState && event.pointerId === this.strokeState.pointerId) {
      const erase = this.strokeState.erase;
      this.strokeState = null;
      const changed = this.stroke.end();
      if (changed) this.renderedVersion = this.callbacks.onStrokeEnd(erase ? 'erase' : 'restore');
    }
  };

  private onPointerLeave = (): void => {
    this.pointer = { ...this.pointer, inside: false };
    this.requestDraw();
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const p = this.localPoint(event);
    const speed = event.ctrlKey ? 0.01 : 0.0015;
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    this.setZoom(this.zoom * Math.exp(-delta * speed), p.x, p.y, false);
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (event.code === 'Space' && !this.spaceDown) {
      this.spaceDown = true;
      event.preventDefault();
      this.updateCursor();
      this.requestDraw();
    }
    if (event.key === 'Alt' && !this.altDown) {
      this.altDown = true;
      this.requestDraw();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.spaceDown = false;
      this.updateCursor();
      this.requestDraw();
    }
    if (event.key === 'Alt') {
      this.altDown = false;
      this.requestDraw();
    }
  };

  private onBlur = (): void => {
    this.spaceDown = false;
    this.altDown = false;
    this.updateCursor();
  };

  private radiusFor(event: PointerEvent): number {
    const base = this.brush.size / 2;
    if (this.brush.pressure && event.pointerType === 'pen' && event.pressure > 0) {
      return Math.max(0.5, base * (0.25 + 0.75 * event.pressure));
    }
    return base;
  }

  private applyStamps(points: Array<{ x: number; y: number }>, event: PointerEvent): void {
    if (!this.strokeState) return;
    const brush = {
      radius: this.radiusFor(event),
      hardness: this.brush.hardness / 100,
      opacity: this.brush.opacity / 100,
    };
    let dirty: Rect | null = null;
    for (const p of points) {
      const rect = this.stroke.stamp(this.doc.mask, p.x, p.y, brush, this.strokeState.erase);
      if (!rect) continue;
      dirty = dirty
        ? { x0: Math.min(dirty.x0, rect.x0), y0: Math.min(dirty.y0, rect.y0), x1: Math.max(dirty.x1, rect.x1), y1: Math.max(dirty.y1, rect.y1) }
        : rect;
    }
    if (dirty) this.updateRegion(dirty);
    this.requestDraw();
  }
}
