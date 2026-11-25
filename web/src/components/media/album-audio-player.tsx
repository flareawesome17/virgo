'use client';

import { useEffect, useMemo } from 'react';
import { Download, Heart, Music, Play, Shuffle } from 'lucide-react';
import { type StoredFile } from '@/api';
import { AudioDock } from '@/components/media/audio-dock';
import {
  AudioPlaybackProvider,
  useAudioControls,
  useAudioHosted,
} from '@/components/media/audio-playback';
import { clock, recordedLabel, shortDayTitle } from '@/components/media/media-labels';
import { CARD } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { downloadHref } from '@/lib/desktop';
import { groupByDay } from '@/lib/media-days';
import { cn } from '@/lib/utils';

interface Props {
  files: StoredFile[];
  albumName: string;
  visible: boolean;
  isLoading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/**
 * An album's recordings.
 *
 * It was the list and the player in one, so the sound belonged to this page
 * and stopped with it. It is the list now: it hands its recordings to the
 * player held above the pages (AudioPlaybackProvider), and what is playing
 * is drawn by AudioDock along the foot of every page.
 *
 * Drawn somewhere with no player above it, it brings its own and pins the
 * bar to the window, so the list always has something to play through.
 */
export function AlbumAudioPlayer(props: Props) {
  const hosted = useAudioHosted();
  if (hosted) return <Recordings {...props} />;
  return (
    <AudioPlaybackProvider>
      <Recordings {...props} underBar />
      <AudioDock floating />
    </AudioPlaybackProvider>
  );
}

function Recordings({
  files,
  albumName,
  visible,
  isLoading,
  hasMore,
  loadingMore,
  onLoadMore,
  underBar = false,
}: Props & {
  /** The bar is pinned over the page rather than set under it: leave it room. */
  underBar?: boolean;
}) {
  const {
    current,
    queue,
    albumName: playingFrom,
    playing,
    shuffle,
    playQueue,
    syncQueue,
    toggle,
    setShuffle,
  } = useAudioControls();

  // The recording that is playing, when it is one of these: the player may
  // be holding another album's.
  const currentKey = current?.key ?? null;
  const activeKey = useMemo(
    () => (currentKey && files.some((file) => file.key === currentKey) ? currentKey : null),
    [currentKey, files],
  );

  // The queue follows this list while it is the one playing, so "Load more
  // tracks" adds to what comes next rather than to a list the player has
  // already stopped reading. The album's name too: it can arrive after the
  // first recording has been started.
  useEffect(() => {
    if (activeKey && (queue !== files || playingFrom !== albumName)) syncQueue(files, albumName);
  }, [activeKey, albumName, files, playingFrom, queue, syncQueue]);

  const days = useMemo(() => groupByDay(files), [files]);

  if (!visible) return null;

  const playAll = () => {
    const first = files.findIndex((file) => !!file.url);
    if (first >= 0) playQueue(files, first, albumName);
  };

  return (
    <section
      aria-label="Album audio"
      className={cn('flex w-full flex-col gap-3', underBar ? 'pb-[calc(2.5rem+var(--audio-dock-height,0px))]' : 'pb-10')}
    >
      <style href="recording-bars" precedence="default">
        {'@keyframes recording-bar { from { transform: scaleY(0.4); } to { transform: scaleY(1); } }'}
      </style>
      {isLoading && files.length === 0 ? (
        <div className="space-y-3" aria-label="Loading audio">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[60px] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="py-24 text-center">
          <Music size={36} strokeWidth={1.5} className="mx-auto text-muted-foreground" />
          <h2 className="mt-5 text-lg font-semibold tracking-tight">No audio in this album</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload a recording or finished track to begin a listening queue.
          </p>
        </div>
      ) : (
        <>
          {/* Dark, not terracotta: the page's one filled action is Upload. */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={playAll}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-foreground pl-2.5 pr-3.5 text-sm font-semibold text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Play size={15} fill="currentColor" aria-hidden />
              Play all
            </button>
            <button
              type="button"
              onClick={() => setShuffle(!shuffle)}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              title="Shuffle"
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-[10px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                shuffle ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground hover:bg-muted/70',
              )}
            >
              <Shuffle size={16} strokeWidth={shuffle ? 2.5 : 2} />
            </button>
          </div>

          {days.map((day) => {
            const headingId = `recordings-${day.key}-${day.start}`;
            return (
              <section key={headingId} aria-labelledby={headingId}>
                <header className="flex items-baseline gap-2 pb-2.5 pt-1">
                  <h2 id={headingId} className="text-[15px] font-bold leading-5">
                    {shortDayTitle(day.key)}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {day.items.length.toLocaleString()} {day.items.length === 1 ? 'recording' : 'recordings'}
                  </p>
                </header>
                <ol className={cn(CARD, 'overflow-hidden')}>
                  {day.items.map((file, offset) => {
                    const index = day.start + offset;
                    const active = file.key === activeKey;
                    return (
                      <Row
                        key={file.key}
                        file={file}
                        number={index + 1}
                        first={offset === 0}
                        active={active}
                        playing={active && playing}
                        onPlay={() => {
                          if (active) toggle();
                          else playQueue(files, index, albumName);
                        }}
                      />
                    );
                  })}
                </ol>
              </section>
            );
          })}

          {hasMore && (
            <div className="pt-4 text-center">
              <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
                {loadingMore ? 'Loading tracks…' : 'Load more tracks'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One recording: its place in the list, its name, when it was recorded, how
 * long it is. The same row the phone draws.
 *
 * The row plays and the arrow downloads, side by side: the download was a
 * link inside the row's own button, which is not something a page may hold.
 */
function Row({
  file,
  number,
  first,
  active,
  playing,
  onPlay,
}: {
  file: StoredFile;
  /** Its place in the whole list, shown while it is not the one playing. */
  number: number;
  first: boolean;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  const name = file.mediaTitle || file.originalName;
  return (
    <li
      className={cn(
        'flex min-h-[60px] items-center gap-1 pl-4 pr-3',
        !first && 'border-t border-border/40',
        active && 'bg-primary/[0.06]',
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-3.5 self-stretch py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <span className="flex w-5 shrink-0 justify-center text-sm font-semibold tabular-nums text-muted-foreground">
          {active ? <PlayingBars playing={playing} /> : number}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-semibold', active && 'text-primary')}>{name}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {file.mediaArtist || recordedLabel(file)}
          </span>
        </span>
        {file.picked && (
          <Heart
            size={15}
            role="img"
            aria-label="Picked by your client"
            className="shrink-0 fill-primary text-primary"
          />
        )}
        <span className="min-w-11 shrink-0 whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-secondary-foreground">
          {file.durationMs
            ? clock(file.durationMs / 1000)
            : file.processingStatus === 'pending'
              ? 'Indexing'
              : '--:--'}
        </span>
      </button>
      {file.capabilities.download && file.downloadUrl ? (
        <a
          // Marked, or the desktop app sends it to the browser.
          href={downloadHref(file.downloadUrl)}
          aria-label={`Download ${name}`}
          className="grid size-8 shrink-0 place-items-center rounded-[10px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Download size={16} />
        </a>
      ) : (
        // Its place is kept, so the lengths stay in one column down the card.
        <span aria-hidden className="size-8 shrink-0" />
      )}
    </li>
  );
}

// Each bar's height at rest, and its own pace while it moves: begun part of
// the way through, so the three are never level. Whole class names, because
// Tailwind only writes the ones it can read in the source.
const BARS = [
  {
    rest: 'h-2',
    still: 'motion-reduce:h-2',
    moving: 'animate-[recording-bar_460ms_ease-in-out_-120ms_infinite_alternate]',
  },
  {
    rest: 'h-4',
    still: 'motion-reduce:h-4',
    moving: 'animate-[recording-bar_330ms_ease-in-out_-290ms_infinite_alternate]',
  },
  {
    rest: 'h-[11px]',
    still: 'motion-reduce:h-[11px]',
    moving: 'animate-[recording-bar_570ms_ease-in-out_-400ms_infinite_alternate]',
  },
];

/**
 * The three bars beside the recording that is playing.
 *
 * They stop when playback stops: a row that is merely chosen should not look
 * like a row that is making sound.
 */
function PlayingBars({ playing }: { playing: boolean }) {
  return (
    <span role="img" aria-label={playing ? 'Playing' : 'Paused'} className="flex h-4 w-5 items-end justify-center gap-[2px]">
      {BARS.map((bar) => (
        <span
          key={bar.moving}
          className={cn(
            'w-[3px] origin-bottom rounded-[2px] bg-primary',
            playing ? ['h-4', bar.moving, bar.still, 'motion-reduce:animate-none'] : bar.rest,
          )}
        />
      ))}
    </span>
  );
}
