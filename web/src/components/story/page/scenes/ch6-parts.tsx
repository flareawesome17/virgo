import type { ReactNode } from 'react';
import { ALBUM, CLIENT } from '../../data/story';
import { CLIENT_FONTS, CLIENT_SUMMARY } from '../../data/strings/ch6';
import { PHONE_RADIUS, PhoneFrame, Slab } from '../../frames';
import { Plate } from '../../mocks/plate';

/**
 * Ch6's pieces, drawn once for both halves (server-safe, no hooks): the
 * client link as a card, and a phone shell for the couple's page or Mika's
 * notifications.
 */

/** Scroll length of Ch6's one shot, in svh beyond the stage (the server reserves it). */
export const CH6_LENGTH = 140;

/** The link, as a card: three frames, the album's name, its size, the address. */
export function LinkCard({ rule }: { rule?: ReactNode }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-[22px] bg-white ring-1 ring-[rgba(122,62,30,0.14)]" style={{ fontFamily: CLIENT_FONTS.sans }}>
      <div className="grid grid-cols-3 gap-[2px]">
        {[44, 70, 56].map((seed) => (
          <Plate key={seed} seed={seed} aspect="4:5" />
        ))}
      </div>
      <div className="px-5 pb-5 pt-4">
        <p className="text-[22px] leading-tight text-[#1E1B18]" style={{ fontFamily: CLIENT_FONTS.serif }}>
          {CLIENT.album}
        </p>
        <p className="mt-1 text-[13px] text-[#6F5C52]" style={{ fontFamily: CLIENT_FONTS.mono }}>
          {CLIENT_SUMMARY.sunday}
        </p>
        <div className="relative mt-4 inline-flex">
          <p className="rounded-full bg-[#F3ECE3] px-3 py-1.5 text-[13px] text-[#7A3E1E]" style={{ fontFamily: CLIENT_FONTS.mono }}>
            {ALBUM.linkPath}
          </p>
          {rule}
        </div>
      </div>
    </div>
  );
}

/** A phone on a slab: the couple's (paper screen) or Mika's (night screen). */
export function PhoneShell({
  children,
  time,
  night = false,
  rotateY = -6,
  className = '',
}: {
  children: ReactNode;
  time: string;
  night?: boolean;
  rotateY?: number;
  className?: string;
}) {
  return (
    <Slab className={className} rotateX={3} rotateY={rotateY} depth={12} radius={PHONE_RADIUS} edge="device" shadow="floor">
      <PhoneFrame width="100%" time={time} tone={night ? 'light' : 'dark'} screen={night ? '#161311' : '#FBF7F2'} wifi>
        {children}
      </PhoneFrame>
    </Slab>
  );
}
