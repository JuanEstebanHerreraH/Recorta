import type { ReactNode } from 'react';
import { redo, setTool, undo } from '../state/actions';
import { useStore, type Tool } from '../state/store';
import { IconButton } from './controls';
import { IconBrush, IconDropper, IconEraser, IconHand, IconRedo, IconTarget, IconUndo } from './icons';

const TOOLS: Array<{ id: Tool; label: string; key: string; icon: ReactNode }> = [
  { id: 'erase', label: 'Borrar', key: 'B', icon: <IconEraser /> },
  { id: 'restore', label: 'Restaurar', key: 'R', icon: <IconBrush /> },
  { id: 'select', label: 'Seleccionar con un clic', key: 'S', icon: <IconTarget /> },
  { id: 'picker', label: 'Gotero: quitar un color', key: 'I', icon: <IconDropper /> },
  { id: 'pan', label: 'Mover la vista', key: 'H', icon: <IconHand /> },
];

export function ToolStrip() {
  const tool = useStore((s) => s.tool);
  const hasDoc = useStore((s) => Boolean(s.doc));
  const canUndo = useStore((s) => s.historyIndex > 0);
  const canRedo = useStore((s) => s.historyIndex < s.history.length - 1);

  return (
    <aside className="toolstrip" aria-label="Herramientas">
      <div className="toolstrip__group">
        {TOOLS.map((t) => (
          <IconButton
            key={t.id}
            label={`${t.label} (${t.key})`}
            active={tool === t.id}
            disabled={!hasDoc}
            onClick={() => setTool(t.id)}
            className={`tool tool--${t.id}`}
          >
            {t.icon}
          </IconButton>
        ))}
      </div>
      <div className="toolstrip__group">
        <IconButton label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <IconUndo />
        </IconButton>
        <IconButton label="Rehacer (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <IconRedo />
        </IconButton>
      </div>
    </aside>
  );
}
