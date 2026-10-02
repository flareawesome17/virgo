import { Bookmark, ChevronUp, Flag, Heart, Image as ImageIcon } from 'lucide-react';
import { PHONE_FONT } from '../frames/phone-frame';
import { SHOWCASE_BYLINE, SHOWCASE_CARD, SHOWCASE_POST } from '../data/strings/work';
import { litePlateStyle } from './plate';

/**
 * One showcase in the phone app's feed ("The work"), drawn from the Placard
 * in `mobile/app/(app)/(tabs)/feed.tsx`, in the phone's dark palette:
 *
 * - The cover runs the full width, 1.15 times as tall as it is wide (the feed
 *   fixes that share of the screen so Keep is always in the same place). A
 *   Plate, never a photograph. With several pieces, a count badge top right.
 * - The placard is lifted 32 px over the cover's foot, 10 px in from each
 *   side: 16 px radius, the card colour `#1E1B18`.
 * - The byline: a 36 px tinted initial (primary/15, `#D18A5A`), the name
 *   14 px bold, the maker's title and the post's place 11 px muted, the
 *   report flag, and the Hire pill (`#A85D35`, 12 px bold white).
 * - The title 17 px semibold. Then HOW IT WAS MADE: the label in `#D18A5A`
 *   (10 px in the app, 11 here, the story's floor), the note 13/20, and the
 *   craft tags, 11 px semibold `#BCADA3` pills on the muted colour.
 * - The action bar: Like, See it all, and Keep on `#A85D35` (a wider cell).
 *
 * The viewer is another member, so the flag, Hire and Keep all show; it is
 * Mika's own work, never the Reyes & Santos album's (the clean-up would take
 * it). Text is always in the DOM; the states only fade parts.
 *
 * States (the interlude's beats):
 *   posted   the card has risen; the note is still masked, the tags off
 *   noted    the note revealed
 *   tagged   the craft tags ticked on (default)
 *
 * Parts: showcase-card (data-state), showcase-cover, piece-count, placard,
 * byline, hire, showcase-title, craft, craft-label, craft-note (data-on),
 * craft-tag (data-on, data-index), actions, like, see-all, keep.
 */

export type ShowcaseCardState = 'posted' | 'noted' | 'tagged';

export const SHOWCASE_CARD_STATES: Record<ShowcaseCardState, { note: boolean; tags: boolean }> = {
  posted: { note: false, tags: false },
  noted: { note: true, tags: false },
  tagged: { note: true, tags: true },
};

const on = (yes: boolean) => (yes ? '' : undefined);

export function ShowcaseCard({
  state = 'tagged',
  seed = 135,
  pieces = 1,
  className = '',
}: {
  state?: ShowcaseCardState;
  /** The cover's Plate. Never one of Ch5–7's album seeds. */
  seed?: number;
  /** How many photos or films the post holds (up to ten); over one draws the count badge. */
  pieces?: number;
  /** Width and placement; the height follows the cover. */
  className?: string;
}) {
  const s = SHOWCASE_CARD_STATES[state];

  return (
    <div
      aria-hidden
      data-part="showcase-card"
      data-state={state}
      className={`relative bg-[#161311] pb-2.5 text-[#F2EDE8] ${className}`}
      style={{ fontFamily: PHONE_FONT }}
    >
      <div
        data-part="showcase-cover"
        className="relative w-full"
        style={{ ...litePlateStyle(seed), aspectRatio: '1 / 1.15', boxShadow: undefined }}
      >
        {pieces > 1 && (
          <span
            data-part="piece-count"
            className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[rgba(242,237,232,0.55)] px-2.5 py-1 text-[#161311]"
          >
            <ImageIcon aria-hidden size={12} />
            <span className="text-[11px] font-bold">{pieces}</span>
          </span>
        )}
      </div>

      <div data-part="placard" className="relative mx-2.5 -mt-8 overflow-hidden rounded-2xl bg-[#1E1B18]">
        <div className="px-4 pt-3.5">
          <div data-part="byline" className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgba(209,138,90,0.15)] text-[14px] font-bold text-[#D18A5A]">
              {SHOWCASE_POST.maker.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">{SHOWCASE_POST.maker}</span>
              <span className="block truncate text-[11px] text-[#A08E84]">{SHOWCASE_BYLINE}</span>
            </span>
            <span className="flex size-9 shrink-0 items-center justify-center">
              <Flag aria-hidden size={15} className="text-[#A08E84]" />
            </span>
            <span
              data-part="hire"
              className="flex min-h-9 shrink-0 items-center justify-center rounded-full bg-[#A85D35] px-3.5 text-[12px] font-bold text-white"
            >
              {SHOWCASE_CARD.hire}
            </span>
          </div>

          <p data-part="showcase-title" className="mt-3 text-[17px] font-semibold leading-snug">
            {SHOWCASE_POST.title}
          </p>

          <div data-part="craft" className="mt-3 border-t border-[#362F2B] pt-3">
            <p data-part="craft-label" className="text-[11px] font-bold tracking-[1.5px] text-[#D18A5A]">
              {SHOWCASE_CARD.craft}
            </p>
            <p
              data-part="craft-note"
              data-on={on(s.note)}
              className="mt-1.5 text-[13px] leading-5 opacity-0 data-[on]:opacity-100"
            >
              {SHOWCASE_POST.note}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {SHOWCASE_POST.tags.map((tag, i) => (
                <span
                  key={tag}
                  data-part="craft-tag"
                  data-index={i}
                  data-on={on(s.tags)}
                  className="scale-90 rounded-full bg-[#2A2522] px-2.5 py-1 text-[11px] font-semibold text-[#BCADA3] opacity-0 data-[on]:scale-100 data-[on]:opacity-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div data-part="actions" className="mt-3 flex items-stretch border-t border-[#362F2B]">
          <span data-part="like" className="flex min-h-12 flex-1 items-center justify-center gap-1.5">
            <Heart aria-hidden size={16} className="text-[#A08E84]" />
            <span className="text-[12px] font-bold text-[#BCADA3]">{SHOWCASE_CARD.like}</span>
          </span>
          <span className="my-2.5 w-px bg-[#362F2B]" />
          <span data-part="see-all" className="flex min-h-12 flex-1 items-center justify-center gap-1.5">
            <ChevronUp aria-hidden size={15} className="text-[#A08E84]" />
            <span className="text-[12px] font-bold text-[#BCADA3]">{SHOWCASE_CARD.seeAll}</span>
          </span>
          <span className="my-2.5 w-px bg-[#362F2B]" />
          <span data-part="keep" className="flex min-h-12 flex-[1.2] items-center justify-center gap-1.5 bg-[#A85D35]">
            <Bookmark aria-hidden size={15} className="text-white" />
            <span className="text-[12px] font-bold text-white">{SHOWCASE_CARD.keep}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
