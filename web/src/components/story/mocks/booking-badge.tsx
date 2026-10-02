import type { ReactNode } from 'react';
import { Check, Clock, FileText } from 'lucide-react';
import { APPLICANT, BOOKING, TERMS, TERMS_DATE, type Hire } from '../data/strings/ch3';

/**
 * The booking an acceptance creates, in one line of state (storyboard Ch3,
 * B10 BookingBadge). "The booking badge flips from Waiting on them to Agreed."
 *
 * - `platform="web"` is `web/src/components/jobs/booking-card.tsx`
 *   (BookingCard): the compact card on an accepted application. A 32 px tone
 *   circle, "Booking" with its icon, the detail line, the state Badge, and
 *   the role, date, place and rate underneath. `bookingState`'s labels are
 *   copied into strings/ch3.ts, never imported: that file pulls in `@/api`.
 * - `platform="phone"` is the phone's equivalent on the same row
 *   (`mobile/components/JobsTabs.tsx` BookingLink): a bordered line,
 *   "Booking · waiting on them". Its text is `#D18A5A` rather than the app's
 *   `#B66A40`, which is under AA at 12 px (§1.5); the border keeps `#B66A40`.
 *
 * The flip is drawn in place: both faces of the tone circle, the detail line
 * and the badge are laid out in the same cell (see `Faces`), and `state`
 * picks the one shown. A stage flips it by opacity alone, with no layout
 * change. Sides are never mixed: a poster sees "Waiting on them", the person
 * hired sees "Needs you".
 *
 * Parts: booking (data-state, data-side), booking-tone, booking-detail,
 * booking-badge, booking-meta (web), booking-label (phone). Each flipping part
 * holds `[data-face]` children; the shown one carries `data-on`. Pass `suffix`
 * when several bookings share a mock: every part becomes `booking-…-<suffix>`.
 */

// ─── Shared by the Ch3 and Ch4 mocks ─────────────────────────────────────

/**
 * One discrete flip, drawn in place: every face is laid out in the same grid
 * cell, so the cell is as big as the biggest face and nothing around it moves
 * when the shown face changes. `on` names the face drawn; the others sit at
 * opacity 0. A stage flips by writing opacity (and a small transform) on the
 * `[data-face]` children of `[data-part=…]`, never by changing text.
 *
 * Use it only where the faces share a footprint (a label, an icon, a count).
 * Where a state changes the layout, the mock draws each state exactly
 * instead, and a stage crossfades two renders.
 */
export function Faces<K extends string>({
  part,
  on,
  faces,
  align = 'start',
  block = false,
  className = '',
}: {
  part?: string;
  on: K;
  /** In drawing order. Keys are the face names (`data-face`); `on` must be one of them. */
  faces: Partial<Record<K, ReactNode>>;
  /** How a face narrower than the cell sits in it; `stretch` fills it (buttons). */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** A block-level grid (for a line of its own) rather than an inline one. */
  block?: boolean;
  className?: string;
}) {
  const justify = {
    start: 'justify-items-start',
    center: 'justify-items-center',
    end: 'justify-items-end',
    stretch: 'justify-items-stretch',
  }[align];
  return (
    <span
      data-part={part}
      data-state={on}
      className={`${block ? 'grid' : 'inline-grid'} min-w-0 ${justify} ${className}`}
    >
      {(Object.keys(faces) as K[]).map((k) => (
        <span
          key={k}
          data-face={k}
          data-on={k === on ? '' : undefined}
          className="col-start-1 row-start-1 min-w-0 max-w-full"
          style={{ opacity: k === on ? 1 : 0 }}
        >
          {faces[k]}
        </span>
      ))}
    </span>
  );
}

/**
 * The web Badge (`components/ui/badge.tsx`), resolved to the dark theme:
 * a 20 px pill, 12 px medium. Default is primary `#D18A5A` on `#161311`.
 */
export function webBadge(variant: 'default' | 'secondary' | 'outline'): string {
  const base =
    'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium';
  if (variant === 'default') return `${base} border-transparent bg-[#D18A5A] text-[#161311]`;
  if (variant === 'secondary') return `${base} border-transparent bg-[#26221F] text-[#BCADA3]`;
  return `${base} border-[#362F2B] text-[#F2EDE8]`;
}

/**
 * The web Button at `size="sm"` (`components/ui/button.tsx`), dark: 28 px
 * tall, 12.8 px medium, 9.6 px radius. Default is the action fill `#A85D35`
 * with white; outline is the input border over `input/30`.
 */
