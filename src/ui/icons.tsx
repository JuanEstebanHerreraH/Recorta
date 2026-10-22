// Íconos de línea propios (24×24). Heredan el color del texto.
import { useId, type ReactNode, type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5" />
    <path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13" />
    <path d="M17 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.6-2.2L4.4 15a1.6 1.6 0 0 1 2.5-2l1.1 1.3" />
  </Icon>
);

export const IconEraser = (p: IconProps) => (
  <Icon {...p}>
    <path d="m7 21-3.6-3.6a2 2 0 0 1 0-2.8L13.8 4.2a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L9 21" />
    <path d="M7 21h13" />
    <path d="m9 11 6 6" />
  </Icon>
);

export const IconBrush = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 3.5a2.1 2.1 0 0 1 0 3L11 15l-3-3 8.5-8.5a2.1 2.1 0 0 1 3 0Z" />
    <path d="M8 12c-2.5 0-4 1.7-4 4 0 1.6-.6 2.6-1.5 3.3 1.2.5 2.6.7 4 .7 3 0 4.5-1.8 4.5-4.5" />
  </Icon>
);

export const IconTarget = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l7 17 2.5-7L21 11.5Z" />
  </Icon>
);

export const IconDropper = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.5 6.5 3 3" />
    <path d="M16.6 3.4a2 2 0 0 1 2.9 0l1.1 1.1a2 2 0 0 1 0 2.9L18 10l-4-4Z" />
    <path d="m14 6-8.6 8.6a2 2 0 0 0-.6 1.4V19h3l8.6-8.6" />
  </Icon>
);

export const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9Z" />
  </Icon>
);

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);

export const IconRedo = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Icon>
);

export const IconFit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4" />
    <path d="M15 4h4a1 1 0 0 1 1 1v4" />
    <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
    <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m21 16-4.6-4.6a1.5 1.5 0 0 0-2.1 0L5 20.5" />
  </Icon>
);

export const IconStack = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="13" height="13" rx="2" />
    <path d="M4 16V5a1 1 0 0 1 1-1h11" />
  </Icon>
);

export const IconChip = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.8" />
    <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11" />
    <path d="m7 10.5 5 5 5-5" />
    <path d="M5 20h14" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5Z" />
    <path d="M12 10v4.5M12 17.6v.1" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </Icon>
);

export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icon>
);

/**
 * Marca de la app: un cuadrado cortado en diagonal. Arriba, la parte que se conserva
 * (verde tapete de corte); abajo, el damero de lo transparente; en el medio, la línea de corte.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect x="1" y="1" width="30" height="30" rx="7" />
        </clipPath>
        <pattern id={`${id}-checker`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#f4f4f4" />
          <rect width="4" height="4" fill="#cdcdcd" />
          <rect x="4" y="4" width="4" height="4" fill="#cdcdcd" />
        </pattern>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect x="1" y="1" width="30" height="30" fill={`url(#${id}-checker)`} />
        <path d="M1 1h30v30Z" fill="#2f7d5b" />
        <path d="M2 2 30 30" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="2.6 2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}
