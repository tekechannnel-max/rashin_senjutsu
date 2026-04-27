import { gsap } from 'gsap';
import type { CreateShuffleTimelineOptions, MotionElements, ShufflePacketPlan } from './hinduShuffle.types';

const SOURCE_CARD_STEP = {
  x: 1.7,
  y: -1.15,
  z: 1.55,
  rotateZ: 0.28,
};

function setCardDepth(cards: HTMLElement[], side: 'source' | 'receive'): void {
  const direction = side === 'source' ? 1 : -1;
  cards.forEach((card, index) => {
    gsap.set(card, {
      x: index * SOURCE_CARD_STEP.x * direction,
      y: index * SOURCE_CARD_STEP.y,
      z: index * SOURCE_CARD_STEP.z,
      rotateZ: index * SOURCE_CARD_STEP.rotateZ * direction,
      opacity: 1,
      scale: 1,
    });
  });
}

function setPacketCardDepth(packetCards: HTMLElement[], visibleCount: number): void {
  packetCards.forEach((card, index) => {
    const active = index < visibleCount;
    gsap.set(card, {
      display: active ? 'block' : 'none',
      x: index * 2.2,
      y: index * -1.55,
      z: index * 2.4,
      rotateZ: index * 0.35,
      opacity: active ? 1 : 0,
      scale: 1,
    });
  });
}

export function resetHinduShuffle(elements: MotionElements): void {
  gsap.killTweensOf([
    elements.root,
    elements.sourceDeck,
    elements.receiveStack,
    elements.movingPacket,
    ...elements.packetCards,
    ...elements.sourceCards,
  ]);
  elements.root.classList.remove('is-shuffling', 'is-complete', 'is-reduced-motion');
  elements.movingPacket.classList.remove('is-active');
  elements.receiveStack.classList.remove('is-catching');
  elements.sourceDeck.classList.remove('is-feeding');

  gsap.set(elements.sourceDeck, {
    x: 0,
    y: 0,
    z: 0,
    rotateX: 0,
    rotateY: -8,
    rotateZ: 0,
  });
  gsap.set(elements.receiveStack, {
    x: -112,
    y: 18,
    z: 0,
    rotateX: 0,
    rotateY: 9,
    rotateZ: -5,
  });
  gsap.set(elements.movingPacket, {
    x: 0,
    y: 0,
    z: 0,
    rotateX: 0,
    rotateY: -8,
    rotateZ: 0,
    opacity: 0,
    scale: 1,
  });
  setCardDepth(elements.sourceCards, 'source');
  setPacketCardDepth(elements.packetCards, elements.packetCards.length);
}

function applyReducedMotion(options: CreateShuffleTimelineOptions) {
  const { elements, onStart, onComplete } = options;
  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    onStart,
    onComplete,
  });

  tl.call(() => {
    elements.root.classList.add('is-shuffling', 'is-reduced-motion');
    elements.sourceDeck.classList.add('is-feeding');
    elements.receiveStack.classList.add('is-catching');
  });
  tl.to(elements.sourceDeck, { x: 8, rotateZ: 1, duration: 0.18 });
  tl.to(elements.receiveStack, { x: -96, rotateZ: -2, duration: 0.24 }, '<');
  tl.to(elements.movingPacket, { opacity: 0.85, x: -80, y: 10, duration: 0.2 }, '<');
  tl.to(elements.movingPacket, { opacity: 0, duration: 0.12 });
  tl.call(() => {
    elements.root.classList.remove('is-shuffling');
    elements.root.classList.add('is-complete');
    elements.movingPacket.classList.remove('is-active');
    elements.sourceDeck.classList.remove('is-feeding');
    elements.receiveStack.classList.remove('is-catching');
  });

  return tl;
}

