'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { SkyEngine } from './engine';
import type { SkyVariant } from './sky-seed';
import type { FrameSource, SkyStats } from './types';

export type SkyCanvasProps = {
  /**
   * A MotionValue of `SkyFrame` (a `useTransform` over the chapters' progress),
   * or a getter (then call `invalidate()` on the engine when it changes). Keep
   * it stable: a new source rebuilds the engine.
   */
  frame: FrameSource;
  className?: string;
  variant?: SkyVariant | 'auto';
  /** Stop drawing while this element is out of view: the sky chapters' track. */
  sentinel?: RefObject<Element | null>;
  onStats?: (stats: SkyStats) => void;
  onFreeze?: () => void;
  /** A `MapLayer`, drawn under the canvas. */
  map?: ReactNode;
  /** `[data-sky-label]` elements, drawn over it. */
  labels?: ReactNode;
  /** Receives the engine, for `invalidate()` and `project()`. */
  engineRef?: RefObject<SkyEngine | null>;
};

/**
 * The sky stage: the map layers, one canvas and the labels, all driven by
 * one SkyEngine in one tick (storyboard §1.3). Fixed and full-viewport is up
 * to the caller: give it a parent that is never inside a transformed,
 * filtered or contained ancestor.
 *
 * Mount it only when the motion gate passes; reduced motion gets the static
 * SVG figures and the poster instead.
 */
export function SkyCanvas({ frame, className = '', variant = 'auto', sentinel, onStats, onFreeze, map, labels, engineRef }: SkyCanvasProps) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onStats, onFreeze });

  useEffect(() => {
    callbacks.current = { onStats, onFreeze };
  }, [onStats, onFreeze]);

  useEffect(() => {
    if (!root.current || !canvas.current) return;
    let e: SkyEngine;
    try {
      e = new SkyEngine({
        root: root.current,
        canvas: canvas.current,
        frame,
        variant,
        sentinel: sentinel?.current ?? null,
        onStats: (s) => callbacks.current.onStats?.(s),
        onFreeze: () => callbacks.current.onFreeze?.(),
      });
    } catch (error) {
      // No 2D canvas, or anything else: the sky is decoration, so the page carries on over the poster.
      console.error('SkyCanvas: the sky could not start', error);
      callbacks.current.onFreeze?.();
      return;
    }
    if (engineRef) engineRef.current = e;
    return () => {
      e.destroy();
      if (engineRef) engineRef.current = null;
    };
  }, [frame, variant, sentinel, engineRef]);

  return (
    <div ref={root} className={`pointer-events-none absolute inset-0 overflow-clip ${className}`} aria-hidden="true">
      {map}
      <canvas ref={canvas} className="absolute inset-0 block h-full w-full" />
      {labels}
    </div>
  );
}
