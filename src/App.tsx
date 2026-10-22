import { useEffect, useState } from 'react';
import { initHardware, redo, requestFit, requestZoom, saveExport, setTool, undo, updateBrush } from './state/actions';
import { handleFiles, imageFiles } from './state/files';
import { BRUSH_MAX, useStore } from './state/store';
import { BatchView } from './ui/BatchView';
import { BusyBar } from './ui/BusyBar';
import { CanvasView } from './ui/CanvasView';
import { EmptyState } from './ui/EmptyState';
import { HardwareDialog } from './ui/HardwareDialog';
import { Sidebar } from './ui/Sidebar';
import { StatusBar } from './ui/StatusBar';
import { Toasts } from './ui/Toasts';
import { ToolStrip } from './ui/ToolStrip';
import { TopBar } from './ui/TopBar';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable),
  );
}

export function App() {
  const mode = useStore((s) => s.mode);
  const hasDoc = useStore((s) => Boolean(s.doc));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void initHardware();
  }, []);

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const state = useStore.getState();
      if (mod && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      } else if (mod && key === 's') {
        event.preventDefault();
        if (state.doc) void saveExport();
      } else if (mod && key === '0') {
        event.preventDefault();
        requestFit();
      } else if (mod && key === '1') {
        event.preventDefault();
        requestZoom(1);
      } else if (!mod && !event.altKey && state.doc && state.mode === 'editor') {
        if (key === 'b') setTool('erase');
        else if (key === 'r') setTool('restore');
        else if (key === 'h') setTool('pan');
        else if (key === 's') setTool('select');
        else if (key === 'i') setTool('picker');
        else if (key === '[' || key === ']') {
          const size = state.brush.size;
          const next =
            key === ']' ? Math.min(BRUSH_MAX, Math.round(size * 1.15) + 1) : Math.max(1, Math.round(size / 1.15) - 1);
          updateBrush({ size: next });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pegar una imagen con Ctrl+V.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const files = imageFiles(event.clipboardData?.files ?? null);
      if (files.length) {
        event.preventDefault();
        handleFiles(files.map((f, i) => (f.name ? f : new File([f], `pegada-${i + 1}.png`, { type: f.type }))));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(imageFiles(e.dataTransfer.files));
      }}
    >
      <TopBar />
      <BusyBar />
      {mode === 'lote' ? (
        <BatchView />
      ) : (
        <div className={`workspace ${hasDoc ? '' : 'is-empty'}`}>
          <ToolStrip />
          <div className="stage">
            {hasDoc ? <CanvasView /> : <EmptyState />}
            <StatusBar />
          </div>
          <Sidebar />
        </div>
      )}
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <p>Suelta para abrir</p>
        </div>
      )}
      <HardwareDialog />
      <Toasts />
    </div>
  );
}
