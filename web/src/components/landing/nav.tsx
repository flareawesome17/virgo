'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { APP_URL, SIGN_IN_URL, SIGN_UP_URL } from './links';
import { useActiveSection } from './use-active-section';

const SECTIONS = [
  { id: 'nearby', label: 'Hire' },
  { id: 'community', label: 'Community' },
  { id: 'delivery', label: 'Deliver' },
  { id: 'features', label: 'Features' },
  { id: 'pricing', label: 'Pricing' },
];

/** Stable identity so the observer is not torn down on every render. */
const SECTION_IDS = SECTIONS.map((s) => s.id);

/**
 * The marketing header.
 *
 * Transparent over the hero and solid once you scroll past it — a permanent
 * bar over a full-bleed hero cuts the image in half, and an invisible one over
 * body copy makes the links unreadable.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useActiveSection(SECTION_IDS);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    // Passive: this listener never calls preventDefault, and saying so lets
    // the browser scroll without waiting to find out.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes it, because a panel covering the page with no visible way
  // back is the one thing worse than no menu at all.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    // Crossing into the desktop layout leaves the panel orphaned over a nav
    // that is now visible anyway.
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => mq.matches && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onChange);
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-white/10 bg-[#161311]/85 backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <a
          href="#top"
          className="flex min-h-11 items-center gap-2.5"
          aria-label="Virgo home"
        >
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className="size-7 object-contain"
            priority
          />
          <span className="text-[15px] font-bold tracking-tight text-white">Virgo</span>
        </a>

        <nav className="ml-auto hidden items-center gap-7 md:flex">
          {SECTIONS.map((item) => {
            const isActive = active === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                // Announces the current section to a screen reader, which
                // otherwise gets nothing from a colour change.
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'relative py-1 text-[13px] transition-colors',
                  isActive
                    ? 'font-semibold text-white'
                    : 'font-medium text-white/60 hover:text-white',
                )}
              >
                {item.label}
                {/* Absolutely positioned so appearing costs no layout — the
                    labels do not shift as the underline moves between them. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute -bottom-0.5 left-0 h-0.5 rounded-full bg-[#c17745] transition-all duration-300',
                    isActive ? 'w-full opacity-100' : 'w-0 opacity-0',
                  )}
                />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <a
            href={SIGN_IN_URL}
            className="hidden min-h-11 items-center whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex md:min-h-9"
          >
            Sign in
          </a>
          <a
            href={SIGN_UP_URL}
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-[#c17745] px-4 py-2 text-[13px] font-bold text-white shadow-lg shadow-[#c17745]/25 transition-transform hover:bg-[#cd8250] active:scale-[0.97] md:min-h-9"
          >
            Get started
          </a>

          {/* Below md the section links are hidden and nothing replaced them,
              so a phone visitor had no way to reach Pricing short of scrolling
              the entire page. 44px square, which is the smallest comfortable
              touch target. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="grid size-11 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Rendered only when open: the links already exist in the desktop nav
          above, so leaving a second hidden copy in the DOM would give crawlers
          and screen readers every section name twice. */}
      {menuOpen && (
        <nav
          id="landing-menu"
          className="border-t border-white/10 bg-[#161311]/95 backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col px-3 py-2">
            {SECTIONS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setMenuOpen(false)}
                aria-current={active === item.id ? 'true' : undefined}
                className={cn(
                  'flex min-h-11 items-center rounded-lg px-3 text-[15px] transition-colors',
                  active === item.id
                    ? 'bg-white/[0.06] font-semibold text-white'
                    : 'font-medium text-white/70 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                {item.label}
              </a>
            ))}

            {/* Where Sign in goes on the screens too narrow to keep it in the
                bar. Divided off, because it is an account action rather than
                another place on this page. */}
            <a
              href={SIGN_IN_URL}
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex min-h-11 items-center rounded-lg border-t border-white/8 px-3 pt-3 text-[15px] font-medium text-white/70 transition-colors hover:text-white sm:hidden"
            >
              Sign in
            </a>
          </div>
        </nav>
      )}
      <span className="sr-only">
        <a href={APP_URL}>Open the Virgo app</a>
      </span>
    </header>
  );
}
