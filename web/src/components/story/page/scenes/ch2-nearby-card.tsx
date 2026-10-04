import type { ReactNode } from 'react';
import { RADII, SEARCH_ROLES, rows, type Neighbour } from '../../data/story';
import { NEARBY, kmAway } from '../../data/strings/ch2';
import { Gear, gearFor } from './ch1-job-card';

/**
 * Ch2's Nearby search, composed for the film from the app's own words
 * (strings/ch2.ts › NEARBY, kmAway) and the story's roster (story.ts): the
 * roles with their tools, the distances, and the people inside the ring, in
 * whole kilometres. Server-safe pieces, so the static page draws the still
 * and the film plays the same parts.
 */

export const NEARBY_CARD =
  'rounded-[22px] border border-[#362F2B] bg-[linear-gradient(180deg,#221D1A_0%,#161311_100%)] p-5 text-left shadow-[0_40px_80px_-40px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6';

export const NEARBY_LABEL = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[#A08E84]';

/** The distance chips the card shows: the first three of the app's radii. */
export const CARD_KM = RADII.slice(0, 3);

/** The people a 25 km search lists for Mika's roles, nearest first (after the erase). */
export const ROWS_25: readonly Neighbour[] = rows(25);

/** The searched role a person turns up under. */
export const matchedRole = (n: Neighbour) => n.roles.find((r) => SEARCH_ROLES.includes(r)) ?? n.roles[0];

const CHIP = 'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[15px] font-medium';
const CHIP_ON = 'border-[#A85D35] bg-[#A85D35] text-white';
const CHIP_OFF = 'border-[#362F2B] bg-[#1E1B18] text-[#BCADA3]';

export function RoleChip({ role, on }: { role: string; on: boolean }) {
  return (
    <span className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
      <Gear kind={gearFor(role)} height={role === 'HMUA' ? 24 : 18} />
      {role}
    </span>
  );
}

export function KmChip({ km, on }: { km: number; on: boolean }) {
  return <span className={`${CHIP} tabular-nums ${on ? CHIP_ON : CHIP_OFF}`}>{km} km</span>;
}

export function PersonRow({ n }: { n: Neighbour }) {
  const role = matchedRole(n);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid w-12 shrink-0 place-items-center">
        <Gear kind={gearFor(role)} height={role === 'HMUA' ? 32 : 24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-tight text-[#F2EDE8]">{n.name}</span>
        <span className="block truncate text-[15px] leading-tight text-[#A08E84]">{role}</span>
      </span>
      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-[#F0C88E]">{kmAway(n.km)}</span>
    </div>
  );
}

/** A labelled block inside the card. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className={NEARBY_LABEL}>{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** The still: the search at 25 km for Mika's three roles, and who it finds. */
export function NearbyStill({ rowCount = 4 }: { rowCount?: number }) {
  return (
    <div className={NEARBY_CARD}>
      <Field label={NEARBY.lookingFor}>
        <div className="flex flex-wrap gap-2">
          {SEARCH_ROLES.map((r) => (
            <RoleChip key={r} role={r} on />
          ))}
        </div>
      </Field>
      <div className="mt-4">
        <Field label={NEARBY.within}>
          <div className="flex flex-wrap gap-2">
            {CARD_KM.map((km) => (
              <KmChip key={km} km={km} on={km === 25} />
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-4 border-t border-[#2A2522] pt-2">
        {ROWS_25.slice(0, rowCount).map((n) => (
          <PersonRow key={n.name} n={n} />
        ))}
      </div>
    </div>
  );
}
