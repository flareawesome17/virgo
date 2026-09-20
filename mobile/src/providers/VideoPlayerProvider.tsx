import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type StoredFile } from '@/src/api';

/**
 * How much of the screen the player is taking.
 *
 * `full` is the player as it has always been. `mini` is the docked strip at
 * the bottom, which exists so that leaving a film to look at something else
 * does not mean stopping it — the thing YouTube does when you swipe down.
 */
export type VideoMode = 'full' | 'mini';

interface VideoPlayerContextValue {
  current: StoredFile | null;
  /** The album's films, so the player can move through them in order. */
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

/**
 * The no-op fallback.
 *
 * A method called on a context must exist on the type, in the provider value
 * *and* here — a screen rendered outside the provider should do nothing rather
 * than crash on `undefined is not a function`.
 */
const FALLBACK: VideoPlayerContextValue = {
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

const VideoPlayerContext = createContext<VideoPlayerContextValue>(FALLBACK);

/**
 * Which film is playing, for the whole app rather than for one screen.
 *
 * The player used to be a Modal owned by the videos screen, so a film was
 * tied to that screen staying mounted: going back to the album stopped it,
 * and there was no way to keep watching while doing anything else.
 *
 * Holding it here means VideoSurface can render it above the navigator and
 * keep the same player instance alive across navigation — which is what makes
 * minimising possible at all. Unmounting to shrink would stop playback, so
 * `mode` changes how the player draws rather than whether it exists.
 */
export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<StoredFile | null>(null);
  const [queue, setQueue] = useState<StoredFile[]>([]);
  const [mode, setMode] = useState<VideoMode>('full');

  const open = useCallback((file: StoredFile, films: StoredFile[] = []) => {
    setCurrent(file);
    // Falls back to the file alone, so the player always has a queue to look
    // itself up in and `hasNext` is answerable without a special case.
    setQueue(films.length > 0 ? films : [file]);
    setMode('full');
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    setQueue([]);
    // Reset, so the next film opens full rather than inheriting `mini` from
    // whatever was closed last.
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
    <VideoPlayerContext.Provider value={value}>
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayback(): VideoPlayerContextValue {
  return useContext(VideoPlayerContext);
}
