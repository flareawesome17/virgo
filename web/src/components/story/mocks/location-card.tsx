import { MapPin, ShieldCheck } from 'lucide-react';
import { CITY_VALUE, NEARBY } from '../data/strings/ch2';
import { PHONE_FONT } from '../frames/phone-frame';

/**
 * "Share my location": the card both Nearby screens open with, in its two
 * real states (Ch2's closing beat, and the top of `NearbyPhone` /
 * `NearbyPanel`).
 *
 * - **off**: "You are not discoverable", the switch off, and the way in for
 *   anyone who won't share a device position — the helper ("Would rather not
 *   share a live position? Name your city instead…") and the city box, here
 *   with "Cebu City" typed in, the moment before the app turns sharing on.
 * - **on**: "Discoverable · Cebu City", the switch on, the tile green.
 *
 * Both keep the privacy line under a hairline. Phone values follow
 * `mobile/app/(app)/discover/nearby.tsx` (16 px card, 12 px tile, the app's
 * own greens and taupes, an OS-neutral switch on `#B66A40`); web values
 * follow `web/src/app/(app)/nearby/page-client.tsx` (Card, Switch and Input
 * in the web dark theme, Geist). On the phone the city box is the card's own
 * colour, as in the app, so only its pin and text show.
 *
 * One attribute flips it: the root carries `data-on` when sharing, and every
 * difference (tile, pin, status line, switch, the city block) is CSS keyed
 * off it. A Phase 4 island can flip the card in place by toggling `data-on`
 * and moving `switch-thumb` (transform); or render the two states as two
 * frames, as the chapter does.
 *
 * Parts: location-card (data-on, data-platform), location-tile,
 * location-status, location-switch, switch-thumb, city-block, city-field,
 * privacy.
 */

export type LocationCardState = 'off' | 'on';

function PhoneCard({ on, className }: { on: boolean; className: string }) {
  return (
    <div
      aria-hidden
      data-part="location-card"
      data-platform="phone"
      data-on={on ? '' : undefined}
      className={`group rounded-[16px] bg-[#1E1B18] p-4 text-left text-[#F2EDE8] ${className}`}
      style={{ fontFamily: PHONE_FONT }}
    >
      <div className="flex items-center gap-3">
        <span
          data-part="location-tile"
          className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#A8948920] text-[#8B7355] group-data-[on]:bg-[#6B8E4E18] group-data-[on]:text-[#6B8E4E]"
        >
          <MapPin aria-hidden size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-5">{NEARBY.share}</p>
          <p data-part="location-status" className="mt-0.5 text-xs leading-4 text-[#A08E84]">
            <span className="group-data-[on]:hidden">{NEARBY.off}</span>
            <span className="hidden group-data-[on]:inline">{NEARBY.on}</span>
          </p>
        </div>
        {/* An OS-neutral switch: the app's track colours, a white thumb. */}
        <span
          data-part="location-switch"
          className="relative h-[26px] w-[44px] shrink-0 rounded-full bg-[#3A322C] group-data-[on]:bg-[#B66A40]"
        >
          <span
            data-part="switch-thumb"
            className="absolute left-[2px] top-[2px] size-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] group-data-[on]:translate-x-[18px]"
          />
        </span>
      </div>

      <div data-part="city-block" className="mt-3.5 border-t border-[#2A2522] pt-3.5 group-data-[on]:hidden">
        <p className="mb-2 text-[11px] leading-4 text-[#A08E84]">{NEARBY.cityHelp}</p>
        <div data-part="city-field" className="flex items-center gap-2 rounded-[12px] bg-[#1E1B18] px-3.5">
          <MapPin aria-hidden size={14} className="shrink-0 text-[#A08E84]" />
          <span className="min-w-0 flex-1 truncate py-3 text-sm leading-5">{CITY_VALUE}</span>
        </div>
      </div>

      <div data-part="privacy" className="mt-3.5 flex items-start gap-2 border-t border-[#2A2522] pt-3.5">
        <ShieldCheck aria-hidden size={13} className="mt-[1.5px] shrink-0 text-[#A08E84]" />
        <p className="flex-1 text-[11px] leading-4 text-[#A08E84]">{NEARBY.privacy}</p>
      </div>
    </div>
  );
}

function WebCard({ on, className }: { on: boolean; className: string }) {
  return (
    <div
      aria-hidden
      data-part="location-card"
      data-platform="web"
      data-on={on ? '' : undefined}
      className={`group overflow-hidden rounded-[16.8px] bg-[#1E1B18] py-4 text-left font-sans text-sm text-[#F2EDE8] shadow-[0_0_0_1px_rgba(242,237,232,0.1)] ${className}`}
    >
      <div className="px-4 py-5">
        <div className="flex items-center gap-3">
          <span
            data-part="location-tile"
            className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#2A2522] text-[#A08E84] group-data-[on]:bg-[#7DA55C26] group-data-[on]:text-[#7DA55C]"
          >
            <MapPin aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-5">{NEARBY.share}</p>
            <p data-part="location-status" className="text-xs leading-4 text-[#A08E84]">
              <span className="group-data-[on]:hidden">{NEARBY.off}</span>
              <span className="hidden group-data-[on]:inline">{NEARBY.on}</span>
            </p>
          </div>
          {/* The web Switch: 32 × 18.4, thumb 16. Dark: on is primary with a dark thumb. */}
          <span
            data-part="location-switch"
            className="relative inline-flex h-[18.4px] w-[32px] shrink-0 items-center rounded-full border border-transparent bg-[#362F2BCC] group-data-[on]:bg-[#D18A5A]"
          >
            <span
              data-part="switch-thumb"
              className="block size-4 rounded-full bg-[#F2EDE8] group-data-[on]:translate-x-[14px] group-data-[on]:bg-[#161311]"
            />
          </span>
        </div>

        <div data-part="city-block" className="mt-4 border-t border-[#362F2B] pt-4 group-data-[on]:hidden">
          <p className="mb-2 text-xs leading-4 text-[#A08E84]">{NEARBY.cityHelp}</p>
          {/* LocationField: an Input with a 16 px pin inside it. */}
          <div data-part="city-field" className="relative">
            <MapPin aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A08E84]" />
            <div className="flex h-8 w-full items-center rounded-[12px] border border-[#362F2B] bg-[#362F2B4D] py-1 pl-9 pr-2.5 text-sm">
              {CITY_VALUE}
            </div>
          </div>
        </div>

        <p
          data-part="privacy"
          className="mt-4 flex items-start gap-2 border-t border-[#362F2B] pt-4 text-xs leading-relaxed text-[#A08E84]"
        >
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {NEARBY.privacy}
        </p>
      </div>
    </div>
  );
}

export function LocationCard({
  state = 'on',
  platform = 'phone',
  className = '',
}: {
  state?: LocationCardState;
  /** Phone values and the system font, or the web dark theme and Geist. */
  platform?: 'phone' | 'web';
  className?: string;
}) {
  const on = state === 'on';
  return platform === 'web' ? <WebCard on={on} className={className} /> : <PhoneCard on={on} className={className} />;
}
