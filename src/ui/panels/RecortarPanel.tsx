import { bgModelFor } from '../../ai/models';
import { TIERS } from '../../hardware/tiers';
import {
  applySam,
  clearSamPoints,
  colorKeyAt,
  invertSelection,
  removeBackgroundAi,
  restoreAll,
  setLowQuality,
  setTool,
} from '../../state/actions';
import { effectiveTier, useStore } from '../../state/store';
import { Button, Note, Section, Segmented, Slider, Toggle } from '../controls';
import { IconSparkle } from '../icons';

export function RecortarPanel() {
  const tier = useStore(effectiveTier);
  const lowQuality = useStore((s) => s.lowQuality);
  const busy = useStore((s) => Boolean(s.busy));
  const guided = useStore((s) => s.guidedEdges);
  const tool = useStore((s) => s.tool);
  const sam = useStore((s) => s.sam);
  const colorKey = useStore((s) => s.colorKey);
  const spec = bgModelFor(tier, lowQuality);
  const setColorKey = (patch: Partial<typeof colorKey>) =>
    useStore.setState((s) => ({ colorKey: { ...s.colorKey, ...patch } }));

  return (
    <div className="panel">
      <Section
        title="Quitar el fondo con IA"
        description="La IA separa el objeto del fondo en tu computadora. Después puedes corregir a mano lo que haga falta."
      >
        <Button variant="primary" size="lg" icon={<IconSparkle size={18} />} disabled={busy} onClick={() => void removeBackgroundAi()}>
          Quitar fondo con IA
        </Button>
        <p className="meta">
          Nivel {TIERS[tier].name}: {spec.label}. Se descarga una sola vez ({spec.downloadMB} MB).{' '}
          <button type="button" className="link-btn" onClick={() => useStore.setState({ hardwareOpen: true })}>
            Cambiar nivel
          </button>
        </p>
        {tier === 'bajo' && (
          <Segmented
            label="Calidad en nivel Bajo"
            value={lowQuality}
            onChange={setLowQuality}
            options={[
              { value: 'rapida', label: 'Rápida (5 MB)' },
              { value: 'mejor', label: 'Mejor (176 MB)' },
            ]}
            hint="La opción Mejor usa el U²-Net completo: más preciso, más lento y con una descarga más grande."
          />
        )}
        <Toggle
          label="Afinar el borde con la foto original"
          checked={guided}
          onChange={(value) => useStore.setState({ guidedEdges: value })}
          hint="La IA trabaja con una copia chica; esto ajusta el borde a los detalles de la imagen en alta resolución."
        />
      </Section>

      <Section
        title="Seleccionar con un clic"
        description="Para cuando hay varios objetos o la IA eligió mal. Clic: incluir. Clic derecho o Alt + clic: excluir."
      >
        {tool !== 'select' ? (
          <Button onClick={() => setTool('select')}>Activar selección con un clic</Button>
        ) : sam.status === 'preparing' ? (
          <Note>Analizando la imagen. La primera vez se descarga el modelo (unos 20 MB).</Note>
        ) : sam.status === 'error' ? (
          <Note kind="warning">No se pudo preparar la selección en este equipo. Usa los pinceles o el gotero.</Note>
        ) : sam.preview ? (
          <>
            <p className="meta">
              {sam.points.length} {sam.points.length === 1 ? 'punto' : 'puntos'}. Confianza de la IA:{' '}
              {Math.round(sam.preview.score * 100)} %.
            </p>
            <div className="button-grid">
              <Button variant="primary" onClick={() => void applySam('keep-only')}>
                Dejar solo esto
              </Button>
              <Button onClick={() => void applySam('remove')}>Quitar esto</Button>
              <Button onClick={() => void applySam('add')}>Sumar esto</Button>
              <Button variant="ghost" onClick={clearSamPoints}>
                Borrar puntos
              </Button>
            </div>
          </>
        ) : (
          <Note>Haz clic sobre la imagen para marcar qué quieres.</Note>
        )}
      </Section>

      <Section
        title="Quitar un color de fondo (sin IA)"
        description="Ideal para logos, ilustraciones y productos sobre fondo liso. Funciona al instante en cualquier equipo."
      >
        <div className="button-row">
          <Button variant="secondary" disabled={busy} onClick={() => void colorKeyAt('borders')}>
            Quitar el color de los bordes
          </Button>
          <Button variant={tool === 'picker' ? 'primary' : 'ghost'} onClick={() => setTool(tool === 'picker' ? 'erase' : 'picker')}>
            {tool === 'picker' ? 'Gotero activo' : 'Usar el gotero'}
          </Button>
        </div>
        <Slider
          label="Tolerancia"
          value={colorKey.tolerance}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setColorKey({ tolerance: v })}
          hint="Cuánto puede diferir un color del de fondo para borrarse."
        />
        <Slider
          label="Suavidad del borde"
          value={colorKey.softness}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => setColorKey({ softness: v })}
        />
        <Toggle
          label="Solo zonas conectadas"
          checked={colorKey.contiguous}
          onChange={(v) => setColorKey({ contiguous: v })}
          hint="Apagado: borra ese color en toda la imagen (por ejemplo, el blanco dentro de una letra O)."
        />
      </Section>

      <Section title="Empezar de nuevo">
        <div className="button-row">
          <Button variant="ghost" onClick={restoreAll}>
            Restaurar todo
          </Button>
          <Button variant="ghost" onClick={invertSelection}>
            Invertir
          </Button>
        </div>
      </Section>
    </div>
  );
}
