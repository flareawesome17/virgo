'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { APP_URL, SIGN_IN_URL, SIGN_UP_URL } from './links';

const SECTIONS = [
  { href: '#nearby', label: 'Hire' },
  { href: '#community', label: 'Community' },
  { href: '#delivery', label: 'Deliver' },
  { href: '#features', label: 'Features' },
  { href: '#pricing', label: 'Pricing' },
];

/**
 * The marketing header.
 *
 * Transparent over the hero and solid once you scroll past it — a permanent
 * bar over a full-bleed hero cuts the image in half, and an invisible one over
 * body copy makes the links unreadable.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

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
          {SECTIONS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-white/60 transition-colors hover:text-white"
            >
              {item.label}
            </a>
          ))}
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
