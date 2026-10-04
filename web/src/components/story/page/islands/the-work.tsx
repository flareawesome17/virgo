'use client';

import { useMotionValueEvent } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { useChapterProgress, useMotionGate } from '../motion';

/**
 * The work's stage (storyboard §2, the interlude). Enhances the server render
 * in place: the card and the post's other pieces rise once on entry, then
 * turn with scroll to face the reader while HOW IT WAS MADE reveals and the
 * craft tags tick on. Transform and opacity only, written to existing
 * `[data-part]` elements; nothing re-renders per frame. Static readers keep
 * the server's rest pose (every part shown).
 */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const out = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (n: number) => Math.round(n * 100) / 100;

const ENTER = 'cubic-bezier(0.16, 1, 0.3, 1)';

type Saved = { el: HTMLElement; transform: string; opacity: string };

export function TheWorkStage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const progress = useChapterProgress(root, 'cover');
  const parts = useRef<{
    card: HTMLElement | null;
    body: HTMLElement | null;
    sheenA: HTMLElement | null;
    sheenB: HTMLElement | null;
    backs: HTMLElement[];
    note: HTMLElement | null;
    tags: HTMLElement[];
    mobile: boolean;
  } | null>(null);

  const apply = (p: number) => {
    const s = parts.current;
    if (!s) return;
    const tilt = s.mobile ? 10 : 18;
    // The card turns to face the reader as it climbs the screen, and lands square by the time the note is read.
    const turn = out(span(p, 0.08, 0.5));
    const ry = lerp(-tilt * 0.9, -tilt * 0.22, turn);
    const rx = lerp(tilt * 0.55, tilt * 0.18, turn);
    const z = lerp(-30, 18, turn);
    if (s.body) s.body.style.transform = `rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) translateZ(${r2(z)}px)`;
    const t = Math.max(-1, Math.min(1, ry / 18));
    if (s.sheenA) s.sheenA.style.opacity = String(r2(0.5 - t * 0.5));
    if (s.sheenB) s.sheenB.style.opacity = String(r2(0.5 + t * 0.5));
    // The post's other pieces fan out behind it, in depth.
    const fan = out(span(p, 0.1, 0.6));
    s.backs.forEach((el, i) => {
      const side = i === 0 ? -1 : 1;
      el.style.transform = `translate3d(${r2(side * lerp(-30, 0, fan))}px, ${r2(lerp(40, 0, fan))}px, 0) rotateZ(${r2(side * lerp(0, 4, fan))}deg)`;
    });
    // HOW IT WAS MADE: the note reveals mid-section; the tags tick on after it.
    const note = out(span(p, 0.28, 0.45));
    if (s.note) {
      s.note.style.opacity = String(r2(note));
      s.note.style.transform = `translateY(${r2((1 - note) * 6)}px)`;
    }
    s.tags.forEach((el, i) => {
      const k = out(span(p, 0.4 + i * 0.04, 0.47 + i * 0.04));
      el.style.opacity = String(r2(k));
      el.style.transform = `scale(${r2(0.9 + 0.1 * k)})`;
    });
  };

  useMotionValueEvent(progress, 'change', apply);

  useEffect(() => {
    const el = root.current;
    if (!gate.motion || !el) return;
    const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel);
    const qa = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)];
    const card = q('[data-part="work-card"]');
    const s = {
      card,
      body: card?.querySelector<HTMLElement>('[data-part="slab-body"]') ?? null,
      sheenA: card?.querySelector<HTMLElement>('[data-part="slab-sheen-a"]') ?? null,
      sheenB: card?.querySelector<HTMLElement>('[data-part="slab-sheen-b"]') ?? null,
      backs: qa('[data-part="work-piece"]'),
      note: q('[data-part="craft-note"]'),
      tags: qa('[data-part="craft-tag"]'),
      mobile: window.innerWidth < 768,
    };
    const touched = [s.body, s.sheenA, s.sheenB, s.note, ...s.backs, ...s.tags].filter(Boolean) as HTMLElement[];
    const saved: Saved[] = touched.map((n) => ({
      el: n,
      transform: n.style.transform,
      opacity: n.style.opacity,
    }));
    parts.current = s;
    apply(progress.get());

    // On entry, once: the card rises (12 px on phones, 24 on desktop) and the pieces follow, 60 ms apart.
    const risers = [card, ...qa('[data-part="work-piece-wrap"]')].filter(Boolean) as HTMLElement[];
    const below = el.getBoundingClientRect().top > window.innerHeight * 0.85;
    let io: IntersectionObserver | null = null;
    if (below) {
      risers.forEach((n) => (n.style.opacity = '0'));
      io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io?.disconnect();
          const travel = s.mobile ? 12 : 24;
          risers.forEach((n, i) => {
            n.style.opacity = '';
            n.animate(
              [
                {
                  opacity: 0,
                  transform: `translateY(${travel * (i ? 2 : 1)}px)`,
                },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              {
                duration: 900,
                delay: i * 60,
                easing: ENTER,
                fill: 'backwards',
              },
            );
          });
        },
        { threshold: 0.18 },
      );
      io.observe(card ?? el);
    }

    const onResize = () => {
      if (parts.current) parts.current.mobile = window.innerWidth < 768;
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      io?.disconnect();
      parts.current = null;
      risers.forEach((n) => {
        n.style.opacity = '';
        n.getAnimations().forEach((a) => a.cancel());
      });
      for (const { el: n, transform, opacity } of saved) {
        n.style.transform = transform;
        n.style.opacity = opacity;
      }
    };
    // `apply` reads refs only.
  }, [gate.motion, progress]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
