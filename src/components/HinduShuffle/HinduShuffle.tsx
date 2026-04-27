import * as React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { clampVisibleCards, normalizeDurationScale, QUALITY_CONFIG } from './hinduShuffle.config';
import { createHinduShuffleTimeline, resetHinduShuffle } from './hinduShuffle.motion';
import { buildShufflePlan } from './hinduShuffle.sampler';
import type { HinduShuffleHandle, HinduShuffleProps, MotionElements, ShuffleQuality } from './hinduShuffle.types';
import './hinduShuffle.css';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

function resolveReducedMotion(value: HinduShuffleProps['reducedMotion'], prefersReduced: boolean): boolean {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return prefersReduced;
}

function resolveQuality(quality?: ShuffleQuality): ShuffleQuality {
  if (quality === 'low' || quality === 'medium' || quality === 'high') return quality;
  return 'medium';
}

export const HinduShuffle = forwardRef<HinduShuffleHandle, HinduShuffleProps>(function HinduShuffle(
  props,
  ref
) {
  const {
    autoPlay = false,
    cardBackUrl,
    cardFaceUrls = [],
    durationScale,
    onComplete,
    onStart,
    reducedMotion = 'auto',
  } = props;
  const quality = resolveQuality(props.quality);
  const visibleCards = clampVisibleCards(props.visibleCards, quality);
  const normalizedDurationScale = normalizeDurationScale(durationScale);
  const prefersReduced = usePrefersReducedMotion();
  const shouldReduceMotion = resolveReducedMotion(reducedMotion, prefersReduced);
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceDeckRef = useRef<HTMLDivElement>(null);
  const receiveStackRef = useRef<HTMLDivElement>(null);
  const movingPacketRef = useRef<HTMLDivElement>(null);
  const sourceCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const packetCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const timelineRef = useRef<ReturnType<typeof createHinduShuffleTimeline> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const cardIndexes = useMemo(
    () => Array.from({ length: visibleCards }, (_, index) => index),
    [visibleCards]
  );
  const packetIndexes = useMemo(
    () => Array.from({ length: QUALITY_CONFIG[quality].packetCardLimit }, (_, index) => index),
    [quality]
  );

  const getElements = useCallback((): MotionElements | null => {
    const root = rootRef.current;
    const sourceDeck = sourceDeckRef.current;
    const receiveStack = receiveStackRef.current;
    const movingPacket = movingPacketRef.current;
    if (!root || !sourceDeck || !receiveStack || !movingPacket) return null;

    return {
      root,
      sourceDeck,
      receiveStack,
      movingPacket,
      sourceCards: sourceCardRefs.current.filter(Boolean) as HTMLElement[],
      packetCards: packetCardRefs.current.filter(Boolean) as HTMLElement[],
    };
  }, []);

  const reset = useCallback(() => {
    timelineRef.current?.kill();
    timelineRef.current = null;
    const elements = getElements();
    if (elements) resetHinduShuffle(elements);
    setIsPlaying(false);
  }, [getElements]);

  const play = useCallback(() => {
    const elements = getElements();
    if (!elements || isPlaying) return;
    timelineRef.current?.kill();
    const packetPlan = buildShufflePlan({ quality });
    timelineRef.current = createHinduShuffleTimeline({
      elements,
      packetPlan,
      durationScale: normalizedDurationScale,
      reducedMotion: shouldReduceMotion,
      onStart: () => {
        setIsPlaying(true);
        onStart?.();
      },
      onComplete: () => {
        setIsPlaying(false);
        onComplete?.();
      },
    });
  }, [getElements, isPlaying, normalizedDurationScale, onComplete, onStart, quality, shouldReduceMotion]);

  useImperativeHandle(ref, () => ({ play, reset }), [play, reset]);

  useEffect(() => {
    const elements = getElements();
    if (elements) resetHinduShuffle(elements);
    return () => timelineRef.current?.kill();
  }, [getElements, quality, visibleCards]);

  useEffect(() => {
    if (!autoPlay) return;
    const id = window.setTimeout(play, 120);
    return () => window.clearTimeout(id);
  }, [autoPlay, play]);

  const cardStyle = cardBackUrl
    ? ({ '--hindu-card-back': `url("${cardBackUrl}")` } as React.CSSProperties)
    : undefined;

  return (
    <section
      className={`hinduShuffle hinduShuffle--${quality}`}
      data-reduced-motion={shouldReduceMotion ? 'true' : 'false'}
      ref={rootRef}
    >
      <div className="hinduShuffle__table" aria-hidden="true">
        <div className="hinduShuffle__shadow hinduShuffle__shadow--source" />
        <div className="hinduShuffle__shadow hinduShuffle__shadow--receive" />

        <div className="hinduShuffle__deck hinduShuffle__deck--source" ref={sourceDeckRef}>
          {cardIndexes.map(index => (
            <div
              className="hinduShuffle__card"
              key={`source-${index}`}
              ref={node => {
                sourceCardRefs.current[index] = node;
              }}
              style={cardStyle}
            >
              <div className="hinduShuffle__cardFace hinduShuffle__cardFace--back" />
            </div>
          ))}
        </div>

        <div className="hinduShuffle__deck hinduShuffle__deck--receive" ref={receiveStackRef}>
          {cardIndexes.map(index => (
            <div className="hinduShuffle__card hinduShuffle__card--received" key={`receive-${index}`} style={cardStyle}>
              <div className="hinduShuffle__cardFace hinduShuffle__cardFace--back" />
            </div>
          ))}
        </div>

        <div className="hinduShuffle__movingPacket" ref={movingPacketRef}>
          {packetIndexes.map(index => {
            const faceUrl = cardFaceUrls[index % Math.max(1, cardFaceUrls.length)];
            const faceStyle = faceUrl ? { backgroundImage: `url("${faceUrl}")` } : undefined;
            return (
              <div
                className="hinduShuffle__card hinduShuffle__card--packet"
                key={`packet-${index}`}
                ref={node => {
                  packetCardRefs.current[index] = node;
                }}
                style={cardStyle}
              >
                <div className="hinduShuffle__cardFace hinduShuffle__cardFace--back" />
                {faceUrl ? <div className="hinduShuffle__cardFace hinduShuffle__cardFace--front" style={faceStyle} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      <button
        aria-label={isPlaying ? 'カードシャッフル中' : 'ヒンズーシャッフルを開始'}
        className="hinduShuffle__button"
        disabled={isPlaying}
        onClick={play}
        type="button"
      >
        {isPlaying ? 'Shuffling...' : 'Shuffle'}
      </button>
    </section>
  );
});

export default HinduShuffle;
