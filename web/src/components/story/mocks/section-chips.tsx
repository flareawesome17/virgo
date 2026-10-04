import { ArrowDownUp, Check, Plus } from 'lucide-react';
import { ALBUM } from '../data/story';
import { KIND_TABS, ORDER, SECTION_COUNTS, SECTIONS_UI } from '../data/strings/ch5';

/**
 * An album's sections, Prep · Ceremony · Reception, as the apps draw them.
 *
 * - `platform="web"`, `layout="chips"` follows `album-sections.tsx` on a
 *   narrow screen: pills, the active one filled with the foreground colour,
 *   "All media" first, "Unsorted" whenever sections exist (even at 0), then
 *   the dashed "+ Section". Past the frame's edge they run off, as the
 *   app's scroller does.
 * - `platform="web"`, `layout="rail"` is the same list down the side on a
 *   wide screen: "SECTIONS" with its + button, a dot per row, the active row
 *   on the accent surface. A named section's row keeps the room of its
 *   hover-only "…" button, as the app's does.
 * - `platform="phone"` follows the album screen: 13 px semibold pills with
 *   11 px counts, "All" first, "Unsorted" only when it holds something, and
 *   (with `kinds`) the kind segment, the order toggle — "Oldest", as the
 *   grid runs the day forward — and Select, in the same bordered band.
 *
 * Counts are those once Mika has filed Saturday's 413 files (uploads land
 * unsorted; she files them before Sunday's link, which shows the chapters):
 * Prep 96, Ceremony 151, Reception 166 (its 165 photos and Kenn's film).
 *
 * States: `empty` (a new album: nothing in it, no sections) · `none`
 * (Saturday night: 413 in, no sections yet) · `all` (rest) · `prep` ·
 * `ceremony` · `reception`. A chip is a filter in the apps, not a scroll
 * position: show `prep` beside an `AlbumGrid section="prep"`. In
 * `reception` a row too narrow to hold every chip is drawn scrolled to its
 * end; a stage walking the chips can instead translate `section-row`.
 *
 * Parts: section-chips (data-state), section-row (chips layouts),
 * section-chip (data-key, data-active).
 */

export type SectionChipsState = 'empty' | 'none' | 'all' | 'prep' | 'ceremony' | 'reception';

type Entry = { key: string; label: string; count: number; kind: 'all' | 'section' | 'none' };

function entries(platform: 'web' | 'phone', state: SectionChipsState): Entry[] {
  const total = state === 'empty' ? 0 : ALBUM.saturdayItems;
  const filed = SECTION_COUNTS.reduce((sum, s) => sum + s.count, 0);
  const unsorted = total - filed;
  const all: Entry = { key: 'all', label: platform === 'web' ? SECTIONS_UI.allWeb : SECTIONS_UI.allPhone, count: total, kind: 'all' };
  if (state === 'empty' || state === 'none') return [all];
  const sections: Entry[] = SECTION_COUNTS.map((s) => ({ key: s.key, label: s.name, count: s.count, kind: 'section' }));
  const rest: Entry[] =
    platform === 'web' || unsorted > 0 ? [{ key: 'none', label: SECTIONS_UI.unsorted, count: unsorted, kind: 'none' }] : [];
  return [all, ...sections, ...rest];
}

const activeKey = (state: SectionChipsState) => (state === 'empty' || state === 'none' ? 'all' : state);

/**
 * The last section sits past the edge of a narrow row, so a row showing it
 * active is drawn scrolled to its end, as it would be after the tap. Only
 * where the row overflows: the web row fits from about 44rem, the phone's
 * from about 36rem. Literal strings, so Tailwind sees them.
 */
const WEB_END = 'justify-end @[44rem]:justify-start';
const PHONE_END = 'justify-end @[36rem]:justify-start';

