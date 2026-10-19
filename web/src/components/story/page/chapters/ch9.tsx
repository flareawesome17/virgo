import {
  CalendarCheck,
  ClipboardList,
  Handshake,
  Hourglass,
  Images,
  Link2,
  MessagesSquare,
  Monitor,
  Radar,
  type LucideIcon,
} from 'lucide-react';
import { CH9_COPY, TILES, type TileKey } from '../../data/strings/page-ch9';
import { Ch9Film } from '../islands/ch9';
import { Reveal } from '../scenes/ch9-reveal';

/**
 * Ch9 — Everything around the shoot · #features (aliases #pillars,
 * #showcase). 05-cinema.md §3: after the film, the information. Nine tiles,
 * an H3 and eight words each, every one a thing the app does today, each with
 * its tool lit like the gear.
 *
 * One render serves both modes: this server grid is the static page. In
 * motion, `Ch9Film` zooms in as the iris cut opens on #features, drifts and
 * runs one light sweep; each tile eases in and out (`Reveal`, staggered by
 * column). Transform and opacity only.
 */

const ICON: Record<TileKey, LucideIcon> = {
  nearby: Radar,
  job: ClipboardList,
  hire: Handshake,
  calendar: CalendarCheck,
  album: Images,
  client: Link2,
  forget: Hourglass,
  chat: MessagesSquare,
  desktop: Monitor,
};

export function Ch9() {
  return (
    <section
      id="features"
      data-tone="night"
      data-chapter="features"
      aria-labelledby="features-title"
      className="relative z-10 bg-[#161311] [overflow-x:clip]"
    >
      <span id="pillars" aria-hidden />
      <span id="showcase" aria-hidden />
      {/* Where Ch8's horizon lands: a warm hairline, then ground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(209,138,90,0)_0%,rgba(209,138,90,0.45)_50%,rgba(209,138,90,0)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60svh] bg-[radial-gradient(70%_60%_at_50%_0%,rgba(209,138,90,0.10),rgba(22,19,17,0)_70%)]"
      />

      <Ch9Film className="mx-auto max-w-6xl px-5 pt-20 pb-24 sm:px-8 md:pt-28 md:pb-32">
        <h2
          id="features-title"
          className="max-w-[16ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] leading-none font-semibold tracking-[-0.03em] text-[#F2EDE8] [text-wrap:balance]"
        >
          {CH9_COPY.title}
        </h2>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 md:mt-16 md:gap-4 lg:grid-cols-3">
          {TILES.map((tile, i) => {
            const Icon = ICON[tile.key];
            return (
              <li key={tile.key}>
                <Reveal
                  delay={(i % 3) * 0.04}
                  className="flex h-full items-start gap-4 rounded-[20px] border border-[#2A2522] bg-[linear-gradient(165deg,#211C19,#1A1614)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-32px_rgba(0,0,0,0.9)] sm:block sm:p-6"
                >
                  {/* The tool, lit like the gear: dark body, a warm rim. */}
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[radial-gradient(120%_120%_at_30%_20%,#3A2F28,#1A1513_70%)] text-[#F0C88E] shadow-[inset_0_1px_0_rgba(240,200,142,0.35),inset_0_0_0_1px_rgba(209,138,90,0.28),0_12px_24px_-12px_rgba(209,138,90,0.45)] sm:size-14"
                  >
                    <Icon className="size-[22px] sm:size-6" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 sm:mt-6">
                    <h3 className="text-[17px] leading-snug font-semibold text-[#F2EDE8] sm:text-xl">
                      {tile.title}
                    </h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-[#BCADA3] sm:mt-2 sm:text-base">
                      {tile.line}
                    </p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Ch9Film>
    </section>
  );
}
