import { useEffect, useRef } from 'react';
import { BG_MODELS } from '../ai/models';
import { gpuLabel } from '../hardware/detect';
import { TIERS, TIER_ORDER, type TierChoice } from '../hardware/tiers';
import { formatSeconds } from '../lib/format';
import { runBenchmark, setTierChoice } from '../state/actions';
import { effectiveTier, useStore } from '../state/store';
import { Button, Note } from './controls';
import { IconClose } from './icons';

export function HardwareDialog() {
  const open = useStore((s) => s.hardwareOpen);
  const hw = useStore((s) => s.hardware);
  const autoTier = useStore((s) => s.autoTier);
  const reasons = useStore((s) => s.autoReasons);
  const choice = useStore((s) => s.tierChoice);
  const failed = useStore((s) => s.failedTiers);
  const benchmark = useStore((s) => s.benchmarkSeconds);
  const busy = useStore((s) => Boolean(s.busy));
  const tier = useStore(effectiveTier);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = () => useStore.setState({ hardwareOpen: false });
  const gpuOk = Boolean(hw?.webgpu && hw.shaderF16);

  return (
    <dialog ref={dialog} className="dialog" onClose={close} aria-labelledby="hw-title">
      <header className="dialog__header">
        <h2 id="hw-title">Tu equipo y el nivel de la IA</h2>
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
          <IconClose />
        </button>
      </header>

      <div className="dialog__body">
        <p className="dialog__lead">
          La IA corre en esta computadora, sin internet después de la primera descarga y sin límites de uso. El nivel define qué
          modelo se usa para que funcione bien en tu equipo.
        </p>

        {hw ? (
          <dl className="facts facts--grid">
            <div>
              <dt>Tarjeta gráfica</dt>
              <dd>{gpuLabel(hw)}</dd>
            </div>
            <div>
              <dt>WebGPU</dt>
              <dd>{hw.webgpu ? 'Disponible' : 'No disponible'}</dd>
            </div>
            <div>
              <dt>Media precisión</dt>
              <dd>{hw.shaderF16 ? 'Sí' : 'No'}</dd>
            </div>
            <div>
              <dt>Procesador</dt>
              <dd>{hw.cpuThreads} hilos</dd>
            </div>
            <div>
              <dt>Memoria</dt>
              <dd>{hw.memoryGB ? `${hw.memoryGB} GB o más` : 'No informada'}</dd>
            </div>
            <div>
              <dt>IA en procesador</dt>
              <dd>{hw.multiThread ? 'Varios hilos' : 'Un hilo (más lenta)'}</dd>
            </div>
            <div>
              <dt>Entorno</dt>
              <dd>{hw.browser}</dd>
            </div>
            {benchmark !== null && (
              <div>
                <dt>Última medición</dt>
                <dd>{formatSeconds(benchmark * 1000)} con el modelo de 512 px</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="meta">Detectando…</p>
        )}

        <div className="recommendation">
          <p>
            <strong>Recomendado: nivel {TIERS[autoTier].name}.</strong>
          </p>
          <ul>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <Button disabled={busy || !gpuOk} onClick={() => void runBenchmark()}>
            Probar rendimiento
          </Button>
          {!gpuOk && <p className="meta">La prueba mide la tarjeta gráfica; sin WebGPU no hace falta.</p>}
        </div>

        <fieldset className="tiers">
          <legend>Nivel en uso</legend>
          {(['auto', ...TIER_ORDER] as TierChoice[]).map((option) => {
            const profile = option === 'auto' ? null : TIERS[option];
            const needsGpu = option === 'alto' || option === 'medio';
            const blocked = needsGpu && !gpuOk;
            return (
              <label key={option} className={`tier-option ${choice === option ? 'is-selected' : ''} ${blocked ? 'is-blocked' : ''}`}>
                <input
                  type="radio"
                  name="tier"
                  value={option}
                  checked={choice === option}
                  onChange={() => setTierChoice(option)}
                />
                <span className="tier-option__body">
                  <span className="tier-option__name">
                    {profile ? profile.name : `Automático (ahora: ${TIERS[autoTier].name})`}
                    {profile && failed.includes(profile.id) && <span className="tag tag--warning">Falló en esta sesión</span>}
                  </span>
                  {profile ? (
                    <>
                      <span className="tier-option__text">{profile.hardware}</span>
                      <span className="tier-option__text">{profile.behavior}</span>
                      <span className="tier-option__text tier-option__meta">
                        Modelo: {BG_MODELS[option === 'alto' ? 'birefnet-1024' : option === 'medio' ? 'birefnet-512' : 'u2netp'].label}
                        . Edita hasta {profile.maxEditMP} MP.
                      </span>
                    </>
                  ) : (
                    <span className="tier-option__text">Elige según lo que detecta y mide. Recomendado.</span>
                  )}
                  {blocked && <span className="tier-option__text">Necesita WebGPU con media precisión: aquí se usaría Bajo.</span>}
                </span>
              </label>
            );
          })}
        </fieldset>

        <Note>
          Si un nivel falla (por ejemplo, la tarjeta gráfica se queda sin memoria), la app baja sola al siguiente y te avisa. Nivel en
          uso ahora: <strong>{TIERS[tier].name}</strong>.
        </Note>
      </div>
    </dialog>
  );
}
