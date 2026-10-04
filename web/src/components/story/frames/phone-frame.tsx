import type { ReactNode } from 'react';
import { OS } from '../data/strings/common';

/**
 * A phone, OS-neutral: a status bar, a screen, a home indicator, and a
 * camera dot. No notch, no island, no brand: the story runs on Android and
 * iOS alike, and either one drawn would be a claim about the other.
 *
 * On small screens there is no bezel — the phone *is* the reader's screen,
 * and a bezel inside a bezel only costs width. From `md` up a slim 7 px
 * bezel seats it as an object. Inside, everything follows the phone app:
 * the system font (the app sets none), the dark palette, mobile radii.
 *
 * Wrap it in a `Slab` with `radius={PHONE_RADIUS}` and `edge="device"` to
 * give it thickness; the radii here and there are the same classes. Size the
 * slab and pass `width="100%"` here, so the phone fills the slab exactly.
 *
 * Parts: phone, screen, status-bar, status-time, signal, signal-bar
 * (data-on), no-service, battery, phone-content, home-indicator.
 */

/** The outline, for a `Slab` around the phone: no bezel below md, bezel from md. */
export const PHONE_RADIUS = 'rounded-[38px] md:rounded-[46px]';

/** The system stack, as the phone app renders: SF Pro on iOS, Roboto on Android. */
export const PHONE_FONT =
  "system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export type SignalBars = 0 | 1 | 2 | 3 | 4;

function Signal({ bars }: { bars: SignalBars }) {
  return (
    <svg data-part="signal" width="18" height="12" viewBox="0 0 18 12" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          data-part="signal-bar"
          data-on={i < bars ? '' : undefined}
          x={i * 4.75}
          y={9 - i * 3}
          width="3.25"
          height={3 + i * 3}
          rx="0.9"
          fill="currentColor"
          opacity={i < bars ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}

function Wifi() {
  return (
    <svg data-part="wifi" width="16" height="12" viewBox="0 0 16 12" aria-hidden>
      <path
        d="M8 11.2 5.6 8.6a3.4 3.4 0 0 1 4.8 0Zm-4.3-4.6a6.1 6.1 0 0 1 8.6 0l1.3-1.4a8 8 0 0 0-11.2 0Zm-2.6-2.8a9.8 9.8 0 0 1 13.8 0L16.2 2.4a11.7 11.7 0 0 0-16.4 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Battery({ level }: { level: number }) {
  const w = Math.max(1.5, Math.round(19 * Math.max(0, Math.min(1, level)) * 10) / 10);
  return (
    <svg data-part="battery" width="27" height="13" viewBox="0 0 27 13" aria-hidden>
      <rect x="0.6" y="0.6" width="23" height="11.8" rx="3.4" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.1" />
      <rect x="2.6" y="2.6" width={w} height="7.8" rx="1.8" fill="currentColor" />
      <path d="M25 4.4v4.2a2.1 2.1 0 0 0 0-4.2Z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function PhoneFrame({
  children,
  time = '11:42',
  signal = 4,
  wifi = false,
  battery = 0.78,
  tone = 'light',
  screen = '#161311',
  width = 'min(100%, 340px)',
  ratio = 9 / 19.5,
  homeIndicator = true,
  className = '',
}: {
  children?: ReactNode;
  /** The status bar clock, as a phone writes it: "5:00", no AM/PM. */
  time?: string;
  /** 0 draws empty bars and "No service" — the 5:00 AM reminder still rings. */
  signal?: SignalBars;
  wifi?: boolean;
  /** 0–1. */
  battery?: number;
  /** Status bar ink: light on dark screens, dark on the client page's paper. */
  tone?: 'light' | 'dark';
  /** The screen's background colour. */
  screen?: string;
  /** Any CSS width; the height follows `ratio`. */
  width?: string | number;
  /** Screen width / height. Pass 0 to let the content set the height. */
  ratio?: number;
  homeIndicator?: boolean;
  className?: string;
}) {
  const ink = tone === 'light' ? '#F2EDE8' : '#1E1B18';

  return (
    <div
      data-part="phone"
      className={`relative ${PHONE_RADIUS} md:bg-[#0c0a09] md:p-[7px] md:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),inset_0_0_0_2.5px_#000] ${className}`}
      style={{ width }}
    >
      <div
        data-part="screen"
        className="relative flex flex-col overflow-hidden rounded-[38px] md:rounded-[39px]"
        style={{
          aspectRatio: ratio > 0 ? ratio : undefined,
          background: screen,
          color: ink,
          fontFamily: PHONE_FONT,
        }}
      >
        <div
          data-part="status-bar"
          className="relative z-20 flex h-[46px] shrink-0 items-center justify-between pl-[30px] pr-[24px] pt-[5px]"
        >
          <span data-part="status-time" className="text-[15px] font-semibold tabular-nums tracking-[-0.01em]">
            {time}
          </span>
          {/* The front camera: a dot, as on most phones of either kind. */}
          <span aria-hidden className="absolute left-1/2 top-[11px] size-[10px] -translate-x-1/2 rounded-full bg-[#050404] shadow-[inset_0_0_0_1.5px_#17120f]" />
          <span className="flex items-center gap-[5px]">
            {signal === 0 && (
              <span data-part="no-service" className="mr-0.5 text-[12px] font-medium opacity-80">
                {OS.noService}
              </span>
            )}
            <Signal bars={signal} />
            {wifi && <Wifi />}
            <Battery level={battery} />
          </span>
        </div>
        <div data-part="phone-content" className="relative min-h-0 flex-1">
          {children}
        </div>
        {homeIndicator && (
          <span
            aria-hidden
            data-part="home-indicator"
            className="pointer-events-none absolute bottom-[8px] left-1/2 z-20 h-[5px] w-[36%] -translate-x-1/2 rounded-full"
            style={{ background: tone === 'light' ? 'rgba(242,237,232,0.6)' : 'rgba(30,27,24,0.45)' }}
          />
        )}
        {/* Below md there is no bezel, and the screen is the page's own
            colour: a hairline keeps its outline. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(242,237,232,0.1)] md:shadow-none"
        />
      </div>
    </div>
  );
}
