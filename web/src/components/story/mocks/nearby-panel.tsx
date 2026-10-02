import type { ReactNode } from 'react';
import { Bell, Check, MapPin, Moon, UserPlus } from 'lucide-react';
import { RADII, ROLES, SEARCH_ROLES, type Neighbour, type Role } from '../data/story';
import { EVENT_CHIP, NEARBY, RADIUS_LABELS } from '../data/strings/ch2';
import { Avatar } from './avatar';
import { LocationCard } from './location-card';
import { DistanceText, nearbySearch, slug, type NearbyState } from './nearby-phone';

/**
 * The web app's Nearby page (`web/src/app/(app)/nearby/page-client.tsx`),
 * the column to the right of the app's sidebar: the desktop "panel" Ch2 keeps
 * sticky beside the radar. The same search as `NearbyPhone` — the shoot
 * picked under NEAR, three roles under LOOKING FOR, rows for the radius —
 * in the web's own dark theme and Geist:
 *
 * - PageHeader (sticky in the app, so fixed here): "Nearby", its line, and
 *   the bell and theme buttons it carries at desktop widths.
 * - Buttons (the event chip, the radius, Add) are `#A85D35` with white; a
 *   picked role chip and a matched badge are primary, `#D18A5A` on
 *   `#161311`; the rest are outline or secondary. Avatars are the web's two
 *   letters on primary/15. Badges are drawn at 11 px (10 in the app), the
 *   floor for text on the page.
 *
 * States and data as `NearbyPhone` (`r5`, `r25`, `r25-erased`; counts and
 * rows from `story.ts`). One DOM for all three: radius buttons flip with
 * `data-on`, counts and distances are tabular counters, a role with nobody
 * in range greys through `data-empty`, rows out of range carry `hidden`.
 *
 * `scroll` picks what sits under the header: `top` (the sharing card first)
 * or `near` (the default: the card has scrolled up, and NEAR leads, which is
 * where Ch2's panel opens). Everything above the anchor hangs in a
 * zero-height box, so a Phase 4 island scrolls by translating `panel-scroll`.
 * A long list runs off the bottom under a soft edge (`scroll-edge`, the
 * page's crop, not app UI).
 *
 * Fills its container (h-full): put it in a `DesktopWindow` (active
 * "nearby") or crop it into the chapter's panel. Wants about 560 px or more.
 *
 * Parts: nearby-panel (data-state), panel-header, panel-viewport,
 * panel-scroll, panel-above, location-card (and its parts), panel-near,
 * event-chip, near-field, near-helper, panel-within, radius-<km> (data-on),
 * panel-looking, role-<role> (data-on, data-empty, data-count),
 * count-<role>, panel-results, panel-list, row-<name> (data-km, hidden),
 * km-<name>, scroll-edge.
 */

export type NearbyPanelScroll = 'top' | 'near';

const MUTED = 'text-[#A08E84]';

/** The web's section eyebrow: 11 px bold, uppercase, 0.12em. A plain p, never a heading, inside a mock. */
function Eyebrow({ children }: { children: ReactNode }) {
  return <p className={`text-[11px] font-bold uppercase leading-4 tracking-[0.12em] ${MUTED}`}>{children}</p>;
}

/** Button size sm: radius 9.6 px, gap 4; h-7 and 12.8 px medium unless a call overrides them (the event chip). */
const BUTTON_SM = 'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-[9.6px] border';
const SM_TEXT = 'h-7 px-2.5 text-[0.8rem] font-medium';
const BUTTON_DEFAULT = 'border-transparent bg-[#A85D35] text-white';
const BUTTON_OUTLINE = 'border-[#362F2B] bg-[#362F2B4D] text-[#F2EDE8]';

