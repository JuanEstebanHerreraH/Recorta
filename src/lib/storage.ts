// Preferencias guardadas en el navegador. Si el almacenamiento no está disponible
// (modo privado, permisos), la app sigue funcionando con los valores por defecto.

const PREFIX = 'recorta:';

export function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: la preferencia vale solo para esta sesión.
  }
}
