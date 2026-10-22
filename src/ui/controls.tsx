// Controles básicos de la interfaz: botones, deslizadores, interruptores y grupos.
import { useId, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
}) {
  return (
    <button type="button" className={`btn btn--${variant} btn--${size} ${className}`} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({
  label,
  active = false,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  onCommit,
  format,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  /** Se llama al soltar el control (para registrar el paso en el historial). */
  onCommit?: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const shown = format ? format(value) : `${value}${unit ? ` ${unit}` : ''}`;
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className={`field slider ${disabled ? 'is-disabled' : ''}`}>
      <div className="field__row">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <output htmlFor={id} className="field__value">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      />
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field toggle ${disabled ? 'is-disabled' : ''}`}>
      <div className="field__row">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          className={`switch ${checked ? 'is-on' : ''}`}
          onClick={() => onChange(!checked)}
        >
          <span className="switch__thumb" />
        </button>
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean; title?: string }>;
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      {label && (
        <div className="field__row">
          <span className="field__label" id={id}>
            {label}
          </span>
        </div>
      )}
      <div
        className={`segmented ${options.length === 5 ? 'segmented--3-2' : ''}`}
        role="radiogroup"
        aria-labelledby={label ? id : undefined}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            disabled={option.disabled}
            title={option.title}
            className={`segmented__item ${option.value === value ? 'is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  // Mientras se escribe se muestra exactamente lo tecleado (aunque esté a medias, como "1"
  // camino a "120"); al salir del campo vuelve a mostrar el valor guardado.
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  return (
    <div className="field">
      <div className="field__row">
        <label htmlFor={id} className="field__label">
          {label}
        </label>
        <div className="number">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={draft ?? (Number.isFinite(value) ? value : '')}
            min={min}
            max={max}
            step={step}
            onFocus={() => setDraft(Number.isFinite(value) ? String(value) : '')}
            onChange={(e) => {
              setDraft(e.target.value);
              const next = Number(e.target.value);
              // Vacío o inválido: no se guarda nada hasta que haya un número.
              if (e.target.value.trim() !== '' && Number.isFinite(next)) onChange(clamp(next));
            }}
            onBlur={() => setDraft(null)}
          />
          {unit && <span className="number__unit">{unit}</span>}
        </div>
      </div>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="section">
      <header className="section__header">
        <h3 className="section__title">{title}</h3>
        {aside}
      </header>
      {description && <p className="section__description">{description}</p>}
      <div className="section__body">{children}</div>
    </section>
  );
}

export function Note({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'success'; children: ReactNode }) {
  return <div className={`note note--${kind}`}>{children}</div>;
}

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className={`progress ${value === null ? 'is-indeterminate' : ''}`} role="progressbar" aria-valuenow={value ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__bar" style={{ width: value === null ? undefined : `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}