/** A ghost Button, sm, h-6 px-2 text-xs: "Back to my location", "Clear". */
function Ghost({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-[9.6px] px-2 text-xs font-medium text-[#F2EDE8]">{children}</span>;
}

function Row({ person, hidden, last }: { person: Neighbour; hidden: boolean; last: boolean }) {
  const id = slug(person.name);
  return (
    <div
      data-part={`row-${id}`}
      data-km={person.km}
      hidden={hidden}
      className={`flex items-center gap-3 px-4 py-3 ${last ? '' : 'border-b border-[#362F2B]'}`}
    >
      <Avatar surface="web" name={person.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5">{person.name}</p>
        <p className={`mt-0.5 flex items-center gap-1 text-xs leading-4 ${MUTED}`}>
          <MapPin aria-hidden className="size-3 shrink-0" />
          <span>
            <DistanceText km={person.km} part={`km-${id}`} />
          </span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {person.roles.map((role) => (
            <span
              key={role}
              className={`inline-flex h-5 items-center whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium ${
                SEARCH_ROLES.includes(role) ? 'bg-[#D18A5A] text-[#161311]' : 'bg-[#26221F] text-[#BCADA3]'
              }`}
            >
              {role}
            </span>
          ))}
        </div>
      </div>
      <span className={`${BUTTON_SM} ${BUTTON_DEFAULT} ${SM_TEXT}`}>
        <UserPlus aria-hidden className="size-3.5" />
        {NEARBY.add}
      </span>
    </div>
  );
}

function RoleChip({ role, count }: { role: Role; count: number }) {
  const on = SEARCH_ROLES.includes(role);
  const empty = count === 0 && !on;
  const id = slug(role);
  return (
    <span
      data-part={`role-${id}`}
      data-on={on ? '' : undefined}
      data-empty={empty ? '' : undefined}
      data-count={count}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold leading-4 ${
        on ? 'border-[#D18A5A] bg-[#D18A5A] text-[#161311]' : 'border-[#362F2B] text-[#F2EDE8] data-[empty]:text-[#A08E84]'
      }`}
      style={{ opacity: empty ? 0.6 : 1 }}
    >
      {on && <Check aria-hidden className="size-3" />}
      {role}
      <span data-part={`count-${id}`} className={`inline-block min-w-[1ch] tabular-nums ${on ? 'opacity-80' : MUTED}`}>
        {count}
      </span>
    </span>
  );
}

export function NearbyPanel({
  state = 'r25-erased',
  scroll = 'near',
  maxRows,
  className = '',
}: {
  state?: NearbyState;
  /** What sits under the header. */
  scroll?: NearbyPanelScroll;
  /** Draw only the first n rows (see `NearbyPhone`); the list runs on under the edge. */
  maxRows?: number;
  className?: string;
}) {
  const { radius, counts, all, shown, last } = nearbySearch(state);
  const drawn = maxRows === undefined ? all : all.slice(0, Math.max(0, maxRows));
  const card = <LocationCard platform="web" state="on" />;

  return (
    <div
      aria-hidden
      data-part="nearby-panel"
      data-state={state}
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-[#161311] text-left font-sans text-sm text-[#F2EDE8] ${className}`}
    >
      <div
        data-part="panel-header"
        className="relative z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[#362F2B] bg-[#161311] px-6 py-5"
      >
        <div className="min-w-0">
          <p className="truncate text-xl font-bold leading-7 tracking-tight">{NEARBY.title}</p>
          <p className={`mt-1 text-sm leading-5 ${MUTED}`}>{NEARBY.description}</p>
        </div>
        <span className="flex shrink-0 items-center">
          <span className="grid size-8 place-items-center">
            <Bell aria-hidden className="size-5" />
          </span>
          <span className="grid size-8 place-items-center">
            <Moon aria-hidden className="size-4" />
          </span>
        </span>
      </div>

      <div data-part="panel-viewport" className="relative min-h-0 flex-1 overflow-hidden">
        <div data-part="panel-scroll" className="mx-auto w-full max-w-3xl px-6 py-6">
          {scroll === 'near' ? (
            <div data-part="panel-above" className="flex h-0 flex-col justify-end">
              {card}
            </div>
          ) : (
            card
          )}

          <div data-part="panel-near" className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <Eyebrow>{NEARBY.near}</Eyebrow>
              <Ghost>{NEARBY.backToMe}</Ghost>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span data-part="event-chip" data-on="" className={`${BUTTON_SM} ${BUTTON_DEFAULT} px-2.5 py-1 text-xs font-normal leading-4`}>
                <span className="font-semibold">{EVENT_CHIP.title}</span>
                <span className="opacity-70">· {EVENT_CHIP.place}</span>
              </span>
            </div>
            <div data-part="near-field" className="relative">
              <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A08E84]" />
              <div className="flex h-8 w-full items-center rounded-[12px] border border-[#362F2B] bg-[#362F2B4D] py-1 pl-9 pr-2.5 text-sm">
                {EVENT_CHIP.place}
              </div>
            </div>
            <p data-part="near-helper" className={`mt-2 text-xs leading-4 ${MUTED}`}>
              {NEARBY.measuring}
            </p>
          </div>

          <div data-part="panel-within" className="mt-6">
            <div className="mb-2">
              <Eyebrow>{NEARBY.within}</Eyebrow>
            </div>
            <div className="flex flex-wrap gap-2">
              {RADII.map((r, i) => (
                <span
                  key={r}
                  data-part={`radius-${r}`}
                  data-on={r === radius ? '' : undefined}
                  className={`${BUTTON_SM} ${BUTTON_OUTLINE} ${SM_TEXT} data-[on]:border-transparent data-[on]:bg-[#A85D35] data-[on]:text-white`}
                >
                  {RADIUS_LABELS[i]}
                </span>
              ))}
            </div>
          </div>

          <div data-part="panel-looking" className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <Eyebrow>{NEARBY.lookingFor}</Eyebrow>
              <Ghost>{NEARBY.clear}</Ghost>
            </div>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((role) => (
                <RoleChip key={role} role={role} count={counts[role]} />
              ))}
            </div>
            <p className={`mt-2 text-xs leading-4 ${MUTED}`}>{NEARBY.anyoneWho}</p>
          </div>

          <div data-part="panel-results" className="mt-6">
            <div className="mb-2">
              <Eyebrow>{NEARBY.suggested}</Eyebrow>
            </div>
            <div
              data-part="panel-list"
              className="overflow-hidden rounded-[16.8px] bg-[#1E1B18] py-4 shadow-[0_0_0_1px_rgba(242,237,232,0.1)]"
            >
              {drawn.map((n) => (
                <Row key={n.name} person={n} hidden={!shown.has(n.name)} last={n.name === last} />
              ))}
            </div>
          </div>
        </div>

        {/* The page's crop: the list goes on below. Not app UI. */}
        <div
          data-part="scroll-edge"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{ background: 'linear-gradient(to top, #161311, rgba(22,19,17,0))' }}
        />
      </div>
    </div>
  );
}
