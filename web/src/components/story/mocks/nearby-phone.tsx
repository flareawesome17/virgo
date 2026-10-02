import { Fragment, type ReactNode } from 'react';
import { ArrowLeft, Check, Ellipsis, MapPin, UserPlus } from 'lucide-react';
import { RADII, ROLES, SEARCH_ROLES, roleCounts, rows, type Neighbour, type Role } from '../data/story';
import { EVENT_CHIP, NEARBY, RADIUS_LABELS, kmAway } from '../data/strings/ch2';
import { Avatar } from './avatar';
import { LocationCard } from './location-card';

/**
 * The phone app's Nearby screen (`mobile/app/(app)/discover/nearby.tsx`),
 * searching from the shoot: sharing on as "Discoverable · Cebu City", the
 * upcoming "Reyes & Santos wedding" picked under NEAR (so the helper says it
 * measures from Cebu City without moving her), Videographer, SDE Editor
 * Video and HMUA picked under LOOKING FOR, and the people in range listed
 * nearest first, each with Add.
 *
 * States, Ch2's beats:
 * - `r5`: 5 km. Ernie, Kenn and Rhea.
 * - `r25`: 25 km. Ten rows; every chip's count from the roster, zeros
 *   included, and the coordinator 3 km out still counted.
 * - `r25-erased`: the coordinator has turned sharing off and is gone:
 *   Coordinator 1 → 0, and its chip greys as the app greys an empty role.
 * Counts come from `roleCounts()`, rows from `rows()`; nothing is typed.
 *
 * Drawn from the app, with the page's fills (§1.5): picked chips, the radius
 * and Add are `#A85D35` with white; accent text is `#D18A5A`; avatars are the
 * app's tinted circles (B8). Text never goes under 11 px, so the row badges
 * (9 px in the app) and the event chip's place (10 px) are drawn at 11 px.
 * The radius row scrolls sideways in the app, so "200 km" runs off its edge.
 *
 * One DOM for all three states. The radius flips with `data-on`; counts and
 * distances are tabular counters; rows beyond the radius carry `hidden`
 * (they join below the last row, as in the app). The screen scrolls as one
 * column: `scroll` picks the section at the top of the screen, and everything
 * above it hangs in a zero-height box (`nearby-above`) — laid out, just above
 * the screen — so a Phase 4 island scrolls by translating `nearby-scroll`
 * alone, by the height it measures, never by changing layout.
 *
 * Fills `PhoneFrame`'s content area (absolute inset-0). The rows want a
 * screen about 360 px wide or more; narrower, long role badges wrap, as the
 * app's would.
 *
 * Parts: nearby-phone (data-state), nearby-scroll, nearby-above, plus the
 * sections nearby-header, location-card (and its parts), nearby-near,
 * event-chip, near-field, near-helper, nearby-within, radius-<km> (data-on),
 * nearby-looking, role-<role> (data-on, data-count), count-<role>,
 * nearby-results, nearby-list, row-<name> (data-km, hidden), km-<name>.
 */

export type NearbyState = 'r5' | 'r25' | 'r25-erased';
export type NearbyPhoneScroll = 'top' | 'near' | 'within';

export const NEARBY_STATES: readonly NearbyState[] = ['r5', 'r25', 'r25-erased'];

/** Each beat's search: the radius, and whether the coordinator has turned sharing off yet. */
export const NEARBY_BEAT: Record<NearbyState, { radius: number; erased: boolean }> = {
  r5: { radius: 5, erased: false },
  r25: { radius: 25, erased: false },
  'r25-erased': { radius: 25, erased: true },
};

/**
 * The search a state shows: the chip counts, every row any beat lists
 * (nearest first), and which of them are in range now.
 */
export function nearbySearch(state: NearbyState) {
  const { radius, erased } = NEARBY_BEAT[state];
  const widest = Math.max(...NEARBY_STATES.map((s) => NEARBY_BEAT[s].radius));
  const all = rows(widest, SEARCH_ROLES, false);
  const shown = new Set(rows(radius, SEARCH_ROLES, erased).map((n) => n.name));
  const listed = all.filter((n) => shown.has(n.name));
  return {
    radius,
    counts: roleCounts(radius, erased),
    all,
    shown,
    last: listed[listed.length - 1]?.name,
  };
}