function animatePacket(
  tl: gsap.core.Timeline,
  elements: MotionElements,
  packet: ShufflePacketPlan,
  durationScale: number
): void {
  const moveDuration = (packet.durationMs / 1000) * durationScale;
  const settleDuration = (packet.settleMs / 1000) * durationScale;
  const packetCards = elements.packetCards;
  const visibleSourceCards = elements.sourceCards.slice(0, Math.max(1, packet.visibleCount));

  tl.call(() => {
    elements.movingPacket.classList.add('is-active');
    elements.receiveStack.classList.remove('is-catching');
    elements.sourceDeck.classList.add('is-feeding');
    setPacketCardDepth(packetCards, packet.visibleCount);
  });

  tl.set(elements.movingPacket, {
    x: 0,
    y: 0,
    z: 8,
    rotateX: -2,
    rotateY: -8,
    rotateZ: 0,
    opacity: 1,
    scale: 1,
  });

  tl.to(visibleSourceCards, {
    x: '+=7',
    y: '-=3',
    z: '+=8',
    opacity: 0.82,
    duration: moveDuration * 0.34,
    stagger: 0.006,
    ease: 'power2.out',
  }, '<');

  tl.to(elements.sourceDeck, {
    x: 4,
    y: -1,
    rotateY: -10,
    rotateZ: 0.8,
    duration: moveDuration * 0.42,
    ease: 'power2.out',
  }, '<');

  tl.to(elements.movingPacket, {
    x: packet.x,
    y: packet.y,
    z: packet.z,
    rotateX: packet.rotateX,
    rotateY: packet.rotateY,
    rotateZ: packet.rotateZ,
    scale: 1.03,
    duration: moveDuration,
    ease: 'power3.inOut',
  }, '<');

  tl.call(() => {
    elements.receiveStack.classList.add('is-catching');
    elements.sourceDeck.classList.remove('is-feeding');
  }, undefined, `>-=${Math.min(0.05, moveDuration * 0.25)}`);

  tl.to(elements.movingPacket, {
    x: packet.x - 10,
    y: packet.y + 9,
    z: 8,
    rotateX: packet.rotateX * 0.28,
    rotateY: 4,
    rotateZ: packet.rotateZ * 0.42,
    scale: 0.99,
    duration: settleDuration,
    ease: 'back.out(1.8)',
  });

  tl.to(elements.receiveStack, {
    x: -112 + Math.min(20, packet.index * 1.6),
    y: 18 + Math.min(13, packet.index * 0.9),
    z: Math.min(28, packet.index * 1.7),
    rotateY: 9 - packet.index * 0.15,
    rotateZ: -5 + packet.index * 0.28,
    duration: settleDuration,
    ease: 'elastic.out(1, 0.72)',
  }, '<');

  tl.to(elements.movingPacket, {
    opacity: 0,
    z: -4,
    duration: Math.max(0.045, settleDuration * 0.55),
    ease: 'power1.out',
  });

  tl.set(visibleSourceCards, { opacity: 1 });
}

export function createHinduShuffleTimeline(options: CreateShuffleTimelineOptions): gsap.core.Timeline {
  const { elements, packetPlan, durationScale, reducedMotion, onStart, onComplete } = options;
  resetHinduShuffle(elements);

  if (reducedMotion) return applyReducedMotion(options);

  const tl = gsap.timeline({
    defaults: { force3D: true },
    onStart,
    onComplete,
  });

  tl.call(() => {
    elements.root.classList.add('is-shuffling');
    elements.root.classList.remove('is-complete');
    elements.sourceCards.forEach(card => card.classList.add('will-move'));
    elements.packetCards.forEach(card => card.classList.add('will-move'));
  });

  packetPlan.forEach(packet => animatePacket(tl, elements, packet, durationScale));

  tl.to(elements.sourceDeck, {
    x: 24,
    y: -6,
    z: -12,
    rotateY: -13,
    opacity: 0.58,
    duration: 0.22 * durationScale,
    ease: 'power2.out',
  });
  tl.to(elements.receiveStack, {
    x: -54,
    y: 5,
    z: 24,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    duration: 0.36 * durationScale,
    ease: 'back.out(1.4)',
  }, '<');
  tl.call(() => {
    elements.root.classList.remove('is-shuffling');
    elements.root.classList.add('is-complete');
    elements.movingPacket.classList.remove('is-active');
    elements.sourceDeck.classList.remove('is-feeding');
    elements.receiveStack.classList.remove('is-catching');
    elements.sourceCards.forEach(card => card.classList.remove('will-move'));
    elements.packetCards.forEach(card => card.classList.remove('will-move'));
  });

  return tl;
}
