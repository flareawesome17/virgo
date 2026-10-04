import { dayKey, dayTitle, daySpan } from '@/lib/media-days';
import { ALBUM, NOW } from '../data/story';
import { ALBUM_TILES, COUNT_JOIN, DAY_ITEMS, SECTION_COUNTS, wallClock, type SectionKey } from '../data/strings/ch5';

/**
 * Saturday's day heading in the album: "Saturday 12 December", then
 * "413 items · 05:52 – 22:41".
 *
 * Both halves come from the app's own `lib/media-days.ts`: the title is
 * `dayTitle` (en-GB, no year in the current year, "Today"/"Yesterday" close
 * by), with Ch5's fixed `now` — Monday 14 December, 9:00 AM — read as Cebu's
 * wall clock, so it says "Saturday 12 December" on any server; the span is
 * `daySpan` over the capture times as the cameras wrote them, which is why
 * it is 24-hour. The count is written as the grid writes it.
 *
 * What the count counts: the files of that day the page has loaded. The apps
 * load an album 100 files at a time as you scroll, so "413 items · 05:52 –
 * 22:41" is the heading once the whole day is in — on the phone, the sticky
 * header as you reach the day's end; on the web, after scrolling through it.
 * Narrowed to a section (`section`), the heading counts that section: Prep's
 * 96 fit one page and read "96 items · 05:52 – 11:40" straight away.
 *
 * When it is read: `now` defaults to Ch5's fixed Monday morning, the earliest
 * kind of `now` at which the app titles the day by its date (on Saturday
 * night it reads "Today", on Sunday "Yesterday"). By Monday the real album
 * also holds Sunday's teaser and two recordings and the couple's 12 picks,
 * which Ch5's header ("412 photos · 1 film") and chips leave out — so a frame
 * that pairs them is Saturday's album under Monday's heading. Pass `now`
 * (Saturday 11:55 PM gives "Today") for a frame true to a single moment.
 *
 * - `platform="web"` follows `album-grid.tsx`: a 16 px semibold title, the
 *   12 px tabular muted line beside it, wrapping on a baseline.
 * - `platform="phone"` follows the album screen's sticky header: 15 px
 *   semibold on the background, the line in 12 px muted, one line.
 *
 * States, styled from the root's `data-state`: `title` (the day is named,
 * its count not yet in; the line keeps its room) · `full` (rest).
 *
 * Parts: day-heading (data-state, data-section), day-title, day-meta.
 */

export type DayHeadingState = 'title' | 'full';

/** Saturday's heading, computed by the app's helpers, for everything or one section: { title, meta }. */
export function saturdayHeading(section: SectionKey = 'all', now: string = NOW.ch5): { title: string; meta: string } {
  const only = SECTION_COUNTS.find((s) => s.key === section);
  const tiles = only ? ALBUM_TILES.filter((t) => t.section === only.name) : ALBUM_TILES;
  const files = tiles.map((t) => ({ takenAt: t.takenAt, createdAt: t.uploadedAt }));
  const title = dayTitle(dayKey(files[0]), wallClock(now));
  const span = daySpan(files);
  const n: number = only ? only.count : ALBUM.saturdayItems;
  return {
    title,
    meta: `${n.toLocaleString()} ${n === 1 ? DAY_ITEMS.one : DAY_ITEMS.many}${span ? `${COUNT_JOIN}${span}` : ''}`,
  };
}

export function DayHeading({
  platform,
  state = 'full',
  section = 'all',
  now = NOW.ch5,
  className = '',
}: {
  platform: 'web' | 'phone';
  state?: DayHeadingState;
  /** The section the grid is narrowed to, as the chips choose it. */
  section?: SectionKey;
  /** When the album is looked at, a story instant in Cebu. `dayTitle` reads it: "Today" on Saturday night, "Yesterday" on Sunday, the date from Monday. */
  now?: string;
  className?: string;
}) {
  const { title, meta } = saturdayHeading(section, now);
  /** Hidden while the day is only named; styled from the root's data-state. */
  const metaHide = 'group-data-[state=title]/day:opacity-0';

  if (platform === 'web') {
    return (
      <div
        aria-hidden
        data-part="day-heading"
        data-state={state}
        data-section={section}
        className={`group/day flex flex-wrap items-baseline gap-x-3 gap-y-1 font-sans text-[#F2EDE8] ${className}`}
      >
        <p data-part="day-title" className="text-base font-semibold tracking-tight">
          {title}
        </p>
        <p data-part="day-meta" className={`text-xs tabular-nums text-[#A08E84] ${metaHide}`}>
          {meta}
        </p>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-part="day-heading"
      data-state={state}
      data-section={section}
      className={`group/day flex items-center gap-2 bg-[#161311] px-4 pb-2 pt-4 text-[#F2EDE8] ${className}`}
    >
      <p data-part="day-title" className="shrink-0 text-[15px] font-semibold leading-5">
        {title}
      </p>
      <p data-part="day-meta" className={`min-w-0 flex-1 truncate text-xs text-[#A08E84] ${metaHide}`}>
        {meta}
      </p>
    </div>
  );
}