export function webButton(variant: 'default' | 'outline' | 'ghost', disabled = false): string {
  const base =
    'inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[9.6px] border px-2.5 text-[0.8rem] font-medium';
  const look =
    variant === 'default'
      ? 'border-transparent bg-[#A85D35] text-white'
      : variant === 'outline'
        ? 'border-[#362F2B] bg-[rgba(54,47,43,0.3)] text-[#F2EDE8]'
        : 'border-transparent text-[#F2EDE8]';
  return `${base} ${look}${disabled ? ' opacity-50' : ''}`;
}

// ─── The booking ─────────────────────────────────────────────────────────

export type BookingBadgeProps = (
  | { side?: 'poster'; state?: 'waiting' | 'agreed' }
  | { side: 'creative'; state?: 'needs-you' | 'agreed' }
) & {
  /** Whose booking: the role, the rate and the date come from the hire. */
  hire?: Hire;
  platform?: 'web' | 'phone';
  /** Appended to every part name, to keep them unique in a bigger mock. */
  suffix?: string;
  className?: string;
};

type Tone = 'good' | 'todo' | 'waiting';

const TONE: Record<Tone, string> = {
  // booking-card.tsx TONE, dark: emerald for agreed, primary/15 for needs
  // you, muted for waiting.
  good: 'bg-emerald-500/15 text-emerald-400',
  todo: 'bg-[rgba(209,138,90,0.15)] text-[#D18A5A]',
  waiting: 'bg-[#2A2522] text-[#A08E84]',
};

export function BookingBadge(props: BookingBadgeProps) {
  const { hire = 'ernie', platform = 'web', suffix, className = '' } = props;
  const p = (name: string) => (suffix ? `${name}-${suffix}` : name);
  const side = props.side ?? 'poster';
  const state = props.state ?? 'agreed';
  /** The face before agreement, for this side. */
  const pending = side === 'poster' ? 'waiting' : 'needs-you';
  const a = APPLICANT[hire];

  if (platform === 'phone') {
    return (
      <div
        data-part={p('booking')}
        data-state={state}
        data-side={side}
        className={`rounded-[12px] border border-[#B66A40] px-3 py-2.5 ${className}`}
      >
        <Faces
          part={p('booking-label')}
          on={state}
          faces={{
            [pending]: <span className="whitespace-nowrap text-[12px] font-bold text-[#D18A5A]">{BOOKING.phone[pending]}</span>,
            agreed: <span className="whitespace-nowrap text-[12px] font-bold text-[#D18A5A]">{BOOKING.phone.agreed}</span>,
          }}
        />
      </div>
    );
  }

  const detail = side === 'poster' ? BOOKING.detail.poster : BOOKING.detail.creative;
  const pendingTone: Tone = side === 'poster' ? 'waiting' : 'todo';
  const detailText = (k: 'waiting' | 'needs-you' | 'agreed') =>
    k === 'agreed' ? detail.agreed : (detail as Record<string, string>)[k];

  return (
    <div
      data-part={p('booking')}
      data-state={state}
      data-side={side}
      className={`block rounded-[12px] border border-[#362F2B] p-3.5 font-sans text-[#F2EDE8] ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Faces
            part={p('booking-tone')}
            className="shrink-0"
            on={state}
            faces={{
              [pending]: (
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${TONE[pendingTone]}`}>
                  <Clock aria-hidden className="size-4" />
                </span>
              ),
              agreed: (
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${TONE.good}`}>
                  <Check aria-hidden className="size-4" />
                </span>
              ),
            }}
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <FileText aria-hidden className="size-3.5 text-[#A08E84]" />
              {BOOKING.title}
            </p>
            <Faces
              part={p('booking-detail')}
              block
              on={state}
              faces={{
                [pending]: <span className="block truncate text-xs text-[#A08E84]">{detailText(pending)}</span>,
                agreed: <span className="block truncate text-xs text-[#A08E84]">{detailText('agreed')}</span>,
              }}
            />
          </div>
        </div>
        <Faces
          part={p('booking-badge')}
          align="end"
          className="shrink-0"
          on={state}
          faces={{
            [pending]: (
              <span className={webBadge(pendingTone === 'todo' ? 'default' : 'secondary')}>{BOOKING.label[pending]}</span>
            ),
            agreed: <span className={webBadge('secondary')}>{BOOKING.label.agreed}</span>,
          }}
        />
      </div>

      <div data-part={p('booking-meta')} className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#A08E84]">
        <span>{a.role}</span>
        <span>{TERMS_DATE}</span>
        <span>{TERMS.locationValue}</span>
        <span className="font-medium text-[#F2EDE8]">{a.rate}</span>
      </div>
    </div>
  );
}

