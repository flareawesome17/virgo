'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type StoredFile } from '@/api';

/**
 * How much of the window the player is taking.
 *
 * `full` is the lightbox as it has always been. `mini` is the docked card in
 * the corner, which exists so leaving a film to look at something else does
 * not mean stopping it.
 */
export type VideoMode = 'full' | 'mini';

interface VideoPlaybackValue {
  current: StoredFile | null;
  queue: StoredFile[];
  mode: VideoMode;
  open: (file: StoredFile, queue?: StoredFile[]) => void;
  close: () => void;
  minimise: () => void;
  expand: () => void;
  next: () => void;
  previous: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** A no-op fallback, so a component rendered outside the provider does nothing
 *  rather than throwing on `undefined is not a function`. */
const FALLBACK: VideoPlaybackValue = {
  current: null,
  queue: [],
  mode: 'full',
  open: () => {},
  close: () => {},
  minimise: () => {},
  expand: () => {},
  next: () => {},
  previous: () => {},
  hasNext: false,
  hasPrevious: false,
};

const VideoPlaybackContext = createContext<VideoPlaybackValue>(FALLBACK);

/**
 * Which film is playing, for the whole app rather than for one lightbox.
 *
 * The player used to live inside MediaViewer, so a film was tied to that
 * lightbox being open: closing it stopped playback, and there was no way to
 * keep watching while doing anything else. Holding it here lets VideoSurface
 * render it above the app and keep the same `<video>` element alive across
 * navigation — which is what makes minimising possible at all.
 *
 * Mirrors mobile's VideoPlayerProvider deliberately. Same states, same names,
 * so the two players stay recognisably one design rather than drifting into
 * two.
 */
export function VideoPlaybackProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<StoredFile | null>(null);
  const [queue, setQueue] = useState<StoredFile[]>([]);
  const [mode, setMode] = useState<VideoMode>('full');

  const open = useCallback((file: StoredFile, films: StoredFile[] = []) => {
    setCurrent(file);
    setQueue(films.length > 0 ? films : [file]);
    setMode('full');
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    setQueue([]);
    // Reset, so the next film opens full rather than inheriting `mini`.
    setMode('full');
  }, []);

  const minimise = useCallback(() => setMode('mini'), []);
  const expand = useCallback(() => setMode('full'), []);

  const index = current ? queue.findIndex((f) => f.key === current.key) : -1;
  const hasNext = index >= 0 && index < queue.length - 1;
  const hasPrevious = index > 0;

  const next = useCallback(() => {
    if (hasNext) setCurrent(queue[index + 1]);
  }, [hasNext, index, queue]);

  const previous = useCallback(() => {
    if (hasPrevious) setCurrent(queue[index - 1]);
  }, [hasPrevious, index, queue]);

  const value = useMemo(
    () => ({
      current,
      queue,
      mode,
      open,
      close,
      minimise,
      expand,
      next,
      previous,
      hasNext,
      hasPrevious,
    }),
    [
      current,
      queue,
      mode,
      open,
      close,
      minimise,
      expand,
      next,
      previous,
      hasNext,
      hasPrevious,
    ],
  );

  return (
    <VideoPlaybackContext.Provider value={value}>
      {children}
    </VideoPlaybackContext.Provider>
  );
}

export function useVideoPlayback(): VideoPlaybackValue {
  return useContext(VideoPlaybackContext);
}
