'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Music,
  Pause,
  Play,
  RefreshCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatBytes, type StoredFile } from '@/api';
import { Button } from '@/components/ui/button';

type RepeatMode = 'off' | 'all' | 'one';

export function AlbumAudioPlayer({
  files,
  albumName,
  visible,
  isLoading,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  files: StoredFile[];
  albumName: string;
  visible: boolean;
  isLoading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const currentIndex = files.findIndex((file) => file.key === currentKey);
  const current = currentIndex >= 0 ? files[currentIndex] : null;

  const playAt = useCallback(
    (index: number) => {
      const next = files[index];
      if (!next?.url) return;
      setCurrentKey(next.key);
      setPlaying(true);
    },
    [files],
  );

  const nextIndex = useCallback(() => {
    if (files.length === 0) return -1;
    if (shuffle && files.length > 1) {
      let next = currentIndex;
      while (next === currentIndex) next = Math.floor(Math.random() * files.length);
      return next;
    }
    if (currentIndex < files.length - 1) return currentIndex + 1;
    return repeat === 'all' ? 0 : -1;
  }, [currentIndex, files.length, repeat, shuffle]);

  /**
   * Puts the bar away.
   *
   * There was no way to do this. The bar appears the moment something plays
   * and is rendered on `current`, which nothing ever cleared — so it sat over
   * the bottom of the page for the rest of the visit, through every album and
   * every tab, and the only way out was a reload.
   *
   * Pausing the element as well as clearing the track matters: React unmounts
   * the `<audio>` on the next render, and an element that is removed while
   * playing can go on producing sound until it is garbage collected.
   */
  const closePlayer = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
    setCurrentKey(null);
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
    playAt(currentIndex <= 0 ? files.length - 1 : currentIndex - 1);
  }, [currentIndex, files.length, playAt]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current?.url) return;
    if (audio.src !== current.url) {
      audio.src = current.url;
      audio.load();
    }
    audio.playbackRate = rate;
    audio.volume = volume;
    audio.muted = muted;
    if (playing) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [current, muted, playing, rate, volume]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (current) {
      session.metadata = new MediaMetadata({
        title: current.mediaTitle || current.originalName,
        artist: current.mediaArtist || undefined,
        album: albumName,
      });
    }
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
    };
  }, [albumName, current, skipNext, skipPrevious]);

  const repeatLabel = repeat === 'off' ? 'Repeat off' : `Repeat ${repeat}`;
  const cycleRepeat = () =>
    setRepeat((value) => (value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'));
  const clock = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  };

  const rows = useMemo(
    () =>
      files.map((file, index) => {
        const active = file.key === currentKey;
        return (
          <li key={file.key} className="border-t border-[#d9cec5]/65 first:border-t-0 dark:border-white/[0.07]">
            <button
              type="button"
              onClick={() => {
                if (active) setPlaying((value) => !value);
                else playAt(index);
              }}
              className="group grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 px-1 py-4 text-left transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.995] sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_auto]"
            >
              <span className={`grid size-10 place-items-center rounded-full ${active ? 'bg-[#b66a40] text-white' : 'bg-[#e9dfd7] text-[#6f5d52] dark:bg-white/[0.07] dark:text-white/55'}`}>
                {active && playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-[-0.015em]">
                  {file.mediaTitle || file.originalName}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {file.mediaArtist || file.contentType?.split('/')[1]?.toUpperCase() || 'AUDIO'}
                </span>
              </span>
              <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                {file.durationMs ? clock(file.durationMs / 1000) : file.processingStatus === 'pending' ? 'Indexing' : '--:--'}
              </span>
              <span className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground lg:inline">{formatBytes(file.sizeBytes)}</span>
                {file.capabilities.download && file.downloadUrl && (
                  <a
                    href={file.downloadUrl}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Download ${file.originalName}`}
                    className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[#e9dfd7] hover:text-foreground dark:hover:bg-white/10"
                  >
                    <Download size={17} strokeWidth={1.5} />
                  </a>
                )}
              </span>
            </button>
          </li>
        );
      }),
    [currentKey, files, playAt, playing],
  );

  return (
    <>
      <audio
        ref={audioRef}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => {
          if (repeat === 'one' && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          } else skipNext();
        }}
      />

      {visible && (
        <section aria-label="Album audio" className="mx-auto w-full max-w-5xl pb-40">
          {isLoading && files.length === 0 ? (
            <div className="space-y-3" aria-label="Loading audio">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-[4.5rem] animate-pulse rounded-2xl bg-[#e9dfd7]/70 dark:bg-white/[0.05]" />
              ))}
            </div>
          ) : files.length === 0 ? (
            <div className="py-24 text-center">
              <Music size={36} strokeWidth={1.5} className="mx-auto text-[#9b877a]" />
              <h2 className="mt-5 text-lg font-semibold tracking-tight">No audio in this album</h2>
              <p className="mt-2 text-sm text-muted-foreground">Upload a recording or finished track to begin a listening queue.</p>
            </div>
          ) : (
            <>
              <ol>{rows}</ol>
              {hasMore && (
                <div className="mt-8 text-center">
                  <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
                    {loadingMore ? 'Loading tracks…' : 'Load more tracks'}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {current && (
        <aside className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-[1.65rem] bg-[#1b1816]/96 p-1.5 text-white shadow-[0_24px_70px_-28px_rgba(58,38,27,0.72)] backdrop-blur-xl sm:inset-x-6">
          <div className="rounded-[1.3rem] border border-white/[0.08] bg-[#211d1a] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-3">
              <button onClick={skipPrevious} aria-label="Previous track" className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/[0.08] hover:text-white"><SkipBack size={18} strokeWidth={1.5} /></button>
              <button onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'} className="grid size-11 place-items-center rounded-full bg-[#c17745] text-white transition-transform active:scale-95">
                {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button onClick={skipNext} aria-label="Next track" className="grid size-9 place-items-center rounded-full text-white/70 hover:bg-white/[0.08] hover:text-white"><SkipForward size={18} strokeWidth={1.5} /></button>

              <div className="min-w-0 flex-1 px-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm font-semibold">{current.mediaTitle || current.originalName}</p>
                  <p className="shrink-0 font-mono text-[10px] tabular-nums text-white/45">{clock(position)} / {clock(duration)}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 0)}
                  step={0.1}
                  value={Math.min(position, duration || 0)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (audioRef.current) audioRef.current.currentTime = next;
                    setPosition(next);
                  }}
                  aria-label="Audio position"
                  className="media-range mt-2 w-full"
                />
              </div>

              <button onClick={() => setShuffle((value) => !value)} aria-pressed={shuffle} aria-label="Shuffle" className={`hidden size-9 place-items-center rounded-full sm:grid ${shuffle ? 'bg-white/[0.12] text-[#d89566]' : 'text-white/45 hover:text-white'}`}><Shuffle size={17} strokeWidth={1.5} /></button>
              <button onClick={cycleRepeat} aria-label={repeatLabel} className={`hidden size-9 place-items-center rounded-full sm:grid ${repeat !== 'off' ? 'bg-white/[0.12] text-[#d89566]' : 'text-white/45 hover:text-white'}`}><RefreshCw size={17} strokeWidth={1.5} /></button>
              <select value={rate} onChange={(event) => setRate(Number(event.target.value))} aria-label="Playback speed" className="hidden rounded-full bg-white/[0.07] px-2 py-1 text-xs text-white outline-none md:block">
                {[0.5, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value} className="bg-[#211d1a]">{value}×</option>)}
              </select>
              <button onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'} className="hidden size-9 place-items-center text-white/55 md:grid">{muted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />}</button>
              <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" className="media-range hidden w-20 md:block" />

              {/* The only control with no `hidden` on it. Every other one here
                  drops away on a narrow screen because it is a refinement —
                  shuffle, speed, volume. Closing is the way out of a bar that
                  covers the bottom of the page, and a phone is exactly where
                  that matters most. */}
              <button
                onClick={closePlayer}
                aria-label="Close player"
                className="ml-1 grid size-9 shrink-0 place-items-center rounded-full text-white/45 hover:bg-white/[0.08] hover:text-white"
              >
                <X size={17} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
