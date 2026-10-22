// Configuración leída de las variables de entorno (ver .env.example).
import type { TierChoice } from './hardware/tiers';

const env = import.meta.env;

export const APP_NAME = 'Recorta';
export const APP_VERSION = __APP_VERSION__;

export const MODEL_HOST = (env.VITE_MODEL_HOST || 'https://huggingface.co/').replace(/\/?$/, '/');
export const ALLOW_REMOTE_MODELS = env.VITE_ALLOW_REMOTE_MODELS !== 'false';

const tierFromEnv = (env.VITE_DEFAULT_TIER || 'auto').toLowerCase();
export const DEFAULT_TIER_CHOICE: TierChoice = (['auto', 'alto', 'medio', 'bajo'] as const).includes(
  tierFromEnv as TierChoice,
)
  ? (tierFromEnv as TierChoice)
  : 'auto';

const maxHistory = Number(env.VITE_MAX_HISTORY);
export const MAX_HISTORY = Number.isFinite(maxHistory) && maxHistory >= 5 ? Math.min(200, maxHistory) : 40;

/** URL absoluta de la carpeta pública (funciona en GitHub Pages, en la app de escritorio y en local). */
export function publicBaseUrl(): string {
  return new URL(env.BASE_URL, document.baseURI).href;
}