export function SectionChips({
  platform,
  layout = 'chips',
  state = 'all',
  kinds = true,
  className = '',
}: {
  platform: 'web' | 'phone';
  /** Web only: pills across the top, or the rail down the side. */
  layout?: 'chips' | 'rail';
  state?: SectionChipsState;
  /** Phone only: the kind segment and order button under the chips. */
  kinds?: boolean;
  className?: string;
}) {
  const list = entries(platform, state);
  const active = activeKey(state);

  if (platform === 'web' && layout === 'rail') {
    return (
      <div aria-hidden data-part="section-chips" data-state={state} className={`space-y-1 font-sans text-[#F2EDE8] ${className}`}>
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A08E84]">{SECTIONS_UI.rail}</p>
          <span className="grid size-7 place-items-center rounded-lg">
            <Plus aria-hidden className="size-4" />
          </span>
        </div>
        {list.map((entry) => {
          const on = entry.key === active;
          return (
            <div
              key={entry.key}
              data-part="section-chip"
              data-key={entry.key}
              data-active={on ? '' : undefined}
              className={`flex items-center gap-1 rounded-lg ${on ? 'bg-[#2A2522]' : ''}`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left text-sm">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    entry.kind === 'all' ? 'bg-[rgba(242,237,232,0.6)]' : entry.kind === 'none' ? 'bg-[#362F2B]' : 'bg-[#D18A5A]'
                  }`}
                />
                <span className={`min-w-0 flex-1 truncate ${on ? 'font-semibold' : 'font-medium text-[rgba(242,237,232,0.85)]'}`}>
                  {entry.label}
                </span>
                <span className="text-xs tabular-nums text-[#A08E84]">{entry.count.toLocaleString()}</span>
              </span>
              {/* The row's "…" menu: there, but hidden until hover. */}
              {entry.kind === 'section' && <span className="size-7 shrink-0" />}
            </div>
          );
        })}
        {(state === 'empty' || state === 'none') && (
          <p className="px-2.5 pt-2 text-xs leading-relaxed text-[#A08E84]">{SECTIONS_UI.hint}</p>
        )}
      </div>
    );
  }

  if (platform === 'web') {
    return (
      <div
        aria-hidden
        data-part="section-chips"
        data-state={state}
        className={`@container font-sans text-[#F2EDE8] ${className}`}
      >
        <div
          data-part="section-row"
          className={`flex gap-2 overflow-hidden pb-1 ${state === 'reception' ? WEB_END : ''}`}
        >
          {list.map((entry) => {
            const on = entry.key === active;
            return (
              <span
                key={entry.key}
                data-part="section-chip"
                data-key={entry.key}
                data-active={on ? '' : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap ${
                  on ? 'border-transparent bg-[#F2EDE8] font-semibold text-[#161311]' : 'border-[#362F2B] bg-[#1E1B18]'
                }`}
              >
                {entry.label}
                <span className={`text-xs tabular-nums ${on ? 'text-[rgba(22,19,17,0.7)]' : 'text-[#A08E84]'}`}>
                  {entry.count.toLocaleString()}
                </span>
              </span>
            );
          })}
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[#362F2B] px-3.5 py-1.5 text-sm whitespace-nowrap text-[#A08E84]">
            <Plus aria-hidden className="size-3.5" />
            {SECTIONS_UI.add}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      data-part="section-chips"
      data-state={state}
      className={`@container border-b border-[#362F2B] bg-[#161311] text-[#F2EDE8] ${className}`}
    >
      <div
        data-part="section-row"
        className={`flex gap-2 overflow-hidden px-4 py-2.5 ${state === 'reception' ? PHONE_END : ''}`}
      >
        {list.map((entry) => {
          const on = entry.key === active;
          return (
            <span
              key={entry.key}
              data-part="section-chip"
              data-key={entry.key}
              data-active={on ? '' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 ${
                on ? 'bg-[#F2EDE8]' : 'border border-[#362F2B] bg-[#1E1B18]'
              }`}
            >
              <span className={`text-[13px] font-semibold leading-4 whitespace-nowrap ${on ? 'text-[#161311]' : 'text-[#F2EDE8]'}`}>
                {entry.label}
              </span>
              <span className={`text-[11px] leading-4 tabular-nums ${on ? 'text-[rgba(22,19,17,0.7)]' : 'text-[#A08E84]'}`}>
                {entry.count.toLocaleString()}
              </span>
            </span>
          );
        })}
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[#362F2B] px-3.5 py-2">
          <Plus aria-hidden size={13} className="text-[#A08E84]" />
          <span className="text-[13px] font-semibold leading-4 whitespace-nowrap text-[#A08E84]">{SECTIONS_UI.add}</span>
        </span>
      </div>

      {kinds && (
        <div className="flex items-center gap-2 px-4 pb-2.5">
          <div className="flex flex-1 rounded-[12px] bg-[#2A2522] p-0.5">
            {KIND_TABS.map((label, i) => (
              <span
                key={label}
                className={`flex flex-1 items-center justify-center rounded-[10px] py-1.5 text-xs font-semibold ${
                  i === 0 ? 'bg-[#1E1B18] text-[#F2EDE8]' : 'text-[#A08E84]'
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          <span className="flex items-center gap-1 rounded-[12px] border border-[#362F2B] px-2.5 py-2">
            <ArrowDownUp aria-hidden size={13} />
            <span className="text-xs font-semibold leading-4">{ORDER.oldest}</span>
          </span>
          {/* Select is offered only once there is something to select. */}
          {state !== 'empty' && (
            <span className="rounded-[12px] border border-[#362F2B] px-2.5 py-2">
              <Check aria-hidden size={14} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
