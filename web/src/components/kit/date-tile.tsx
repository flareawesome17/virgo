import { parseDateKey } from '@/lib/calendar';
import { cn } from '@/lib/utils';

/** "SAT", 14 and "NOV" for a date key such as 2026-11-14. */
export function dateTileParts(dateKey: string): { weekday: string; day: number; month: string } {
  const d = parseDateKey(dateKey.slice(0, 10));
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

/**
 * A date as every dated row shows it: a small word over the day. `top` is the
 * weekday on a schedule row and the month on a job. `lg` is the one on a
 * detail page; `inverted` sits on the dark card.
 */
export function DateTile({
  top,
  day,
  bottom,
  size = 'md',
  inverted = false,
  className,
}: {
  top: string;
  day: number | string;
  /** A third line, the month under the day, on an event's own page. */
  bottom?: string;
  size?: 'md' | 'lg';
  inverted?: boolean;
  className?: string;
}) {
  const lg = size === 'lg';
  return (
    <span
      className={cn(
        'flex shrink-0 flex-col items-center justify-center',
        lg ? 'w-[60px] rounded-2xl py-2' : 'size-11 rounded-xl',
        inverted ? 'bg-background/10' : 'bg-muted',
        className,
      )}
    >
      <span
        className={cn(
          'font-bold leading-3 tracking-wider',
          lg ? 'text-[11px]' : 'text-[10px]',
          inverted ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {top}
      </span>
      <span className={cn('font-bold tabular-nums', lg ? 'text-2xl leading-7' : 'text-base leading-5')}>
        {day}
      </span>
      {bottom ? (
        <span className="text-[11px] font-bold leading-3 tracking-wider text-muted-foreground">{bottom}</span>
      ) : null}
    </span>
  );
}

/** "4:00" over "PM": the hour of something on the day being looked at. */
export function TimeTile({ time, meridiem, className }: { time: string; meridiem: string; className?: string }) {
  return (
    <span className={cn('flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted', className)}>
      <span className="text-[15px] font-bold leading-[18px] tabular-nums">{time}</span>
      <span className="text-[10px] font-bold leading-3 tracking-wider text-muted-foreground">{meridiem}</span>
    </span>
  );
}
