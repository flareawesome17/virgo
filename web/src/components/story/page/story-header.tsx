'use client';

import Image from 'next/image';
import { Menu, Pause, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DOWNLOAD_PATH, SIGN_IN_URL, SIGN_UP_URL, APP_URL } from '@/components/landing/links';
import { useMotionGate } from './motion';
import { PAUSE_KEY } from './pre-paint';
import { CHAPTER_LINKS, NAV_LINKS } from '../data/strings/page-nav';

/**
 * The story's header (storyboard §1.9): glass that follows the chapter's tone,
 * the section links, a Chapters menu, Pause motion, Sign in and Get started.
 * The mobile bar is used below 1024 px, so the wordmark never meets the links.
 */
export function StoryHeader({ sectionBase = '' }: { sectionBase?: string }) {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const [tone, setTone] = useState<'night' | 'day'>('night');
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();

  // Glass once the page has moved, and the tone of whichever chapter sits under the header.
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const sections = [...document.querySelectorAll<HTMLElement>('[data-tone]')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setTone(e.target.getAttribute('data-tone') === 'day' ? 'day' : 'night');
      },
      { rootMargin: '0px 0px -92% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
    };
  }, []);

  // Esc closes the menu and returns focus; focus leaving the panel closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);

  const togglePause = () => {
    const d = document.documentElement;
    const next = !d.hasAttribute('data-paused');
    if (next) d.setAttribute('data-paused', '');
    else d.removeAttribute('data-paused');
    try {
      localStorage.setItem(PAUSE_KEY, next ? '1' : '0');
    } catch {
      /* storage blocked: the toggle still works for this visit */
    }
  };

  const day = tone === 'day';
  const glass = solid ? (day ? 'bg-[#FFF8F4]/90 text-[#1E1B18] border-b border-black/5' : 'bg-[#161311]/90 text-[#F2EDE8] border-b border-white/5') : 'bg-transparent text-[#F2EDE8]';
  const link = day ? 'text-[#54433C] hover:text-[#1E1B18]' : 'text-[#BCADA3] hover:text-[#F2EDE8]';
  const focus = day ? 'focus-visible:outline-[#1E1B18]' : 'focus-visible:outline-[#F2EDE8]';

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 lg:backdrop-blur ${glass}`}>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-16">
        <a href={`${sectionBase}#top`} aria-label="Virgo home" className={`flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-3 ${focus}`}>
          <Image src="/logo.png" alt="" width={28} height={28} className="size-7" priority />
          <span className="text-[15px] font-semibold tracking-tight">Virgo</span>
        </a>
        <a href={APP_URL} className="sr-only focus:not-sr-only">
          Open the Virgo app
        </a>

        <nav aria-label="Sections" className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href.startsWith('#') ? `${sectionBase}${l.href}` : l.href}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${link} ${focus}`}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {gate.motion && (
            <button
              type="button"
              onClick={togglePause}
              aria-pressed={gate.paused}
              className={`hidden min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs sm:inline-flex ${link} focus-visible:outline-2 ${focus}`}
            >
              {gate.paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
              Pause motion
            </button>
          )}
          <a href={SIGN_IN_URL} className={`hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium lg:inline-flex ${link} focus-visible:outline-2 ${focus}`}>
            Sign in
          </a>
          <a
            href={SIGN_UP_URL}
            className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-3 ${focus} ${day ? 'bg-[#A85D35] text-white' : 'bg-[#D18A5A] text-[#161311]'}`}
          >
            Get started
          </a>
          <button
            ref={button}
            type="button"
            aria-expanded={open}
            aria-controls="story-chapters"
            onClick={() => setOpen((o) => !o)}
            className={`inline-flex size-11 items-center justify-center rounded-lg focus-visible:outline-2 ${focus}`}
          >
            {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
            <span className="sr-only">Chapters</span>
          </button>
        </div>
      </div>

      {open && (
        <div
          ref={panel}
          id="story-chapters"
          className="border-t border-white/5 bg-[#161311]/97 text-[#F2EDE8]"
        >
          <nav aria-label="Chapters" className="mx-auto grid max-w-7xl gap-x-6 px-4 py-3 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {CHAPTER_LINKS.map((c) => (
              <a
                key={c.href}
                href={`${sectionBase}${c.href}`}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-[15px] text-[#BCADA3] hover:text-[#F2EDE8] focus-visible:outline-2 focus-visible:outline-[#F2EDE8]"
              >
                <span className="w-6 font-mono text-[11px] text-[#D18A5A]">{c.n}</span>
                {c.label}
              </a>
            ))}
            <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3 sm:col-span-2 lg:col-span-3 lg:hidden">
              <a href={SIGN_IN_URL} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm">
                Sign in
              </a>
              <a href={DOWNLOAD_PATH} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm">
                Download
              </a>
              {gate.motion && (
                <button type="button" onClick={togglePause} aria-pressed={gate.paused} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm sm:hidden">
                  {gate.paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
                  Pause motion
                </button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
