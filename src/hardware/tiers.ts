// Niveles de equipo: qué modelo de IA se usa y qué funciones se habilitan según el hardware.
import type { HardwareInfo } from './detect';

export type Tier = 'alto' | 'medio' | 'bajo';
export type TierChoice = 'auto' | Tier;
export type LowQuality = 'rapida' | 'mejor';

export const TIER_ORDER: Tier[] = ['alto', 'medio', 'bajo'];

export interface TierProfile {
  id: Tier;
  name: string;
  /** A quién va dirigido, en una frase. */
  hardware: string;
  /** Qué hace la app en este nivel. */
  behavior: string;
  device: 'webgpu' | 'wasm';
  /** Tamaño máximo de imagen que se edita sin achicar (megapíxeles). */
  maxEditMP: number;
  /** Agrandar con IA: tamaño máximo de entrada (megapíxeles); 0 = no disponible. */
  aiUpscaleMaxMP: number;
  historyLimit: number;
}

export const TIERS: Record<Tier, TierProfile> = {
  alto: {
    id: 'alto',
    name: 'Alto',
    hardware: 'Tarjeta gráfica dedicada (NVIDIA, AMD Radeon RX, Intel Arc) o equivalente, 16 GB de RAM.',
    behavior: 'IA en la tarjeta gráfica con el modelo de 1024 px: el borde más preciso. Agrandar con IA disponible.',
    device: 'webgpu',
    maxEditMP: 48,
    aiUpscaleMaxMP: 4,
    historyLimit: 60,
  },
  medio: {
    id: 'medio',
    name: 'Medio',
    hardware: 'Gráfica integrada moderna (Intel Iris Xe, AMD Radeon integrada, Apple M) con WebGPU, 8 GB de RAM.',
    behavior: 'IA en la tarjeta gráfica con el modelo de 512 px; el borde se afina luego con la imagen original. Agrandar con IA solo para imágenes chicas.',
    device: 'webgpu',
    maxEditMP: 24,
    aiUpscaleMaxMP: 1,
    historyLimit: 40,
  },
  bajo: {
    id: 'bajo',
    name: 'Bajo',
    hardware: 'Cualquier PC con Windows 10/11 de 64 bits y 4 GB de RAM, aunque no tenga WebGPU.',
    behavior: 'IA en el procesador con un modelo liviano (U²-Net). Más lenta y menos precisa: para logos y fondos lisos conviene "Quitar color de fondo". Agrandar con IA no disponible.',
    device: 'wasm',
    maxEditMP: 12,
    aiUpscaleMaxMP: 0,
    historyLimit: 20,
  },
};

export interface TierDecision {
  tier: Tier;
  reasons: string[];
}

/** Elige el nivel recomendado a partir de lo que informa el equipo. */
export function decideTier(info: HardwareInfo): TierDecision {
  const reasons: string[] = [];

  if (!info.webgpu) {
    reasons.push(info.webgpuProblem ?? 'No hay WebGPU disponible.');
    reasons.push('La IA va a usar el procesador: nivel Bajo.');
    return { tier: 'bajo', reasons };
  }
  if (!info.shaderF16) {
    reasons.push('La tarjeta gráfica no admite media precisión (shader-f16), que usan los modelos rápidos.');
    reasons.push('La IA va a usar el procesador: nivel Bajo.');
    return { tier: 'bajo', reasons };
  }
  if (info.maxStorageBuffersPerShaderStage < 8) {
    reasons.push('La tarjeta gráfica tiene límites de memoria por debajo de lo que piden los modelos.');
    return { tier: 'bajo', reasons };
  }

  const vendor = (info.gpu?.vendor ?? '').toLowerCase();
  const arch = (info.gpu?.architecture ?? '').toLowerCase();
  const desc = (info.gpu?.description ?? '').toLowerCase();
  const integratedAmd = /radeon\(tm\) graphics|vega|\b(6|7|8)\d0m\b|radeon graphics/.test(desc);

  let tier: Tier = 'medio';
  if (vendor.includes('nvidia')) {
    tier = 'alto';
    reasons.push('Tarjeta gráfica NVIDIA detectada.');
  } else if (vendor.includes('amd') && !integratedAmd) {
    tier = 'alto';
    reasons.push('Tarjeta gráfica AMD dedicada detectada.');
  } else if (vendor.includes('intel') && /xe-hpg|arc|alchemist|battlemage/.test(`${arch} ${desc}`)) {
    tier = 'alto';
    reasons.push('Tarjeta gráfica Intel Arc detectada.');
  } else if (vendor.includes('apple')) {
    reasons.push('Gráfica Apple integrada: muy capaz, se empieza en Medio por seguridad.');
  } else {
    reasons.push('Gráfica integrada o no identificada: se usa el modelo de 512 px.');
  }

  if (tier === 'alto' && info.memoryGB !== null && info.memoryGB < 8) {
    tier = 'medio';
    reasons.push(`El sistema informa ${info.memoryGB} GB de memoria: se baja a Medio para no saturarla.`);
  }

  reasons.push('Usa "Probar rendimiento" para confirmarlo con una medición real.');
  return { tier, reasons };
}

/**
 * Traduce una medición real (segundos que tarda el modelo de 512 px en la GPU) a un nivel.
 * El modelo de 1024 px procesa 4 veces más píxeles, así que tarda aproximadamente 4 veces más.
 */
export function tierFromBenchmark(seconds512: number | null): Tier {
  if (seconds512 === null) return 'bajo';
  if (seconds512 <= 0.8) return 'alto';
  if (seconds512 <= 5) return 'medio';
  return 'bajo';
}

/** Niveles a intentar en orden, desde el pedido hacia abajo, salteando los que ya fallaron. */
export function fallbackChain(start: Tier, failed: Iterable<Tier> = []): Tier[] {
  const skip = new Set(failed);
  return TIER_ORDER.slice(TIER_ORDER.indexOf(start)).filter((t) => !skip.has(t) || t === 'bajo');
}

export function tierAtMost(tier: Tier, cap: Tier): Tier {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(cap) ? tier : cap;
}
