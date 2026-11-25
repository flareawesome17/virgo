'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type StoredFile } from '@/api';
import { pauseFilms, registerAudioPause } from '@/components/media/media-focus';

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * What is playing and how to change it, without how far through it is.
 *
 * The position moves several times a second, and every reader of one context
 * would redraw with it. The album's list only wants to know which recording
 * is playing and to start another, so it reads this; the bar reads the
 * position as well (useAudioProgress). The phone splits its provider the
 * same way.
 */
export interface AudioControls {
  queue: StoredFile[];
  current: StoredFile | null;
  /** The album the queue came from: the bar is drawn on pages that are not it. */
  albumName: string;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  rate: number;
  volume: number;
  muted: boolean;
  /** Hands over a list and starts one of its recordings. */
  playQueue: (files: StoredFile[], index: number, albumName: string) => void;
  /** The list that is playing has changed (more of it loaded): keep in step. */
  syncQueue: (files: StoredFile[], albumName: string) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  setShuffle: (enabled: boolean) => void;
  cycleRepeat: () => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  stop: () => void;
}

export interface AudioProgress {
  position: number;
  duration: number;
  seekTo: (seconds: number) => void;
}

/** A no-op fallback, so a reader outside the provider does nothing rather
 *  than throwing. The album's list checks useAudioHosted and brings its own. */
const FALLBACK: AudioControls = {
  queue: [],
  current: null,
  albumName: '',
  playing: false,
  shuffle: false,
  repeat: 'off',
  rate: 1,
  volume: 1,
  muted: false,
  playQueue: () => {},
  syncQueue: () => {},
  toggle: () => {},
  next: () => {},
  previous: () => {},
  setShuffle: () => {},
  cycleRepeat: () => {},
  setRate: () => {},
  setVolume: () => {},
  setMuted: () => {},
  stop: () => {},
};

const ControlsContext = createContext<AudioControls>(FALLBACK);
const ProgressContext = createContext<AudioProgress>({ position: 0, duration: 0, seekTo: () => {} });
const HostedContext = createContext(false);

/**
 * Which recording is playing, for the whole app rather than for one album.
 *
 * The player used to live inside the album's Audio view, so a recording was
 * tied to that page: leaving the album stopped it mid-sentence. Held here,
 * above the pages, the one `<audio>` element outlives them, and AudioDock
 * draws what is playing along the foot of every page. The album's list hands
 * its recordings over (playQueue) and goes back to being a list.
 *
 * Beside VideoPlaybackProvider in purpose, and the phone's AlbumAudioProvider
 * in shape: the same names, so the two apps stay one design.
 */
