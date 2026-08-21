import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import type { StoredFile } from "@/src/api";

type RepeatMode = "off" | "all" | "one";

interface AlbumAudioContextValue {
  queue: StoredFile[];
  current: StoredFile | null;
  currentIndex: number;
  playing: boolean;
  /**
   * The track is chosen but not yet audible — still loading, or rebuffering
   * after a stall. A screen that ignores this draws a playing state over
   * silence, which reads as the app being broken rather than the network
   * being slow.
   */
  loading: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  rate: number;
  playQueue: (
    files: StoredFile[],
    index: number,
    albumName: string,
    artworkUrl?: string | null,
  ) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (seconds: number) => void;
  seekBy: (seconds: number) => void;
  setShuffle: (enabled: boolean) => void;
  cycleRepeat: () => void;
  setRate: (rate: number) => void;
  stop: () => void;
}

const AlbumAudioContext = createContext<AlbumAudioContextValue | null>(null);

type RuntimeLockScreenPlayer = {
  setActiveForLockScreen?: (
    active: boolean,
    metadata?: {
      title: string;
      artist?: string;
      albumTitle?: string;
      artworkUrl?: string;
    },
    options?: { showSeekBackward?: boolean; showSeekForward?: boolean },
  ) => void;
  clearLockScreenControls?: () => void;
};

/**
 * Expo Go can bundle an older native expo-audio module than the installed JS
 * package. Its TypeScript surface includes lock-screen methods that are absent
 * at runtime, so every native-only call must be capability checked.
 */
function lockScreenPlayer(player: unknown): RuntimeLockScreenPlayer {
  return player as RuntimeLockScreenPlayer;
}

function clearLockScreen(player: unknown): void {
  const runtime = lockScreenPlayer(player);
  if (typeof runtime.clearLockScreenControls === "function") {
    runtime.clearLockScreenControls();
  } else if (typeof runtime.setActiveForLockScreen === "function") {
    runtime.setActiveForLockScreen(false);
  }
}

export function AlbumAudioProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, {
    updateInterval: 250,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<StoredFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [albumName, setAlbumName] = useState("Virgo album");
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [rate, setRateState] = useState(1);
  const finishing = useRef(false);
  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
    return () => clearLockScreen(player);
  }, [player]);

  const activate = useCallback(
    (file: StoredFile, index: number) => {
      if (!file.url) return;
      player.replace({ uri: file.url });
      player.setPlaybackRate(rate);
      const runtime = lockScreenPlayer(player);
      if (typeof runtime.setActiveForLockScreen === "function") {
        runtime.setActiveForLockScreen(
          true,
          {
            title: file.mediaTitle || file.originalName,
            artist: file.mediaArtist || undefined,
            albumTitle: albumName,
            artworkUrl: artworkUrl || undefined,
          },
          { showSeekBackward: true, showSeekForward: true },
        );
      }
      setCurrentIndex(index);
      player.play();
    },
    [albumName, artworkUrl, player, rate],
  );

  const playQueue = useCallback(
    (
      files: StoredFile[],
      index: number,
      nextAlbumName: string,
      nextArtwork?: string | null,
    ) => {
      setQueue(files);
      setAlbumName(nextAlbumName);
      setArtworkUrl(nextArtwork ?? null);
      const file = files[index];
      if (!file?.url) return;
      player.replace({ uri: file.url });
      player.setPlaybackRate(rate);
      const runtime = lockScreenPlayer(player);
      if (typeof runtime.setActiveForLockScreen === "function") {
        runtime.setActiveForLockScreen(
          true,
          {
            title: file.mediaTitle || file.originalName,
            artist: file.mediaArtist || undefined,
            albumTitle: nextAlbumName,
            artworkUrl: nextArtwork || undefined,
          },
          { showSeekBackward: true, showSeekForward: true },
        );
      }
      setCurrentIndex(index);
      player.play();
    },
    [player, rate],
  );

  const next = useCallback(() => {
    if (!queue.length) return;
    let index: number;
    if (shuffle && queue.length > 1) {
      index = currentIndex;
      while (index === currentIndex)
        index = Math.floor(Math.random() * queue.length);
    } else if (currentIndex < queue.length - 1) index = currentIndex + 1;
    else if (repeat === "all") index = 0;
    else {
      player.pause();
      return;
    }
    activate(queue[index], index);
  }, [activate, currentIndex, player, queue, repeat, shuffle]);

  const previous = useCallback(() => {
    if (!queue.length) return;
    if (status.currentTime > 3) {
      player.seekTo(0);
      return;
    }
    const index = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    activate(queue[index], index);
  }, [activate, currentIndex, player, queue, status.currentTime]);

  useEffect(() => {
    if (!status.didJustFinish || finishing.current) return;
    finishing.current = true;
    if (repeat === "one") {
      player.seekTo(0);
      player.play();
    } else next();
    const timer = setTimeout(() => {
      finishing.current = false;
    }, 300);
    return () => clearTimeout(timer);
  }, [next, player, repeat, status.didJustFinish]);

  const setRate = useCallback(
    (value: number) => {
      setRateState(value);
      player.setPlaybackRate(value);
    },
    [player],
  );
  const stop = useCallback(() => {
    player.pause();
    clearLockScreen(player);
    setCurrentIndex(-1);
    setQueue([]);
  }, [player]);

  const value = useMemo<AlbumAudioContextValue>(
    () => ({
      queue,
      current,
      currentIndex,
      playing: status.playing,
      loading:
        currentIndex >= 0 &&
        (!status.isLoaded || (status.isBuffering && !status.playing)),
      position: status.currentTime,
      duration: status.duration,
      shuffle,
      repeat,
      rate,
      playQueue,
      toggle: () => (status.playing ? player.pause() : player.play()),
      next,
      previous,
      seekTo: (seconds) =>
        player.seekTo(
          Math.max(0, Math.min(seconds, status.duration || seconds)),
        ),
      seekBy: (seconds) =>
        player.seekTo(Math.max(0, status.currentTime + seconds)),
      setShuffle,
      cycleRepeat: () =>
        setRepeat((value) =>
          value === "off" ? "all" : value === "all" ? "one" : "off",
        ),
      setRate,
      stop,
    }),
    [
      current,
      currentIndex,
      next,
      playQueue,
      player,
      previous,
      queue,
      rate,
      repeat,
      setRate,
      shuffle,
      status.currentTime,
      status.duration,
      status.isBuffering,
      status.isLoaded,
      status.playing,
      stop,
    ],
  );

  return (
    <AlbumAudioContext.Provider value={value}>
      {children}
    </AlbumAudioContext.Provider>
  );
}

export function useAlbumAudio() {
  const value = useContext(AlbumAudioContext);
  if (!value)
    throw new Error("useAlbumAudio must be used inside AlbumAudioProvider");
  return value;
}
