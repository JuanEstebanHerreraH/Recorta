import { useState } from 'react';
import { edgeOperation, setHalo, setHaloStrength, setTool, updateBrush } from '../../state/actions';
import { BRUSH_MAX, useStore } from '../../state/store';
import { Button, Note, Section, Segmented, Slider, Toggle } from '../controls';

export function RefinarPanel() {
  const tool = useStore((s) => s.tool);
  const brush = useStore((s) => s.brush);
  const refine = useStore((s) => s.refine);
  const busy = useStore((s) => Boolean(s.busy));
  const haloPending = useStore((s) => Boolean(s.doc && s.refine.haloEnabled && s.doc.fgVersion !== s.doc.maskVersion));
  const [feather, setFeather] = useState(2);
  const [shift, setShift] = useState(-1);
  const [harden, setHarden] = useState(30);

  return (
    <div className="panel">
      <Section
        title="Pincel"
        description="Pinta sobre la imagen para borrar o recuperar zonas. La foto original nunca se pierde."
      >
        <Segmented
          value={tool === 'restore' ? 'restore' : 'erase'}
          onChange={(value) => setTool(value)}
          options={[
            { value: 'erase', label: 'Borrar (B)' },
            { value: 'restore', label: 'Restaurar (R)' },
          ]}
        />
        <Slider
          label="Tamaño"
          value={brush.size}
          min={1}
          max={BRUSH_MAX}
          unit="px"
          onChange={(v) => updateBrush({ size: v })}
          hint="También con las teclas [ y ]."
        />
        <Slider
          label="Dureza"
          value={brush.hardness}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => updateBrush({ hardness: v })}
          hint="100 % deja un borde nítido; menos, un borde difuminado."
        />
        <Slider label="Opacidad" value={brush.opacity} min={1} max={100} unit="%" onChange={(v) => updateBrush({ opacity: v })} />
        <Toggle
          label="Presión del lápiz"
          checked={brush.pressure}
          onChange={(v) => updateBrush({ pressure: v })}
          hint="Con tableta gráfica, apretar más hace el pincel más grande."
        />
        <p className="meta">
          Mantén <kbd>Alt</kbd> para cambiar entre borrar y restaurar sin soltar el pincel. <kbd>Espacio</kbd> + arrastrar mueve la vista.
        </p>
      </Section>

      <Section title="Borde" description="Ajustes para todo el contorno. Cada uno queda como un paso del historial.">
        <div className="apply-row">
          <Slider label="Suavizar" value={feather} min={1} max={30} unit="px" onChange={setFeather} />
          <Button size="sm" disabled={busy} onClick={() => void edgeOperation('feather', feather)}>
            Aplicar
          </Button>
        </div>
        <div className="apply-row">
          <Slider
            label="Desplazar"
            value={shift}
            min={-30}
            max={30}
            format={(v) => (v === 0 ? '0 px' : v > 0 ? `+${v} px (expandir)` : `${v} px (contraer)`)}
            onChange={setShift}
          />
          <Button size="sm" disabled={busy || shift === 0} onClick={() => void edgeOperation('shiftEdge', shift)}>
            Aplicar
          </Button>
        </div>
        <div className="apply-row">
          <Slider label="Endurecer" value={harden} min={1} max={100} unit="%" onChange={setHarden} />
          <Button size="sm" disabled={busy} onClick={() => void edgeOperation('harden', harden)}>
            Aplicar
          </Button>
        </div>
        <p className="meta">Contraer 1 o 2 px suele limpiar restos del fondo pegados al borde.</p>
      </Section>

      <Section title="Quitar halo">
        <Toggle
          label="Quitar halo"
          checked={refine.haloEnabled}
          onChange={setHalo}
          hint="Corrige el color de los bordes semitransparentes, que conservan parte del fondo anterior. No cambia qué se borra."
        />
        {refine.haloEnabled && (
          <Slider
            label="Intensidad"
            value={refine.haloStrength}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => setHaloStrength(v, false)}
            onCommit={(v) => setHaloStrength(v, true)}
          />
        )}
        {haloPending && <p className="meta">Calculando el color de los bordes…</p>}
        <Note>
          Revisa el borde con el fondo de la vista en negro y en blanco (barra inferior): los halos claros se notan sobre negro y
          los oscuros sobre blanco.
        </Note>
      </Section>
    </div>
  );
}
