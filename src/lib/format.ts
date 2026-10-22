// Formatos de números y tamaños en español.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('es', { maximumFractionDigits: 0 })} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('es', { maximumFractionDigits: 1 })} MB`;
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('es');
}

export function formatDims(width: number, height: number): string {
  return `${formatInt(width)} × ${formatInt(height)} px`;
}

export function formatMegapixels(width: number, height: number): string {
  return `${((width * height) / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })} MP`;
}

export function formatSeconds(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString('es', { maximumFractionDigits: 1 })} s`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
