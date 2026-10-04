import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

/**
 * A browser window around the web app, in the web app's dark theme: Geist,
 * `#161311`, primary fills `#D18A5A` with `#161311` text (research-app-ui
 * tokens). Generic chrome — three window dots and an address bar, no tabs,
 * no browser brand.
 *
 * Wrap it in a `Slab` with `radius={BROWSER_RADIUS}` for thickness.
 *
 * Parts: browser, browser-bar, url-bar, url, viewport.
 */

export const BROWSER_RADIUS = 'rounded-xl';

/** The three window dots. Muted a step, so they read as chrome, not as the picture. */
export const WINDOW_DOTS = ['#E5584F', '#E2AE3A', '#3FB24C'] as const;

export function WindowDots({ size = 12 }: { size?: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center" style={{ gap: size * 0.66 }}>
      {WINDOW_DOTS.map((c) => (
        <span
          key={c}
          className="rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.35)]"
          style={{ width: size, height: size, background: c }}
        />
      ))}
    </span>
  );
}

export function BrowserFrame({
  url,
  children,
  width = '100%',
  className = '',
  viewportClassName = '',
}: {
  /** The address bar's text, without the scheme: "web.virgo.ph/nearby". */
  url: string;
  children?: ReactNode;
  /** Any CSS width. */
  width?: string | number;
  className?: string;
  /** Classes for the page area (height, padding). */
  viewportClassName?: string;
}) {
  return (
    <div
      data-part="browser"
      className={`overflow-hidden ${BROWSER_RADIUS} border border-[#362F2B] bg-[#161311] font-sans text-[#F2EDE8] ${className}`}
      style={{ width }}
    >
      <div
        data-part="browser-bar"
        className="flex h-10 items-center gap-3 border-b border-[#362F2B] bg-[#1A1715] px-3.5 md:h-11"
      >
        <WindowDots />
        <div
          data-part="url-bar"
          className="mx-auto flex h-7 min-w-0 max-w-[440px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#26221F] px-3 text-[12px] text-[#BCADA3]"
        >
          <Lock aria-hidden className="size-3 shrink-0 opacity-70" strokeWidth={2.25} />
          <span data-part="url" className="truncate tracking-[0.005em]">
            {url}
          </span>
        </div>
        {/* As wide as the dots, so the address bar sits on the centre line. */}
        <span aria-hidden className="hidden w-[52px] shrink-0 sm:block" />
      </div>
      <div data-part="viewport" className={`relative ${viewportClassName}`}>
        {children}
      </div>
    </div>
  );
}
