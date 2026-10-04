import { ArrowUpRight, Archive, BellRing, ChevronDown, CloudUpload, Download, Monitor, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { DOWNLOAD_PATH } from '@/components/landing/links';
import { BOOKING } from '../../data/strings/ch3';
import { ATTENDEES } from '../../data/strings/ch4';
import { CLIENT_PAGE } from '../../data/strings/ch6';
import { CH9_COPY, MINI, PRACTICAL_TILES, STORY_TILES, type PracticalTileKey, type StoryTileKey } from '../../data/strings/page-ch9';
import { Ch9Tiles } from '../islands/ch9';

/**
 * Ch9 — Everything Around the Shoot · #features (aliases #pillars, #showcase).
 *
 * The scannable recap for people who skipped the story: eight story tiles,
 * each H3 linking back to its chapter with a small picture that replays the
 * chapter's beat once (CSS, transform and opacity only, armed by the island),
 * and five practical tiles. Solid ground: the sky ends at Ch8's horizon.
 *
 * Static and reduced motion: every picture sits on its final frame, because
 * the animation rules only apply under `[data-armed]`, which the island sets
 * when the motion gate passes. On phones the story tiles are compact rows
 * with the full sentence under a native <details>; desktop shows everything.
 */

const H3 = 'text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2] tracking-[-0.01em] text-[#F2EDE8]';
const FOCUS = 'rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** Where each story tile sits in the bento: 2 columns from md, 4 from lg. */
const SPAN: Record<StoryTileKey, string> = {
  nearby: 'md:col-span-2',
  job: '',
  hire: '',
  calendar: '',
  album: 'lg:col-span-2',
  client: '',
  forget: 'lg:col-span-2',
  chat: 'md:col-span-2',
};

const ICON: Record<PracticalTileKey, LucideIcon> = {
  desktop: Monitor,
  uploads: CloudUpload,
  account: ShieldCheck,
  notifications: BellRing,
  archive: Archive,
};

// ─── The tiles' little scenes ────────────────────────────────────────────

const CSS = `
.c9-mini svg * { transform-box: fill-box; transform-origin: center; }
.c9-mini [data-anim='bar'] { transform-origin: 0 50%; }
.c9[data-armed] [data-anim] {
  animation-duration: 900ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
  animation-fill-mode: both;
  animation-play-state: paused;
}
.c9[data-armed] [data-play] [data-anim], .c9[data-armed] [data-play][data-anim] { animation-play-state: running; }
.c9[data-armed] [data-anim='ring'] { animation-name: c9-ring; animation-duration: 1100ms; }
.c9[data-armed] [data-anim='pop'] { animation-name: c9-pop; animation-duration: 600ms; }
.c9[data-armed] [data-anim='in'] { animation-name: c9-in; animation-duration: 500ms; }
.c9[data-armed] [data-anim='out'] { animation-name: c9-out; animation-duration: 400ms; }
.c9[data-armed] [data-anim='bar'] { animation-name: c9-bar; }
.c9[data-armed] [data-anim='lift'] { animation-name: c9-lift; }
.c9[data-armed] [data-anim='drop'] { animation-name: c9-drop; animation-duration: 500ms; }
.c9[data-armed] [data-anim='sort'] { animation-name: c9-sort; animation-duration: 1000ms; }
.c9[data-armed] [data-anim='heart'] { animation-name: c9-heart; animation-duration: 700ms; }
.c9[data-armed] [data-anim='fade'] { animation-name: c9-fade; animation-duration: 700ms; }
@media (min-width: 768px) {
  .c9[data-armed] [data-anim='rise'] { animation-name: c9-rise; animation-duration: 800ms; }
}
html[data-paused] .c9 [data-anim] { animation: none !important; }
@keyframes c9-ring { from { transform: scale(0.24); opacity: 0.35; } }
@keyframes c9-pop { from { transform: scale(0.2); opacity: 0; } }
@keyframes c9-in { from { opacity: 0; } }
@keyframes c9-out { from { opacity: 1; } }
@keyframes c9-bar { from { transform: scaleX(0); } }
@keyframes c9-lift { from { transform: translateY(5px); opacity: 0.25; } }
@keyframes c9-drop { from { opacity: 1; } }
@keyframes c9-sort { from { transform: translate(var(--dx), var(--dy)); } }
@keyframes c9-heart { from { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.14); opacity: 1; } }
@keyframes c9-fade { from { opacity: 0.85; } }
@keyframes c9-rise { from { transform: translateY(18px) rotateX(9deg); } }
`;

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** A label the picture prints, from md up (the 56 px phone picture is shapes only). */
function Badge({
  children,
  className = '',
  anim,
  wait = 0,
  tone = 'muted',
}: {
  children: ReactNode;
  className?: string;
  anim?: 'in' | 'out';
  wait?: number;
  tone?: 'muted' | 'accent' | 'ink';
}) {
  const look =
    tone === 'accent' ? 'bg-[#D18A5A] text-[#161311]' : tone === 'ink' ? 'bg-[#26221F] text-[#F2EDE8]' : 'bg-[#26221F] text-[#BCADA3]';
  return (
    <span
      data-anim={anim}
      style={delay(wait)}
      className={`absolute hidden h-6 items-center whitespace-nowrap rounded-full px-2.5 font-sans text-[12px] font-medium md:inline-flex ${look} ${className}`}
    >
      {children}
    </span>
  );
}

const SVG = {
  viewBox: '0 0 160 96',
  preserveAspectRatio: 'xMidYMid meet',
  className: 'absolute inset-0 size-full',
} as const;

const TILE_FILLS = ['#c17745', '#5b7b9a', '#b66a40', '#6b8e4e', '#8b5e3c', '#c17745', '#5b7b9a', '#b66a40'];
const GRID = Array.from({ length: 8 }, (_, i) => ({
  x: 15 + (i % 4) * 34,
  y: 14 + Math.floor(i / 4) * 36,
}));
/** Where each album tile flies in from: shuffled, as the uploads arrive out of order. */
const SHUFFLE = [5, 2, 7, 0, 3, 6, 1, 4];

function Mini({ kind }: { kind: StoryTileKey }) {
  switch (kind) {
    case 'nearby':
      return (
        <>
          <svg {...SVG}>
            <ellipse cx="80" cy="54" rx="14" ry="6" fill="none" stroke="#A08E84" strokeOpacity="0.6" strokeWidth="1" />
            <ellipse data-anim="ring" cx="80" cy="54" rx="64" ry="27" fill="rgba(209,138,90,0.06)" stroke="#D18A5A" strokeWidth="1.4" />
            {[
              [38, 50, 260],
              [120, 62, 420],
              [104, 40, 340],
              [58, 68, 500],
              [134, 50, 580],
            ].map(([x, y, w]) => (
              <circle key={`${x}-${y}`} data-anim="pop" style={delay(w)} cx={x} cy={y} r="2.4" fill="#F2EDE8" />
            ))}
            <circle cx="80" cy="54" r="8" fill="#D18A5A" opacity="0.25" />
            <circle cx="80" cy="54" r="3.4" fill="#F7E7CF" />
          </svg>
          <Badge anim="out" className="bottom-3 right-3 opacity-0">
            {MINI.nearbyFrom}
          </Badge>
          <Badge anim="in" wait={350} className="bottom-3 right-3" tone="ink">
            {MINI.nearbyTo}
          </Badge>
        </>
      );
    case 'job':
      return (
        <svg {...SVG}>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx="24" cy={24 + i * 24} r="6.5" fill="rgba(209,138,90,0.15)" />
              <rect x="38" y={21 + i * 24} width={[46, 52, 30][i]} height="6" rx="3" fill="#362F2B" />
              <rect
                data-anim="bar"
                style={delay(120 + i * 140)}
                x="98"
                y={19 + i * 24}
                width={[44, 32, 38][i]}
                height="10"
                rx="5"
                fill="#D18A5A"
              />
            </g>
          ))}
        </svg>
      );
    case 'hire':
      return (
        <>
          <svg {...SVG}>
            <rect x="22" y="12" width="116" height="72" rx="10" fill="#1E1B18" stroke="#362F2B" />
            <rect x="32" y="24" width="40" height="7" rx="3.5" fill="#F2EDE8" opacity="0.85" />
            <rect x="94" y="22" width="34" height="12" rx="6" fill="#2A2522" />
            <rect data-anim="in" style={delay(380)} x="94" y="22" width="34" height="12" rx="6" fill="#D18A5A" />
            <path
              data-anim="pop"
              style={delay(520)}
              d="M105 28 l3.5 3.5 l7 -7"
              fill="none"
              stroke="#161311"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[44, 56, 68].map((y, i) => (
              <rect key={y} x="32" y={y} width={[88, 70, 80][i]} height="5" rx="2.5" fill="#362F2B" />
            ))}
          </svg>
          <Badge anim="out" className="bottom-3 left-3 opacity-0">
            {BOOKING.label.waiting}
          </Badge>
          <Badge anim="in" wait={380} className="bottom-3 left-3" tone="accent">
            {BOOKING.label.agreed}
          </Badge>
        </>
      );
    case 'calendar':
      return (
        <>
          <svg {...SVG}>
            {Array.from({ length: 21 }, (_, i) => {
              const x = 18 + (i % 7) * 18;
              const y = 12 + Math.floor(i / 7) * 16;
              const sat = i === 13;
              return sat ? (
                <rect key={i} data-anim="lift" style={delay(120)} x={x} y={y} width="14" height="12" rx="3" fill="#D18A5A" />
              ) : (
                <rect key={i} x={x} y={y} width="14" height="12" rx="3" fill="#2A2522" />
              );
            })}
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                data-anim="drop"
                style={delay(420 + (3 - i) * 110)}
                x={122 + i * 6}
                y={84 - (4 + i * 3)}
                width="4"
                height={4 + i * 3}
                rx="1"
                fill="#F2EDE8"
                opacity="0.18"
              />
            ))}
          </svg>
          <Badge anim="out" className="bottom-3 left-3 opacity-0">
            {ATTENDEES.status.pending}
          </Badge>
          <Badge anim="in" wait={300} className="bottom-3 left-3" tone="accent">
            {ATTENDEES.status.accepted}
          </Badge>
        </>
      );
    case 'album':
      return (
        <svg {...SVG}>
          {GRID.map((g, i) => {
            const from = GRID[SHUFFLE[i]];
            return (
              <rect
                key={i}
                data-anim="sort"
                style={
                  {
                    ...delay(i * 50),
                    '--dx': `${from.x - g.x}px`,
                    '--dy': `${from.y - g.y}px`,
                  } as CSSProperties
                }
                x={g.x}
                y={g.y}
                width="28"
                height="30"
                rx="5"
                fill={TILE_FILLS[i]}
                opacity="0.82"
              />
            );
          })}
        </svg>
      );
    case 'client':
      return (
        <>
          <svg {...SVG}>
            <path
              d="M80 74 C60 60 50 50 50 38 C50 29 57 22 66 22 C72 22 77 26 80 31 C83 26 88 22 94 22 C103 22 110 29 110 38 C110 50 100 60 80 74 Z"
              fill="none"
              stroke="#A08E84"
              strokeWidth="1.4"
            />
            <path
              data-anim="heart"
              style={delay(120)}
              d="M80 74 C60 60 50 50 50 38 C50 29 57 22 66 22 C72 22 77 26 80 31 C83 26 88 22 94 22 C103 22 110 29 110 38 C110 50 100 60 80 74 Z"
              fill="#D18A5A"
            />
          </svg>
          <Badge anim="in" wait={520} className="bottom-3 right-3" tone="ink">
            {`1 ${CLIENT_PAGE.picked}`}
          </Badge>
        </>
      );
    case 'forget':
      return (
        <svg {...SVG}>
          {GRID.map((g, i) => (
            <g key={i}>
              <rect
                x={g.x + 0.5}
                y={g.y + 0.5}
                width="27"
                height="29"
                rx="5"
                fill="none"
                stroke="#A08E84"
                strokeOpacity="0.55"
                strokeDasharray="3 3"
              />
              <rect
                data-anim="fade"
                style={delay(120 + i * 70)}
                x={g.x}
                y={g.y}
                width="28"
                height="30"
                rx="5"
                fill={TILE_FILLS[i]}
                opacity="0"
              />
            </g>
          ))}
        </svg>
      );
    case 'chat':
      return (
        <svg {...SVG}>
          <rect x="16" y="12" width="86" height="24" rx="12" fill="#2A2522" />
          <rect x="26" y="21" width="56" height="6" rx="3" fill="#A08E84" opacity="0.7" />
          <rect x="58" y="44" width="86" height="24" rx="12" fill="#D18A5A" />
          <rect x="68" y="53" width="60" height="6" rx="3" fill="#161311" opacity="0.45" />
          {[0, 6].map((dx) => (
            <path
              key={dx}
              d={`M${121 + dx} 79 l3 3 l6 -6`}
              fill="none"
              stroke="#5c514b"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {[0, 6].map((dx, i) => (
            <path
              key={`on-${dx}`}
              data-anim="in"
              style={delay(300 + i * 160)}
              d={`M${121 + dx} 79 l3 3 l6 -6`}
              fill="none"
              stroke="#D18A5A"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      );
  }
}

// ─── The chapter ─────────────────────────────────────────────────────────

function More({ children }: { children: ReactNode }) {
  return (
    <details className="group/more mt-1 md:hidden">
      <summary
        className={`inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A] [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        {CH9_COPY.more}
        <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-open/more:rotate-180" />
      </summary>
      <p className="pb-1 text-base leading-relaxed text-[#BCADA3]">{children}</p>
    </details>
  );
}

export function Ch9() {
  return (
    <section
      id="features"
      data-tone="night"
      data-chapter="features"
      aria-labelledby="features-title"
      className="relative z-10 bg-[#161311] [contain-intrinsic-size:auto_2400px] [content-visibility:auto]"
    >
      <span id="pillars" aria-hidden />
      <span id="showcase" aria-hidden />
      <style href="story-ch9" precedence="default">
        {CSS}
      </style>
      {/* Where Ch8's horizon lands: a warm hairline, then ground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(209,138,90,0)_0%,rgba(209,138,90,0.45)_50%,rgba(209,138,90,0)_100%)]"
      />

      <div className="mx-auto max-w-6xl px-5 pb-24 pt-20 sm:px-8 md:pb-32 md:pt-28">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#D18A5A]">{CH9_COPY.eyebrow}</p>
        <h2
          id="features-title"
          className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8] [text-wrap:balance]"
        >
          {CH9_COPY.title}
        </h2>
        <p className="mt-6 max-w-[34ch] text-[1.0625rem] leading-[1.55] text-[#BCADA3] md:max-w-[52ch] md:text-[1.25rem]">
          {CH9_COPY.lead}
        </p>

        <Ch9Tiles className="c9 mt-14 md:mt-20">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-[#A08E84]">{CH9_COPY.storyHeading}</p>
          <ul className="grid gap-3 [perspective:1200px] md:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {STORY_TILES.map((tile) => (
              <li
                key={tile.key}
                data-tile
                data-anim="rise"
                className={`relative rounded-[22px] border border-[#2A2522] bg-[#1E1B18] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_24px_48px_-32px_rgba(0,0,0,0.9)] [transform-origin:50%_100%] ${SPAN[tile.key]}`}
              >
                <div className="flex items-start gap-4 p-4 md:block md:p-5">
                  <div
                    aria-hidden
                    className="c9-mini relative size-14 shrink-0 overflow-hidden rounded-2xl border border-[#2A2522] bg-[#161311] bg-[radial-gradient(rgba(242,237,232,0.06)_1px,transparent_1px)] [background-size:12px_12px] md:h-36 md:w-full"
                  >
                    <Mini kind={tile.key} />
                  </div>
                  <div className="min-w-0 flex-1 md:mt-5">
                    <h3 className={H3}>
                      {tile.href ? (
                        <a
                          href={tile.href}
                          className={`group/link -my-1 inline-flex min-h-11 items-center gap-1.5 py-1 hover:text-[#D18A5A] ${FOCUS}`}
                        >
                          <span>{tile.title}</span>
                          <ArrowUpRight
                            aria-hidden
                            className="size-[0.85em] shrink-0 text-[#D18A5A] transition-transform duration-200 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
                          />
                        </a>
                      ) : (
                        <span className="inline-flex min-h-11 items-center py-1">{tile.title}</span>
                      )}
                    </h3>
                    <p className="mt-1 text-base leading-relaxed text-[#BCADA3] md:hidden">{tile.short}</p>
                    <More>{tile.line}</More>
                    <p className="mt-2 hidden text-[17px] leading-relaxed text-[#BCADA3] md:block">{tile.line}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p className="mb-4 mt-14 font-mono text-xs uppercase tracking-[0.14em] text-[#A08E84] md:mt-16">{CH9_COPY.practicalHeading}</p>
          <ul className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
            {PRACTICAL_TILES.map((tile) => {
              const Icon = ICON[tile.key];
              const download = tile.key === 'desktop';
              return (
                <li
                  key={tile.key}
                  className={`flex flex-col rounded-[18px] border border-[#2A2522] bg-[#1E1B18] p-4 md:p-5 ${download ? 'col-span-2 lg:col-span-1' : ''}`}
                >
                  <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-[#D18A5A]/12 text-[#D18A5A]">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 text-[1.0625rem] font-semibold leading-snug text-[#F2EDE8] md:text-xl">{tile.title}</h3>
                  <p className="mt-1.5 text-base leading-relaxed text-[#BCADA3] md:hidden">{tile.short}</p>
                  <More>{tile.line}</More>
                  <p className="mt-2 hidden text-[15px] leading-relaxed text-[#BCADA3] md:block">{tile.line}</p>
                  {download && (
                    <a
                      href={DOWNLOAD_PATH}
                      className={`mt-4 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[#D18A5A] px-4 text-[15px] font-semibold text-[#161311] transition-colors hover:bg-[#dd9a6c] lg:mt-auto lg:translate-y-1 ${FOCUS}`}
                    >
                      <Download aria-hidden className="size-4" />
                      {CH9_COPY.download}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Ch9Tiles>

        <p className="mt-10 text-[13px] leading-relaxed text-[#A08E84]">{CH9_COPY.footnote}</p>
      </div>
    </section>
  );
}
