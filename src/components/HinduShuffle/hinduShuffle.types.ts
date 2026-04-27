import type { RefObject } from 'react';

export type ShuffleQuality = 'low' | 'medium' | 'high';

export interface HinduShuffleProps {
  autoPlay?: boolean;
  quality?: ShuffleQuality;
  cardBackUrl?: string;
  cardFaceUrls?: string[];
  durationScale?: number;
  visibleCards?: number;
  reducedMotion?: 'auto' | 'on' | 'off';
  onStart?: () => void;
  onComplete?: () => void;
}

export interface PacketSample {
  size: number;
  visibleCount: number;
}

export interface ShufflePacketPlan extends PacketSample {
  index: number;
  durationMs: number;
  settleMs: number;
  x: number;
  y: number;
  z: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
}

export interface MotionElements {
  root: HTMLElement;
  sourceDeck: HTMLElement;
  receiveStack: HTMLElement;
  movingPacket: HTMLElement;
  packetCards: HTMLElement[];
  sourceCards: HTMLElement[];
}

export interface CreateShuffleTimelineOptions {
  elements: MotionElements;
  packetPlan: ShufflePacketPlan[];
  durationScale: number;
  reducedMotion: boolean;
  onStart?: () => void;
  onComplete?: () => void;
}

export interface HinduShuffleHandle {
  play: () => void;
  reset: () => void;
}

export type ElementRef<T extends HTMLElement = HTMLDivElement> = RefObject<T>;
