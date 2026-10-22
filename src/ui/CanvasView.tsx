import { useEffect, useRef } from 'react';
import { EditorEngine, type EngineTheme } from '../editor/engine';
import { addSamPoint, colorKeyAt, commitMask } from '../state/actions';
import { useStore } from '../state/store';

function readTheme(element: HTMLElement): EngineTheme {
  const css = getComputedStyle(element);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    workspace: v('--mesa', '#34373b'),
    outline: v('--canvas-outline', 'rgba(255,255,255,0.18)'),
    checkerA: v('--checker-a', '#d9d9d9'),
    checkerB: v('--checker-b', '#ffffff'),
  };
}

export function CanvasView() {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<EditorEngine | null>(null);

  const docId = useStore((s) => s.doc?.id);
  const maskVersion = useStore((s) => s.doc?.maskVersion);
  const fgVersion = useStore((s) => s.doc?.fgVersion);
  const haloEnabled = useStore((s) => s.refine.haloEnabled);
  const tool = useStore((s) => s.tool);
  const brush = useStore((s) => s.brush);
  const view = useStore((s) => s.view);
  const fitRequest = useStore((s) => s.fitRequest);
  const zoomRequest = useStore((s) => s.zoomRequest);
  const samPreview = useStore((s) => s.sam.preview);
  const samPoints = useStore((s) => s.sam.points);

  // Crear el motor una vez por imagen.
  useEffect(() => {
    const doc = useStore.getState().doc;
    if (!canvas.current || !host.current || !doc) return;
    const instance = new EditorEngine(canvas.current, doc, {
      onStrokeEnd: (kind) => {
        commitMask(kind === 'erase' ? 'Borrar con pincel' : 'Restaurar con pincel');
        return useStore.getState().doc?.maskVersion ?? 0;
      },
      onZoomChange: (zoom) => useStore.setState((s) => ({ view: { ...s.view, zoom } })),
      onPick: (x, y) => void colorKeyAt([[x, y]]),
      onSamPoint: (x, y, positive) => void addSamPoint(x, y, positive),
    });
    engine.current = instance;
    const state = useStore.getState();
    instance.setTheme(readTheme(host.current));
    instance.setTool(state.tool);
    instance.setBrush(state.brush);
    instance.setView(state.view.background, state.view.color, state.view.mode);

    const element = host.current;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      instance.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    resize();
    instance.fit();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    const scheme = window.matchMedia('(prefers-color-scheme: light)');
    const onScheme = () => instance.setTheme(readTheme(element));
    scheme.addEventListener('change', onScheme);

    return () => {
      observer.disconnect();
      scheme.removeEventListener('change', onScheme);
      instance.dispose();
      engine.current = null;
    };
  }, [docId]);

  useEffect(() => {
    const doc = useStore.getState().doc;
    if (doc) engine.current?.syncDoc(doc);
  }, [maskVersion]);

  useEffect(() => {
    const doc = useStore.getState().doc;
    engine.current?.setColorSource(haloEnabled && doc?.fg ? doc.fg : null);
  }, [fgVersion, haloEnabled, docId]);

  useEffect(() => engine.current?.setTool(tool), [tool]);
  useEffect(() => engine.current?.setBrush(brush), [brush]);
  useEffect(() => engine.current?.setView(view.background, view.color, view.mode), [view.background, view.color, view.mode]);
  useEffect(() => engine.current?.setSam(samPreview, samPoints), [samPreview, samPoints]);

  useEffect(() => {
    if (fitRequest) engine.current?.fit();
  }, [fitRequest]);

  useEffect(() => {
    if (zoomRequest) engine.current?.zoomTo(zoomRequest.value);
  }, [zoomRequest]);

  return (
    <div ref={host} className="canvas-host">
      <canvas ref={canvas} className="canvas" aria-label="Lienzo de edición" />
      {tool === 'select' && samPoints.length === 0 && (
        <p className="canvas-hint">Haz clic sobre lo que quieres seleccionar. Clic derecho o Alt + clic para excluir.</p>
      )}
      {tool === 'picker' && <p className="canvas-hint">Haz clic sobre el color de fondo que quieres quitar.</p>}
    </div>
  );
}
