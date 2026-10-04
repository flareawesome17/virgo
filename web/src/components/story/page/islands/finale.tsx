'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMotionGate } from '../motion';

/**
 * The Finale's stage (storyboard §2 Finale): entry-triggered, once.
 *
 * The server render is the final state: all 14 stars, Syrma lit, its two
 * lines drawn. In motion mode this arms the scene on mount (Syrma back to an
 * empty socket, the figure faint and tipped away) and lights it when the
 * figure is well in view; the chapter's CSS runs the ignition with transform
 * and opacity only. The two pulses are CSS animations that Pause holds.
 */
export function FinaleStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { motion } = useMotionGate();

  useEffect(() => {
    const root = ref.current;
    const sky = root?.querySelector<HTMLElement>('.f-sky');
    if (!motion || !root || !sky) return;
    root.dataset.state = 'armed';
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        void root.offsetWidth; // commit the armed pose first, so an anchor jump still sees the ignition
        root.dataset.state = 'lit';
        io.disconnect();
      },
      { threshold: 0.55 },
    );
    io.observe(sky);
    return () => {
      io.disconnect();
      delete root.dataset.state;
    };
  }, [motion]);

  return (
    <div ref={ref} data-stage="finale" className="finale-stage">
      {children}
    </div>
  );
}

/**
 * "What do you do?" (storyboard §2 Finale, optional): nine toggle buttons.
 * Each chosen role adds a ray to the new star and the live label reads
 * "you · Photographer, HMUA". Nothing is sent and no link changes; it works
 * the same with reduced motion (the rays just appear).
 */
export function RolePicker({
  roles,
  legend,
  hint,
  you,
}: {
  roles: readonly string[];
  legend: string;
  hint: string;
  you: string;
}) {
  const [picked, setPicked] = useState<readonly string[]>([]);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('#start [data-ray]').forEach((ray) => {
      const on = picked.includes(roles[Number(ray.dataset.ray)] ?? '');
      if (on) ray.setAttribute('data-on', '');
      else ray.removeAttribute('data-on');
    });
  }, [picked, roles]);

  // In the app's order, whatever order they were pressed in.
  const toggle = (role: string) =>
    setPicked((prev) => roles.filter((r) => (r === role ? !prev.includes(r) : prev.includes(r))));

  return (
    <fieldset className="rounded-[1.5rem] border border-white/[0.08] bg-[#1A1614]/80 p-5 sm:p-6">
      <legend className="float-left w-full text-lg font-medium text-[#F2EDE8]">{legend}</legend>
      <p className="clear-left pt-1 text-sm text-[#A08E84]">{hint}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {roles.map((role) => {
          const on = picked.includes(role);
          return (
            <button
              key={role}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(role)}
              className={`min-h-11 rounded-xl border px-1.5 py-1.5 text-[12px] leading-tight [overflow-wrap:anywhere] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8] sm:text-sm ${
                on
                  ? 'border-[#D18A5A] bg-[#D18A5A] text-[#161311]'
                  : 'border-white/[0.12] bg-transparent text-[#E4DCD5] hover:border-[#D18A5A]/60 hover:text-[#F2EDE8]'
              }`}
            >
              {role}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-4 min-h-5 font-mono text-xs tracking-[0.08em] text-[#D18A5A]">
        {picked.length ? `${you} · ${picked.join(', ')}` : you}
      </p>
    </fieldset>
  );
}
