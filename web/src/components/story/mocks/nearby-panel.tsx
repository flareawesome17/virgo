import type { ReactNode } from 'react';
import { Bell, Check, MapPin, Menu, Moon, UserPlus } from 'lucide-react';
import { RADII, ROLES, SEARCH_ROLES, type Neighbour, type Role } from '../data/story';
import { EVENT_CHIP, NEARBY, NEAR_PLACEHOLDER, RADIUS_LABELS } from '../data/strings/ch2';
import { Avatar } from './avatar';
import { LocationCard } from './location-card';
import { DistanceText, nearbySearch, slug, type NearbyFrom, type NearbyState } from './nearby-phone';

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
 * NEAR flips as on the phone (`near`: `event`, the default, or `home`, the
 * moment before the shoot's chip is picked), through `data-on` on
 * `panel-near`. One difference from the phone, as in the app: the web's
 * "Back to my location" is a 24 px ghost Button, so the row grows 8 px when
 * it appears; the flip shows it with `display`, a discrete layout change,
 * exactly as the page does.
 *
 * `shell` picks the app shell around the column, as the web draws it at two
 * widths:
 * - `wide` (the default): 1024 px and up, beside the sidebar. PageHeader
 *   carries the bell and the theme button. Use it in a `DesktopWindow`
 *   (active "nearby"), or for the chapter's crop of the column.
 * - `narrow`: under 1024 px, where the sidebar goes. The shell's own bar
 *   (the menu button, the page's name, the bell, the theme button) sits on
 *   top, and PageHeader keeps only its title. This is what a browser window
 *   the width of Ch2's desktop panel (about 650 px) shows: use it in a
 *   `BrowserFrame` at `web.virgo.ph/nearby`.
 *
 * `scroll` picks what sits under the header: `top` (the sharing card first)
 * or `near` (the default: the card has scrolled up, and NEAR leads, which is
 * where Ch2's panel opens). Everything above the anchor hangs in a
 * zero-height box, so a Phase 4 island scrolls by translating `panel-scroll`.
 * A long list runs off the bottom under a soft edge (`scroll-edge`, the
 * page's crop, not app UI).
 *
 * Fills its container (h-full). Wants about 560 px or more.
 *
 * Parts: nearby-panel (data-state, data-shell), shell-bar, panel-header,
 * panel-viewport, panel-scroll, panel-above, location-card (and its parts),
 * panel-near (data-on), back-to-me, event-chip, near-field,
 * near-placeholder, near-value, near-helper-home, near-helper,
 * panel-within, radius-<km> (data-on), panel-looking, role-<role> (data-on,
 * data-empty, data-count), count-<role>, panel-results, panel-list,
 * row-<name> (data-km, hidden), km-<name>, scroll-edge.
 */

export type NearbyPanelScroll = 'top' | 'near';
export type NearbyPanelShell = 'wide' | 'narrow';

const MUTED = 'text-[#A08E84]';
/** Two layers in one grid cell, crossfaded by opacity: no layout change between them. */
const STACK = 'col-start-1 row-start-1';

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
function Ghost({ children, part, className = 'inline-flex' }: { children: ReactNode; part?: string; className?: string }) {
  return (
    <span data-part={part} className={`h-6 items-center rounded-[9.6px] px-2 text-xs font-medium text-[#F2EDE8] ${className}`}>
      {children}
    </span>
  );
}

/** A ghost icon Button (size-8), as the bell, the theme toggle and the shell's menu button are drawn. */
function IconButton({ children }: { children: ReactNode }) {
  return <span className="grid size-8 shrink-0 place-items-center rounded-[12px]">{children}</span>;
}

/** NotificationBell and ThemeToggle, as they sit in a header: Bell at 20 px, the dark theme's Moon at 16. */
function HeaderActions() {
  return (
    <>
      <IconButton>
        <Bell aria-hidden className="size-5" />
      </IconButton>
      <IconButton>
        <Moon aria-hidden className="size-4" />
      </IconButton>
    </>
  );
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

/**
 * NEAR on the web. On (`data-on`, measuring from the shoot): the chip is the
 * default Button, "Back to my location" shows, the box holds the city, and
 * the helper says it measures from there. Off: the chip is an outline
 * Button, the box is empty with her own place as placeholder (muted, the
 * Input's placeholder colour), and the helper says it searches from where
 * she is.
 */
function Near({ from }: { from: NearbyFrom }) {
  const on = from === 'event';
  return (
    <div data-part="panel-near" data-on={on ? '' : undefined} className="group/near mt-6">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>{NEARBY.near}</Eyebrow>
        <Ghost part="back-to-me" className="hidden group-data-[on]/near:inline-flex">
          {NEARBY.backToMe}
        </Ghost>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <span
          data-part="event-chip"
          className={`${BUTTON_SM} ${BUTTON_OUTLINE} px-2.5 py-1 text-xs font-normal leading-4 group-data-[on]/near:border-transparent group-data-[on]/near:bg-[#A85D35] group-data-[on]/near:text-white`}
        >
          <span className="font-semibold">{EVENT_CHIP.title}</span>
          <span className="opacity-70">· {EVENT_CHIP.place}</span>
        </span>
      </div>
      {/* LocationField: an Input with a 16 px pin inside it. */}
      <div data-part="near-field" className="relative">
        <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A08E84]" />
        <div className="grid h-8 w-full grid-cols-1 items-center rounded-[12px] border border-[#362F2B] bg-[#362F2B4D] py-1 pl-9 pr-2.5 text-sm">
          <span data-part="near-placeholder" className={`${STACK} truncate ${MUTED} group-data-[on]/near:opacity-0`}>
            {NEAR_PLACEHOLDER}
          </span>
          <span data-part="near-value" className={`${STACK} truncate opacity-0 group-data-[on]/near:opacity-100`}>
            {EVENT_CHIP.place}
          </span>
        </div>
      </div>
      <div className={`mt-2 grid grid-cols-1 text-xs leading-4 ${MUTED}`}>
        <p data-part="near-helper-home" className={`${STACK} group-data-[on]/near:opacity-0`}>
          {NEARBY.searching}
        </p>
        <p data-part="near-helper" className={`${STACK} opacity-0 group-data-[on]/near:opacity-100`}>
          {NEARBY.measuring}
        </p>
      </div>
    </div>
  );
}

export function NearbyPanel({
  state = 'r25-erased',
  scroll = 'near',
  near = 'event',
  shell = 'wide',
  maxRows,
  className = '',
}: {
  state?: NearbyState;
  /** What sits under the header. */
  scroll?: NearbyPanelScroll;
  /** What NEAR measures from: the shoot's chip picked (default), or the moment before. */
  near?: NearbyFrom;
  /** The app shell at 1024 px and up (default), or under it, as in a narrow browser window. */
  shell?: NearbyPanelShell;
  /** Draw only the first n rows (see `NearbyPhone`); the list runs on under the edge. */
  maxRows?: number;
  className?: string;
}) {
  const { radius, counts, all, shown, last } = nearbySearch(state);
  const drawn = maxRows === undefined ? all : all.slice(0, Math.max(0, maxRows));
  const card = <LocationCard platform="web" state="on" />;
  const narrow = shell === 'narrow';

  return (
    <div
      aria-hidden
      data-part="nearby-panel"
      data-state={state}
      data-shell={shell}
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-[#161311] text-left font-sans text-sm text-[#F2EDE8] ${className}`}
    >
      {narrow && (
        // AppShell's own bar under lg: outside the page's scroll, pinned by the layout.
        <div data-part="shell-bar" className="flex h-14 shrink-0 items-center gap-2 border-b border-[#362F2B] px-4">
          <IconButton>
            <Menu aria-hidden className="size-5" />
          </IconButton>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{NEARBY.title}</p>
          <HeaderActions />
        </div>
      )}

      <div
        data-part="panel-header"
        className="relative z-10 flex shrink-0 items-start justify-between gap-4 border-b border-[#362F2B] bg-[#161311] px-6 py-5"
      >
        <div className="min-w-0">
          <p className="truncate text-xl font-bold leading-7 tracking-tight">{NEARBY.title}</p>
          <p className={`mt-1 text-sm leading-5 ${MUTED}`}>{NEARBY.description}</p>
        </div>
        {/* The bell and the theme button live here from lg; under it they are in the shell's bar. */}
        {!narrow && (
          <span className="flex shrink-0 items-center">
            <HeaderActions />
          </span>
        )}
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

          <Near from={near} />

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
