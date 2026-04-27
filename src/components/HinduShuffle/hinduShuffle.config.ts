import type { ShuffleQuality } from './hinduShuffle.types';

export const TOTAL_DECK_CARDS = 52;
export const MIN_VISIBLE_CARDS = 8;
export const MAX_VISIBLE_CARDS = 12;

export interface QualityConfig {
  visibleCards: number;
  packetMoves: number;
  packetCardLimit: number;
  glow: boolean;
  settleStrength: number;
}

export const QUALITY_CONFIG: Record<ShuffleQuality, QualityConfig> = {
  low: {
    visibleCards: 8,
    packetMoves: 12,
    packetCardLimit: 3,
    glow: false,
    settleStrength: 0.72,
  },
  medium: {
    visibleCards: 10,
    packetMoves: 16,
    packetCardLimit: 4,
    glow: true,
    settleStrength: 1,
  },
  high: {
    visibleCards: 12,
    packetMoves: 20,
    packetCardLimit: 5,
    glow: true,
    settleStrength: 1.18,
  },
};

export const DEFAULT_PACKET_DURATION_MS = {
  min: 120,
  max: 220,
};

export const DEFAULT_SETTLE_MS = {
  min: 80,
  max: 150,
};

export function clampVisibleCards(value: number | undefined, quality: ShuffleQuality): number {
  const fallback = QUALITY_CONFIG[quality].visibleCards;
  const next = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(MIN_VISIBLE_CARDS, Math.min(MAX_VISIBLE_CARDS, Math.round(next)));
}

export function normalizeDurationScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.45, Math.min(2.25, Number(value)));
}
