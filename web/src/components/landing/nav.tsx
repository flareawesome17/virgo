'use client';

import { useEffect, useState } from 'react';
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
  const active = useActiveSection(SECTION_IDS);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    // Passive: this listener never calls preventDefault, and saying so lets
    // the browser scroll without waiting to find out.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
        <a href="#top" className="flex items-center gap-2.5" aria-label="Virgo home">
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
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign in
          </a>
          <a
            href={SIGN_UP_URL}
            className="rounded-lg bg-[#c17745] px-4 py-2 text-[13px] font-bold text-white shadow-lg shadow-[#c17745]/25 transition-transform hover:bg-[#cd8250] active:scale-[0.97]"
          >
            Get started
          </a>
        </div>
      </div>
      <span className="sr-only">
        <a href={APP_URL}>Open the Virgo app</a>
      </span>
    </header>
  );
}
