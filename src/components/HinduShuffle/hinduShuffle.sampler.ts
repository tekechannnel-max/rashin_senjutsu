import {
  DEFAULT_PACKET_DURATION_MS,
  DEFAULT_SETTLE_MS,
  QUALITY_CONFIG,
  TOTAL_DECK_CARDS,
} from './hinduShuffle.config';
import type { PacketSample, ShufflePacketPlan, ShuffleQuality } from './hinduShuffle.types';

export type RandomSource = () => number;

function randBetween(rng: RandomSource, min: number, max: number): number {
  return min + (max - min) * rng();
}

function randInt(rng: RandomSource, min: number, max: number): number {
  return Math.floor(randBetween(rng, min, max + 1));
}

/**
 * Hindu shuffle packets are usually small thumb-pulled groups.
 * This favors 1-7 cards and occasionally emits an 8-12 card packet.
 */
export function samplePacketSize(rng: RandomSource = Math.random): number {
  const roll = rng();
  if (roll < 0.12) return 1;
  if (roll < 0.30) return randInt(rng, 2, 3);
  if (roll < 0.72) return randInt(rng, 4, 7);
  if (roll < 0.92) return randInt(rng, 2, 5);
  return randInt(rng, 8, 12);
}

export function samplePacket(
  quality: ShuffleQuality,
  rng: RandomSource = Math.random
): PacketSample {
  const size = samplePacketSize(rng);
  const visibleCount = Math.min(size, QUALITY_CONFIG[quality].packetCardLimit);
  return { size, visibleCount };
}

export function buildShufflePlan(options: {
  quality: ShuffleQuality;
  durationScale?: number;
  rng?: RandomSource;
  totalCards?: number;
}): ShufflePacketPlan[] {
  const rng = options.rng || Math.random;
  const quality = options.quality;
  const config = QUALITY_CONFIG[quality];
  const totalCards = options.totalCards || TOTAL_DECK_CARDS;
  const plan: ShufflePacketPlan[] = [];
  let moved = 0;

  while (moved < totalCards && plan.length < config.packetMoves) {
    const sample = samplePacket(quality, rng);
    const remaining = totalCards - moved;
    const size = Math.min(sample.size, remaining);
    const direction = plan.length % 2 === 0 ? 1 : -1;
    const progress = plan.length / Math.max(1, config.packetMoves - 1);

    plan.push({
      ...sample,
      size,
      visibleCount: Math.min(sample.visibleCount, size),
      index: plan.length,
      durationMs: randBetween(rng, DEFAULT_PACKET_DURATION_MS.min, DEFAULT_PACKET_DURATION_MS.max),
      settleMs: randBetween(rng, DEFAULT_SETTLE_MS.min, DEFAULT_SETTLE_MS.max),
      x: randBetween(rng, -118, -92),
      y: randBetween(rng, -9, 13) + progress * 10,
      z: randBetween(rng, 28, 64),
      rotateX: randBetween(rng, -8, 7),
      rotateY: randBetween(rng, 14, 27),
      rotateZ: randBetween(rng, -4, 4) + direction * randBetween(rng, 1.5, 5),
    });
    moved += size;
  }

  return plan;
}