export function AudioPlaybackProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // The recording the element holds. Its address may be signed again when the
  // album is fetched again, and a new address for the same recording is not a
  // reason to start it over.
  const loadedKey = useRef<string | null>(null);
  const [queue, setQueue] = useState<StoredFile[]>([]);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [albumName, setAlbumName] = useState('Virgo album');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const currentIndex = currentKey ? queue.findIndex((file) => file.key === currentKey) : -1;
  const current = currentIndex >= 0 ? queue[currentIndex] : null;

  const playAt = useCallback(
    (index: number) => {
      const next = queue[index];
      if (!next?.url) return;
      setCurrentKey(next.key);
      setPlaying(true);
    },
    [queue],
  );

  const playQueue = useCallback((files: StoredFile[], index: number, name: string) => {
    const file = files[index];
    if (!file?.url) return;
    setQueue(files);
    setAlbumName(name);
    setCurrentKey(file.key);
    setPlaying(true);
  }, []);

  const syncQueue = useCallback((files: StoredFile[], name: string) => {
    setQueue(files);
    setAlbumName(name);
  }, []);

  const nextIndex = useCallback(() => {
    if (queue.length === 0) return -1;
    if (shuffle && queue.length > 1) {
      let next = currentIndex;
      while (next === currentIndex) next = Math.floor(Math.random() * queue.length);
      return next;
    }
    if (currentIndex < queue.length - 1) return currentIndex + 1;
    return repeat === 'all' ? 0 : -1;
  }, [currentIndex, queue.length, repeat, shuffle]);

  /**
   * Puts the bar away.
   *
   * Pausing the element as well as clearing the recording matters: the bar is
   * drawn on `current`, and an element left playing with nothing drawn for it
   * is sound with no way to stop it.
   */
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    loadedKey.current = null;
    setPlaying(false);
    setCurrentKey(null);
    setQueue([]);
    setPosition(0);
    setDuration(0);
  }, []);

  const skipNext = useCallback(() => {
    const next = nextIndex();
    if (next >= 0) playAt(next);
    else setPlaying(false);
  }, [nextIndex, playAt]);

  const skipPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    playAt(currentIndex <= 0 ? queue.length - 1 : currentIndex - 1);
  }, [currentIndex, playAt, queue.length]);

  const toggle = useCallback(() => setPlaying((value) => !value), []);
  const cycleRepeat = useCallback(
    () => setRepeat((value) => (value === 'off' ? 'all' : value === 'all' ? 'one' : 'off')),
    [],
  );
  const seekTo = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setPosition(seconds);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current?.url) return;
    if (loadedKey.current !== current.key) {
      loadedKey.current = current.key;
      audio.src = current.url;
      audio.load();
    }
    audio.playbackRate = rate;
    audio.volume = volume;
    audio.muted = muted;
    if (playing) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [current, muted, playing, rate, volume]);

  // So a film starting can pause this (media-focus).
  useEffect(() => {
    registerAudioPause(() => setPlaying(false));
    return () => registerAudioPause(null);
  }, []);

  // The provider goes at sign-out, and takes the sound with it.
  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  // The system's media keys and lock screen, only while a recording is up:
  // held all the time, they would take the keys away from a film.
  useEffect(() => {
    if (!current || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: current.mediaTitle || current.originalName,
      artist: current.mediaArtist || undefined,
      album: albumName,
    });
    session.setActionHandler('play', () => setPlaying(true));
    session.setActionHandler('pause', () => setPlaying(false));
    session.setActionHandler('previoustrack', skipPrevious);
    session.setActionHandler('nexttrack', skipNext);
    session.setActionHandler('seekbackward', (event) => {
      if (audioRef.current) audioRef.current.currentTime -= event.seekOffset ?? 15;
    });
    session.setActionHandler('seekforward', (event) => {
      if (audioRef.current) audioRef.current.currentTime += event.seekOffset ?? 15;
    });
    return () => {
      for (const action of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
      ] as MediaSessionAction[]) {
        session.setActionHandler(action, null);
      }
      session.metadata = null;
    };
  }, [albumName, current, skipNext, skipPrevious]);

  const controls = useMemo<AudioControls>(
    () => ({
      queue,
      current,
      albumName,
      playing,
      shuffle,
      repeat,
      rate,
      volume,
      muted,
      playQueue,
      syncQueue,
      toggle,
      next: skipNext,
      previous: skipPrevious,
      setShuffle,
      cycleRepeat,
      setRate,
      setVolume,
      setMuted,
      stop,
    }),
    [
      queue,
      current,
      albumName,
      playing,
      shuffle,
      repeat,
      rate,
      volume,
      muted,
      playQueue,
      syncQueue,
      toggle,
      skipNext,
      skipPrevious,
      cycleRepeat,
      stop,
    ],
  );
  const progress = useMemo<AudioProgress>(
    () => ({ position, duration, seekTo }),
    [position, duration, seekTo],
  );

  return (
    <HostedContext.Provider value>
      <ControlsContext.Provider value={controls}>
        <ProgressContext.Provider value={progress}>
          {children}
          <audio
            ref={audioRef}
            onPlay={() => {
              setPlaying(true);
              // One at a time: a docked film kept playing under the recording.
              pauseFilms();
            }}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
            onEnded={() => {
              if (repeat === 'one' && audioRef.current) {
                audioRef.current.currentTime = 0;
                void audioRef.current.play();
              } else skipNext();
            }}
          />
        </ProgressContext.Provider>
      </ControlsContext.Provider>
    </HostedContext.Provider>
  );
}

/** What is playing and how to change it. See AudioControls. */
export function useAudioControls(): AudioControls {
  return useContext(ControlsContext);
}

/** How far through it is: for the bar, which moves with it. */
export function useAudioProgress(): AudioProgress {
  return useContext(ProgressContext);
}

/** Whether a provider is above: the shell's, on every signed-in page. */
export function useAudioHosted(): boolean {
  return useContext(HostedContext);
}
