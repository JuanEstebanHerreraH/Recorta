import { formatCm, type Paper } from '../imaging/units';

/**
 * Tamaño real sobre una base de corte: la imagen impresa a los DPI elegidos, junto a una
 * hoja de referencia, sobre una cuadrícula en centímetros.
 */
export function MatPreview({
  printCm,
  paper,
  thumbnail,
}: {
  printCm: { width: number; height: number };
  paper: Paper;
  thumbnail: string | null;
}) {
  const margin = 1.6;
  const w = Math.max(paper.widthCm, printCm.width);
  const h = Math.max(paper.heightCm, printCm.height);
  const matW = Math.ceil(w + margin * 2);
  const matH = Math.ceil(h + margin * 2);
  const size = Math.max(matW, matH);
  const labelStep = size > 120 ? 20 : size > 60 ? 10 : 5;
  const minorStep = size > 60 ? 5 : 1;
  const font = Math.max(0.55, size / 34);

  const vertical: number[] = [];
  for (let x = 0; x <= matW; x += minorStep) vertical.push(x);
  const horizontal: number[] = [];
  for (let y = 0; y <= matH; y += minorStep) horizontal.push(y);

  const imageW = Math.max(0.05, printCm.width);
  const imageH = Math.max(0.05, printCm.height);

  return (
    <figure className="mat">
      <svg
        className="mat__svg"
        viewBox={`0 0 ${matW} ${matH}`}
        role="img"
        aria-label={`Tamaño impreso: ${formatCm(printCm.width)} por ${formatCm(printCm.height)} centímetros, junto a una hoja ${paper.name}`}
      >
        <rect width={matW} height={matH} className="mat__base" />
        {vertical.map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={matH} className={x % labelStep === 0 ? 'mat__major' : 'mat__minor'} />
        ))}
        {horizontal.map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={matW} y2={y} className={y % labelStep === 0 ? 'mat__major' : 'mat__minor'} />
        ))}
        {vertical
          .filter((x) => x > 0 && x % labelStep === 0 && x < matW)
          .map((x) => (
            <text key={`tx${x}`} x={x + font * 0.25} y={font * 1.05} fontSize={font} className="mat__label">
              {x}
            </text>
          ))}
        {horizontal
          .filter((y) => y > 0 && y % labelStep === 0 && y < matH)
          .map((y) => (
            <text key={`ty${y}`} x={font * 0.3} y={y - font * 0.25} fontSize={font} className="mat__label">
              {y}
            </text>
          ))}

        <rect x={margin} y={margin} width={paper.widthCm} height={paper.heightCm} className="mat__paper" />
        <text x={margin + paper.widthCm - font * 0.4} y={margin + paper.heightCm - font * 0.5} fontSize={font} className="mat__paper-label" textAnchor="end">
          {paper.name}
        </text>

        <rect x={margin} y={margin} width={imageW} height={imageH} className="mat__frame" />
        {thumbnail && (
          <image href={thumbnail} x={margin} y={margin} width={imageW} height={imageH} preserveAspectRatio="xMidYMid meet" />
        )}
      </svg>
      <figcaption className="mat__caption">
        <strong>
          {formatCm(printCm.width)} × {formatCm(printCm.height)} cm
        </strong>{' '}
        impreso, al lado de una hoja {paper.name}. Cada cuadro mide {minorStep} cm.
      </figcaption>
    </figure>
  );
}
