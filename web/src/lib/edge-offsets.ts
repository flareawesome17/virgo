'use client';

import { useCallback, useEffect, useRef } from 'react';

/** Height of the chat composer row (+ gap), published for floating UI to sit above. */
export const COMPOSER_OFFSET_VAR = '--composer-offset';
export const MINI_PLAYER_VAR = '--mini-player-offset';
/**
 * Height of the recordings bar, which runs under the whole page while one
 * plays (components/media/audio-dock.tsx sets it). The film's corner player
 * and the composer both sit on top of it, so it adds to whichever is taller.
 */
export const AUDIO_DOCK_VAR = '--audio-dock-height';
const GAP_PX = 12;

/** CSS length: the bottom edge floating UI must stay above. */
export function dockFloorCss(): string {
  return `calc(max(var(${MINI_PLAYER_VAR}, 0px), var(${COMPOSER_OFFSET_VAR}, 0px)) + var(${AUDIO_DOCK_VAR}, 0px) + env(safe-area-inset-bottom, 0px))`;
}

/** Callback ref: measures the element and publishes its height as --composer-offset. */
export function usePublishComposerOffset<T extends HTMLElement>() {
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(
    () => () => {
      observer.current?.disconnect();
      document.documentElement.style.removeProperty(COMPOSER_OFFSET_VAR);
    },
    [],
  );
  return useCallback((el: T | null) => {
    observer.current?.disconnect();
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty(COMPOSER_OFFSET_VAR);
      return;
    }
    const publish = () => root.style.setProperty(COMPOSER_OFFSET_VAR, `${el.offsetHeight + GAP_PX}px`);
    publish();
    observer.current = new ResizeObserver(publish);
    observer.current.observe(el);
  }, []);
}
