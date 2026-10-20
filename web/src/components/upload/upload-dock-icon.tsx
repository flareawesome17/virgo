'use client';

import { forwardRef, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { CheckCircle2, Upload, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMPOSER_OFFSET_VAR, MINI_PLAYER_VAR, dockFloorCss } from '@/lib/edge-offsets';
import {
  clampDockBottom,
  dockBounds,
  ringDash,
  nudge,
  type DockStatus,
} from './upload-dock-state';

export const DOCK_ICON_SIZE = 44;
const MARGIN = 16;
const TOP_INSET = 72;
const R = 19;

function px(name: string): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

interface Props {
  status: DockStatus;
  fraction: number;
  badge: { text: string; tone: 'neutral' | 'danger' } | null;
  label: string;
  /** Distance from the viewport bottom to the icon's bottom, or null for the default. */
  bottom: number | null;
  onBottomChange: (bottom: number, final: boolean) => void;
  onOpen: () => void;
  hidden: boolean;
}

/**
 * The minimised dock: a 44px round button on the right edge with a progress
 * ring, a files-left badge, and green-check or red-failed states. Drags
 * vertically (pointer or arrow keys) and stays above the chat composer.
 */
export const UploadDockIcon = forwardRef<HTMLButtonElement, Props>(function UploadDockIcon(
  { status, fraction, badge, label, bottom, onBottomChange, onOpen, hidden },
  ref,
) {
  const drag = useRef<{ startY: number; startBottom: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const failed = status === 'failed';
  const done = status === 'done';
  const ring = ringDash(done ? 1 : fraction, R);

  const bounds = () =>
    dockBounds({
      viewportHeight: window.innerHeight,
      size: DOCK_ICON_SIZE,
      floorOffset: Math.max(px(MINI_PLAYER_VAR), px(COMPOSER_OFFSET_VAR)),
      topInset: TOP_INSET,
      margin: MARGIN,
    });
  const currentBottom = (el: HTMLElement) => window.innerHeight - el.getBoundingClientRect().bottom;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startBottom: currentBottom(e.currentTarget), moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 4) return;
    d.moved = true;
    onBottomChange(clampDockBottom(d.startBottom - (e.clientY - d.startY), bounds()), false);
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    swallowClick.current = true;
    onBottomChange(clampDockBottom(d.startBottom - (e.clientY - d.startY), bounds()), true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const move = nudge(e.key, e.shiftKey);
    if (move === null) return;
    e.preventDefault();
    const b = bounds();
    const base = bottom ?? currentBottom(e.currentTarget);
    const next = move === 'floor' ? b.floor : move === 'ceiling' ? b.ceiling : base + move;
    onBottomChange(clampDockBottom(next, b), true);
  };

  const floor = dockFloorCss();
  const tone = failed ? 'text-destructive' : done ? 'text-success' : 'text-primary';

  return (
    <button
      ref={ref}
      type="button"
      id="upload-dock-icon"
      aria-label={label}
      aria-expanded={false}
      aria-controls="upload-dock-panel"
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      aria-describedby="upload-dock-hint"
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : 0}
      inert={hidden}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        onOpen();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKeyDown}
      className={cn(
        'motion-icon fixed z-40 grid size-11 touch-none place-items-center rounded-full border bg-popover shadow-lg',
        'cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        tone,
        hidden && 'invisible',
      )}
      style={{
        right: 12,
        bottom: `clamp(calc(1rem + ${floor}), ${
          bottom === null ? `calc(1rem + ${floor})` : `${bottom}px`
        }, calc(100dvh - ${DOCK_ICON_SIZE}px - 4.5rem))`,
      }}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 size-full" aria-hidden>
        <circle cx="22" cy="22" r={R} fill="none" strokeWidth="3" className="stroke-muted" />
        {status !== 'idle' && (
          <circle
            cx="22"
            cy="22"
            r={R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={ring.circumference}
            strokeDashoffset={failed ? 0 : ring.offset}
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset var(--motion-base) var(--ease-smooth)' }}
          />
        )}
      </svg>
      {failed ? (
        <XCircle className="size-5" aria-hidden />
      ) : done ? (
        <CheckCircle2 className="size-5" aria-hidden />
      ) : (
        <Upload className="size-4" aria-hidden />
      )}
      {badge && (
        <span
          aria-hidden
          className={cn(
            'absolute -top-1.5 -left-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums ',
            badge.tone === 'danger'
              ? 'bg-destructive text-white'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
});
