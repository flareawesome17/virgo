'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAudioControls, useAudioProgress } from '@/components/media/audio-playback';
import { clock } from '@/components/media/media-labels';
import { cn } from '@/lib/utils';

/**
 * How tall the bar is, on the document root while it shows and gone when it
 * does not.
 *
 * The bar takes its own row at the foot of the main column, so a page never
 * needs this: its last rows end above the bar. It is for what floats over
 * the page from the bottom edge, the docked film for one, which adds
 * `var(--audio-dock-height, 0px)` to its bottom offset to sit above the bar.
 */
export const AUDIO_DOCK_HEIGHT_VAR = '--audio-dock-height';

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-background/60';

/**
 * What is playing, wherever you are: one dark bar along the foot of the
 * main column.
 *
 * The app's inverted card, as the phone's dock is: there is one thing
 * playing, and it is the one thing on the page drawn this way. It was a
 * floating card over the album's Audio view, and went when you left it.
 *
 * `floating` pins it to the window instead, for an album list drawn with no
 * shell around it.
 */
export function AudioDock({ floating = false }: { floating?: boolean }) {
  const { current } = useAudioControls();
  if (!current) return null;
  return <Bar floating={floating} />;
}

function Bar({ floating }: { floating: boolean }) {
  const audio = useAudioControls();
  const { position, duration, seekTo } = useAudioProgress();
  const barRef = useRef<HTMLElement>(null);

  // Measured rather than written down: the bar is as tall as its type and
  // its padding make it, and no number kept in another file would stay right.
  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    if (!bar) return;
    const publish = () => root.style.setProperty(AUDIO_DOCK_HEIGHT_VAR, `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty(AUDIO_DOCK_HEIGHT_VAR);
    };
  }, []);

  const file = audio.current;
  if (!file) return null;
  const repeatLabel = audio.repeat === 'off' ? 'Repeat off' : `Repeat ${audio.repeat}`;

  return (
    <aside
      ref={barRef}
      aria-label="Now playing"
      className={cn(
        'flex shrink-0 items-center gap-3 bg-foreground px-3 py-2.5 text-background sm:gap-4 sm:px-5',
        floating && 'fixed inset-x-0 bottom-0 z-40',
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <DockButton label="Previous recording" onClick={audio.previous}>
          <SkipBack size={18} />
        </DockButton>
        <button
          type="button"
          onClick={audio.toggle}
          aria-label={audio.playing ? 'Pause' : 'Play'}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full bg-background text-foreground transition-transform active:scale-95',
            FOCUS,
          )}
        >
          {audio.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </button>
        <DockButton label="Next recording" onClick={audio.next}>
          <SkipForward size={18} />
        </DockButton>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2.5">
          <p className="truncate text-sm font-semibold">{file.mediaTitle || file.originalName}</p>
          <p className="hidden max-w-[40%] shrink-0 truncate text-xs text-background/65 sm:block">
            {audio.albumName}
          </p>
          <span className="flex-1" />
          <p className="shrink-0 text-xs tabular-nums text-background/65">
            {clock(position)} of {clock(duration)}
          </p>
        </div>
        <Line label="Audio position" value={position} max={duration} step={0.1} onChange={seekTo} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <select
          value={audio.rate}
          onChange={(event) => audio.setRate(Number(event.target.value))}
          aria-label="Playback speed"
          className={cn(
            'hidden h-7 cursor-pointer appearance-none rounded-full bg-background/[0.12] px-2.5 text-center text-xs font-semibold hover:bg-background/20 md:block',
            FOCUS,
          )}
        >
          {SPEEDS.map((value) => (
            // The list a select opens is the system's, on the page's colours.
            <option key={value} value={value} className="bg-card text-card-foreground">
              {value}× speed
            </option>
          ))}
        </select>
        <DockButton
          label="Shuffle"
          pressed={audio.shuffle}
          onClick={() => audio.setShuffle(!audio.shuffle)}
          className="hidden sm:grid"
        >
          <Shuffle size={17} />
        </DockButton>
        <DockButton
          label={repeatLabel}
          on={audio.repeat !== 'off'}
          onClick={audio.cycleRepeat}
          className="hidden sm:grid"
        >
          {audio.repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
        </DockButton>
        {/* The slider is there from the keyboard and under the pointer; at
            rest the bar shows the one glyph. */}
        <div className="group/volume hidden items-center md:flex">
          <DockButton label={audio.muted ? 'Unmute' : 'Mute'} onClick={() => audio.setMuted(!audio.muted)}>
            {audio.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </DockButton>
          <Line
            label="Volume"
            value={audio.volume}
            max={1}
            step={0.01}
            onChange={audio.setVolume}
            className="w-0 opacity-0 transition-[width,opacity,margin] duration-200 group-focus-within/volume:mx-1.5 group-focus-within/volume:w-20 group-focus-within/volume:opacity-100 group-hover/volume:mx-1.5 group-hover/volume:w-20 group-hover/volume:opacity-100 motion-reduce:transition-none"
          />
        </div>
        {/* The one control never hidden on a narrow window: every other one
            here is a refinement, and this is the way out of the bar. */}
        <DockButton label="Stop playing" onClick={audio.stop}>
          <X size={18} />
        </DockButton>
      </div>
    </aside>
  );
}

function DockButton({
  label,
  onClick,
  pressed,
  on = false,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  /** A switch, said as one to a screen reader. */
  pressed?: boolean;
  /** Lit, for a control whose label already says what it is set to. */
  on?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const lit = on || !!pressed;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-[10px] transition-colors',
        lit
          ? 'bg-background/[0.16] text-background'
          : 'text-background/70 hover:bg-background/10 hover:text-background',
        FOCUS,
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A thin line that is also a slider: how far through, or how loud.
 *
 * The line is drawn; the slider is the browser's own, laid over it and
 * transparent, so the keyboard, a drag and a screen reader all get a real
 * range and the bar gets a line in its own colours. The app's other range
 * styling is written for a surface that is dark in both themes, and this bar
 * is the inverted card: cream, in the dark theme.
 */
function Line({
  label,
  value,
  max,
  step,
  onChange,
  className,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className={cn('relative block h-1', className)}>
      <input
        type="range"
        min={0}
        max={Math.max(max, 0)}
        step={step}
        value={Math.min(value, max || 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="peer absolute inset-x-0 -top-2 z-10 h-5 w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-full bg-background/20 peer-focus-visible:ring-2 peer-focus-visible:ring-background/60"
      >
        {/* The dark palette's accent in either theme: the lighter terracotta
            is the one that reads, on the dark bar and on the cream one. */}
        <span className="dark block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