/** "SDE Editor Video" → "sde-editor-video", for part names. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "2 km away" with the number on its own, so it can count. */
export function DistanceText({ km, part }: { km: number; part: string }) {
  const label = kmAway(km);
  const n = String(km);
  if (!label.startsWith(n)) return <span data-part={part}>{label}</span>;
  return (
    <>
      <span data-part={part} className="tabular-nums">
        {n}
      </span>
      {label.slice(n.length)}
    </>
  );
}

const MUTED = 'text-[#A08E84]';

function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`ml-1 text-[11px] font-bold uppercase leading-[14px] tracking-[2px] ${MUTED} ${className}`}>{children}</p>
  );
}

function Row({ person, hidden, last }: { person: Neighbour; hidden: boolean; last: boolean }) {
  const id = slug(person.name);
  return (
    <div
      data-part={`row-${id}`}
      data-km={person.km}
      hidden={hidden}
      className="flex items-center gap-3 px-4 py-3"
      style={last ? undefined : { borderBottom: '1px solid #2A2522' }}
    >
      <Avatar surface="phone-nearby" name={person.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5">{person.name}</p>
        <p className={`mt-0.5 flex items-center gap-1 text-xs leading-4 ${MUTED}`}>
          <MapPin aria-hidden size={11} className="shrink-0" />
          <span>
            <DistanceText km={person.km} part={`km-${id}`} />
          </span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {person.roles.map((role) => (
            <span
              key={role}
              className={`rounded-[5px] px-1.5 py-0.5 text-[11px] font-bold leading-[14px] ${
                SEARCH_ROLES.includes(role) ? 'bg-[#A85D35] text-white' : 'bg-[#B66A4014] text-[#D18A5A]'
              }`}
            >
              {role}
            </span>
          ))}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 rounded-[12px] bg-[#A85D35] px-3 py-2">
        <UserPlus aria-hidden size={13} className="text-white" />
        <span className="text-xs font-bold leading-4 text-white">{NEARBY.add}</span>
      </span>
      <span className="flex size-8 shrink-0 items-center justify-center">
        <Ellipsis aria-hidden size={16} className="text-[#A08E84]" />
      </span>
    </div>
  );
}

function RoleChip({ role, count }: { role: Role; count: number }) {
  const on = SEARCH_ROLES.includes(role);
  const id = slug(role);
  return (
    <span
      data-part={`role-${id}`}
      data-on={on ? '' : undefined}
      data-count={count}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 ${on ? 'bg-[#A85D35]' : 'bg-[#1E1B18]'}`}
      // A role nobody in range does stays, greyed, so the list keeps its shape.
      style={{ opacity: !on && count === 0 ? 0.55 : 1 }}
    >
      {on && <Check aria-hidden size={12} className="text-white" />}
      <span className={`text-xs font-semibold leading-4 ${on ? 'text-white' : 'text-[#F2EDE8]'}`}>{role}</span>
      <span
        data-part={`count-${id}`}
        className={`inline-block min-w-[1ch] text-xs font-bold leading-4 tabular-nums ${on ? 'text-white/80' : MUTED}`}
      >
        {count}
      </span>
    </span>
  );
}

export function NearbyPhone({
  state = 'r25-erased',
  scroll = 'within',
  maxRows,
  className = '',
}: {
  state?: NearbyState;
  /** The section at the top of the screen. */
  scroll?: NearbyPhoneScroll;
  /**
   * Draw only the first n rows. The list is 10 long at 25 km, but the screen
   * never shows past the fifth at rest; a stage can cap the DOM here. The
   * last drawn row keeps its divider, because the list goes on below.
   */
  maxRows?: number;
  className?: string;
}) {
  const { radius, counts, all, shown, last } = nearbySearch(state);
  const drawn = maxRows === undefined ? all : all.slice(0, Math.max(0, maxRows));

  const sections: { key: NearbyPhoneScroll | 'share' | 'looking' | 'results'; node: ReactNode }[] = [
    {
      key: 'top',
      node: (
        <div data-part="nearby-header" className="flex items-center gap-3 px-5 pb-2 pt-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[16px] bg-[#1E1B18]">
            <ArrowLeft aria-hidden size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[22px] font-bold leading-7 tracking-tight">{NEARBY.title}</p>
            <p className={`mt-0.5 text-sm leading-5 ${MUTED}`}>{NEARBY.description}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'share',
      node: (
        <div className="mt-4 px-5">
          <LocationCard platform="phone" state="on" />
        </div>
      ),
    },
    {
      key: 'near',
      node: (
        <div data-part="nearby-near" className="mt-5 px-5">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>{NEARBY.near}</SectionLabel>
            <span className="text-xs font-semibold leading-4 text-[#D18A5A]">{NEARBY.backToMe}</span>
          </div>
          {/* The upcoming shoots, as places to search from: this one is picked. */}
          <div className="flex gap-2 overflow-hidden pb-2">
            <span data-part="event-chip" data-on="" className="max-w-full shrink-0 rounded-[16px] bg-[#A85D35] px-3 py-2">
              <span className="block truncate text-xs font-bold leading-4 text-white">{EVENT_CHIP.title}</span>
              <span className="block truncate text-[11px] leading-[14px] text-white/80">{EVENT_CHIP.place}</span>
            </span>
          </div>
          <div data-part="near-field" className="flex items-center gap-2 rounded-[12px] bg-[#1E1B18] px-3.5">
            <MapPin aria-hidden size={14} className={`shrink-0 ${MUTED}`} />
            <span className="min-w-0 flex-1 truncate py-3 text-sm leading-5">{EVENT_CHIP.place}</span>
          </div>
          <p data-part="near-helper" className={`ml-1 mt-2 text-xs leading-4 ${MUTED}`}>
            {NEARBY.measuring}
          </p>
        </div>
      ),
    },
    {
      key: 'within',
      node: (
        <div data-part="nearby-within" className="mt-5 px-5">
          <SectionLabel className="mb-2">{NEARBY.within}</SectionLabel>
          <div className="flex gap-2 overflow-hidden">
            {RADII.map((r, i) => (
              <span
                key={r}
                data-part={`radius-${r}`}
                data-on={r === radius ? '' : undefined}
                className={`shrink-0 rounded-full bg-[#1E1B18] px-4 py-2 text-xs font-bold leading-4 ${MUTED} data-[on]:bg-[#A85D35] data-[on]:text-white`}
              >
                {RADIUS_LABELS[i]}
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      key: 'looking',
      node: (
        <div data-part="nearby-looking" className="mt-5 px-5">
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>{NEARBY.lookingFor}</SectionLabel>
            <span className="text-xs font-semibold leading-4 text-[#D18A5A]">{NEARBY.clear}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <RoleChip key={role} role={role} count={counts[role]} />
            ))}
          </div>
          <p className={`ml-1 mt-2 text-xs leading-4 ${MUTED}`}>{NEARBY.anyoneWho}</p>
        </div>
      ),
    },
    {
      key: 'results',
      node: (
        <div data-part="nearby-results" className="mt-6 px-5">
          <SectionLabel className="mb-2">{NEARBY.suggested}</SectionLabel>
          <div data-part="nearby-list" className="overflow-hidden rounded-[16px] bg-[#1E1B18]">
            {drawn.map((n) => (
              <Row key={n.name} person={n} hidden={!shown.has(n.name)} last={n.name === last} />
            ))}
          </div>
        </div>
      ),
    },
  ];

  const anchor = Math.max(
    0,
    sections.findIndex((s) => s.key === scroll),
  );

  return (
    <div
      aria-hidden
      data-part="nearby-phone"
      data-state={state}
      className={`absolute inset-0 overflow-hidden bg-[#161311] text-[#F2EDE8] ${className}`}
    >
      <div data-part="nearby-scroll" className="pb-[60px]">
        {anchor > 0 && (
          // Laid out, but above the screen: a zero-height box whose content
          // hangs upward from its bottom edge.
          <div data-part="nearby-above" className="flex h-0 flex-col justify-end">
            {sections.slice(0, anchor).map((s) => (
              <Fragment key={s.key}>{s.node}</Fragment>
            ))}
          </div>
        )}
        {sections.slice(anchor).map((s) => (
          <Fragment key={s.key}>{s.node}</Fragment>
        ))}
      </div>
    </div>
  );
}
