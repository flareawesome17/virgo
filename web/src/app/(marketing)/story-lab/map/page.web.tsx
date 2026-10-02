/* eslint-disable @next/next/no-img-element -- the map levels are plain <img>s by design (storyboard §1.3): static SVGs placed by their bbox and moved by the camera's transform; next/image adds nothing for an SVG. */
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CITIES, HOME, city, offsetKm, type CityName } from '@/components/story/data/cities.generated';
import {
  KM_PER_UNIT,
  LAND_SAFE_INSET_KM,
  LAND_TOLERANCE_KM,
  MAP_ATTRIBUTION,
  MAP_LEVELS,
  MAP_SOURCE,
  landRings,
  pointInLand,
  type MapLevel,
  type MapLevelId,
} from '@/components/story/data/ph-map.generated';
import { VIEWBOX } from '@/components/story/data/projection';
import { CAST, ROSTER } from '@/components/story/data/story';
import { gzipBytes, inRings, readLabFile, svgRings } from './_lib/assets';

/**
 * The map's four detail levels, the land test and the grain tile: every level
 * as the <img> the page will use, placed by its bbox, with the 71 Nearby
 * cities and the roster on top, and the overview laid back as the 3D plane.
 */
export const metadata: Metadata = {
  title: 'Story lab · Map',
  robots: { index: false, follow: false },
};

type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

const INK = '#F2EDE8';
const SECONDARY = '#BCADA3';
const ACCENT = '#D18A5A';
const SEA = '#FF7B6B';

/** Budgets from the task, gzip -9, KB. */
const BUDGET_KB: Record<MapLevelId, number> = { archipelago: 12, visayas: 12, cebu: 10, radar: 10 };

/** Ch8's constellation cities (storyboard): 12 on mobile, 18 on desktop. */
const CLUSTER_CITIES: readonly CityName[] = [
  'Vigan',
  'Baguio',
  'Quezon City',
  'Naga',
  'Legazpi',
  'Iloilo City',
  'Bacolod',
  'Dumaguete',
  'Tagbilaran',
  'Tacloban',
  'Cagayan de Oro',
  'Davao City',
  'Puerto Princesa',
  'Zamboanga City',
  'General Santos',
  'Batangas City',
  'Laoag',
  'Butuan',
];

const LAB_CSS = `
.lab-stage { perspective: 900px; perspective-origin: 50% 42%; }
@media (min-width: 768px) { .lab-stage { perspective: 1200px; } }
.lab-plane { transform-style: preserve-3d; transform: rotateX(50deg) rotateZ(-7deg); animation: lab-orbit 18s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes lab-orbit { 0%,100% { transform: rotateX(50deg) rotateZ(-7deg) } 50% { transform: rotateX(50deg) rotateZ(7deg) } }
.lab-star { animation: lab-twinkle 4.8s cubic-bezier(.65,0,.35,1) infinite; animation-delay: var(--delay); }
@keyframes lab-twinkle { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
@media (prefers-reduced-motion: reduce) { .lab-plane, .lab-star { animation: none !important } }
`;

const asset = (name: string) => `/story-lab/map/asset/${name}`;
const pct = (value: number, span: number) => `${((value / span) * 100).toFixed(4)}%`;
const kmBox = (x: number, y: number, halfKm: number): Box => {
  const half = halfKm / KM_PER_UNIT;
  return { x: x - half, y: y - half, width: 2 * half, height: 2 * half };
};
const inside = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
const levelOf = (id: MapLevelId): MapLevel => MAP_LEVELS.find((l) => l.id === id) as MapLevel;
/** Within 12 km of Cebu City, where labels would sit on top of each other (Mandaue, Lapu-Lapu, Talisay). */
const nearHome = (p: { x: number; y: number }) => Math.hypot(p.x - HOME.x, p.y - HOME.y) * KM_PER_UNIT < 12;

/** Greedy label thinning: a place keeps its label unless one already kept is within `km`. `first` go first. */
function thinLabels(points: readonly { name: string; x: number; y: number }[], km: number, first: readonly string[] = []) {
  const rank = (name: string) => (first.includes(name) ? first.indexOf(name) : first.length);
  const order = [...points].sort((a, b) => rank(a.name) - rank(b.name));
  const kept: { x: number; y: number }[] = [];
  const names = new Set<string>();
  for (const p of order) {
    if (kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) * KM_PER_UNIT < km)) continue;
    kept.push(p);
    names.add(p.name);
  }
  return names;
}
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function Section({ n, title, note, children }: { n: string; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-20 first:mt-14">
      <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]">{n}</p>
      <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-[#BCADA3]">{note}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <figcaption className="figure mt-3 text-[11px] leading-relaxed text-[#A08E84]">{children}</figcaption>;
}

/**
 * A window onto the map plane: each level's <img> sits at its bbox, scaled to
 * the window, exactly as the camera will place it.
 */
function Frame({
  view,
  layers,
  children,
  className = '',
  style,
}: {
  view: Box;
  layers: { level: MapLevel; opacity?: number; blend?: CSSProperties['mixBlendMode'] }[];
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[10px] bg-[#161311] ring-1 ring-white/10 ${className}`}
      style={{ aspectRatio: `${view.width} / ${view.height}`, isolation: 'isolate', ...style }}
    >
      {layers.map(({ level, opacity = 1, blend }) => (
        <img
          key={level.id}
          src={asset(level.file)}
          alt={`The ${level.id} level`}
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            left: pct(level.bbox.x - view.x, view.width),
            top: pct(level.bbox.y - view.y, view.height),
            width: pct(level.bbox.width, view.width),
            height: pct(level.bbox.height, view.height),
            opacity,
            mixBlendMode: blend,
          }}
        />
      ))}
      {children}
    </div>
  );
}

/** Vector overlay in map units, matched to the frame's window. */
function Overlay({ view, children }: { view: Box; children: ReactNode }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="none"
    >
      {children}
    </svg>
  );
}

function Dot({
  view,
  x,
  y,
  size,
  color,
  label,
  halo = false,
}: {
  view: Box;
  x: number;
  y: number;
  size: number;
  color: string;
  label?: string;
  halo?: boolean;
}) {
  const left = pct(x - view.x, view.width);
  const top = pct(y - view.y, view.height);
  // Labels in the right third read leftward, so the frame's edge doesn't cut them.
  const flip = (x - view.x) / view.width > 0.68;
  return (
    <>
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          left,
          top,
          width: size,
          height: size,
          transform: 'translate(-50%, -50%)',
          background: color,
          boxShadow: halo ? `0 0 0 3px rgba(242,237,232,.18), 0 0 14px 4px rgba(209,138,90,.45)` : undefined,
        }}
      />
      {label ? (
        <span
          className="figure absolute whitespace-nowrap text-[11px] leading-none"
          style={{
            left,
            top,
            color,
            transform: flip ? `translate(calc(-100% - ${size / 2 + 5}px), -50%)` : `translate(${size / 2 + 5}px, -50%)`,
            textShadow: '0 0 4px #161311, 0 0 2px #161311',
          }}
        >
          {label}
        </span>
      ) : null}
    </>
  );
}

/** Nearby's rings around Mika, as circles on the plane (the projection is conformal, so a circle stays a circle). */
function Rings({ radii }: { radii: readonly number[] }) {
  return (
    <>
      {radii.map((r) => (
        <circle
          key={r}
          cx={HOME.x}
          cy={HOME.y}
          r={r / KM_PER_UNIT}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={0.75}
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </>
  );
}

export default function MapLab() {
  if (process.env.NODE_ENV === 'production') notFound();

  // The files as they are on disk now: sizes, and the rings for the land checks below.
  const levels = MAP_LEVELS.map((level) => {
    const file = readLabFile(level.file);
    return {
      level: level as MapLevel,
      raw: file?.length ?? null,
      gzip: file ? gzipBytes(file) : null,
      rings: file ? svgRings(file.toString('utf8')) : [],
    };
  });
  const grain = readLabFile('grain.png');
  const finest = (x: number, y: number) => [...levels].reverse().find((l) => inside(l.level.bbox, x, y)) ?? levels[0];

  const castNames = new Set<string>(Object.values(CAST).map((c) => c.first));
  const people = [
    { name: 'Mika', km: 0, bearing: 0, cast: true },
    ...ROSTER.map((n) => ({ name: n.name, km: n.km, bearing: n.bearing, cast: castNames.has(n.name) })),
  ].map((p) => {
    const at = offsetKm(HOME.x, HOME.y, p.km, p.bearing);
    const level = finest(at.x, at.y);
    return { ...p, ...at, level: level.level.id, land: inRings(level.rings, at.x, at.y) };
  });
  const atSea = people.filter((p) => !p.land);

  const archipelago = levelOf('archipelago');
  const visayas = levelOf('visayas');
  const cebu = levelOf('cebu');
  const radar = levelOf('radar');
  const frame: Box = { x: 0, y: 0, width: VIEWBOX.width, height: VIEWBOX.height };
  const nearView = kmBox(HOME.x, HOME.y, 6.5);
  const visayasCities = CITIES.filter((c) => inside(visayas.bbox, c.x, c.y));
  const visayasLabels = thinLabels(visayasCities, 20, [HOME.name, 'Tagbilaran']);
  const cebuCities = CITIES.filter((c) => inside(cebu.bbox, c.x, c.y));
  const cebuLabels = thinLabels(cebuCities.filter((c) => !nearHome(c)), 15, ['Tagbilaran']);
  const landPath = landRings()
    .map((ring) => {
      const p = ring.points;
      let d = `M${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
      for (let i = 2; i < p.length; i += 2) d += `L${p[i].toFixed(2)} ${p[i + 1].toFixed(2)}`;
      return `${d}Z`;
    })
    .join('');
  const citiesOnLand = CITIES.filter((c) => pointInLand(c.x, c.y)).length;
  const holding = (x: number, y: number) => levels.filter((l) => inside(l.level.bbox, x, y));
  const citiesEverywhere = CITIES.filter((c) => holding(c.x, c.y).every((l) => inRings(l.rings, c.x, c.y))).length;
  const named = (['Lapu-Lapu', 'Tagbilaran'] as const).map((name) => {
    const c = city(name);
    return { name, checks: holding(c.x, c.y).map((l) => `${l.level.id} ${inRings(l.rings, c.x, c.y) ? 'land' : 'SEA'}`) };
  });
  const missing = levels.filter((l) => l.raw === null).map((l) => l.level.file);

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#161311] px-4 pb-32 pt-12 text-[#F2EDE8] sm:px-8">
      <style>{LAB_CSS}</style>
      <div className="mx-auto max-w-[1240px]">
        <a href="/story-lab" className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84] hover:text-[#F2EDE8]">
          ← Story lab
        </a>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em]">Map levels and grain</h1>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[#BCADA3]">
          The coastline the sky sits on: four static SVG levels in one frame, each placed by its bbox, so they overlay
          exactly. Built by <span className="figure text-[13px]">marketing-assets/scripts/build-ph-map.mjs</span> from{' '}
          {MAP_SOURCE.name}, read here from the files on disk. Check at 375 and 1440.
        </p>
        <p className="figure mt-4 max-w-[90ch] text-[11px] leading-relaxed text-[#A08E84]">{MAP_ATTRIBUTION}</p>
        {missing.length ? (
          <p className="mt-4 text-[14px] text-[#FF7B6B]">
            Missing on disk: {missing.join(', ')}. Run: cd marketing-assets && node scripts/build-ph-map.mjs
          </p>
        ) : null}

        <Section
          n="01 · §1.3"
          title="Four levels, one frame"
          note={`A level is shown while its simplification stays under about 2 px (px/km × tolerance) and the frame fits its box. Map units are ${KM_PER_UNIT} km.`}
        >
          <div className="overflow-x-auto rounded-[10px] ring-1 ring-white/10">
            <table className="figure w-full min-w-[760px] text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-[0.1em] text-[#A08E84]">
                <tr className="border-b border-white/10">
                  {['level', 'bbox (map units)', 'size', 'tolerance', 'zoom', 'px/km', 'raw', 'gzip -9', 'budget'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {levels.map(({ level, raw, gzip }) => (
                  <tr key={level.id} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2.5 text-[#F2EDE8]">{level.id}</td>
                    <td className="px-3 py-2.5 text-[#BCADA3]">
                      {level.bbox.x} {level.bbox.y} {level.bbox.width} {level.bbox.height}
                    </td>
                    <td className="px-3 py-2.5 text-[#BCADA3]">
                      {Math.round(level.bbox.width * KM_PER_UNIT)} × {Math.round(level.bbox.height * KM_PER_UNIT)} km
                    </td>
                    <td className="px-3 py-2.5 text-[#BCADA3]">{level.toleranceKm} km</td>
                    <td className="px-3 py-2.5 text-[#BCADA3]">
                      {level.zoomRange[0]}–{level.zoomRange[1]}×
                    </td>
                    <td className="px-3 py-2.5 text-[#BCADA3]">
                      {level.pxPerKm[0]}–{level.pxPerKm[1]}
                    </td>
                    <td className="px-3 py-2.5 text-[#BCADA3]">{raw === null ? '—' : kb(raw)}</td>
                    <td className={`px-3 py-2.5 ${gzip !== null && gzip > BUDGET_KB[level.id] * 1024 ? 'text-[#FF7B6B]' : 'text-[#F2EDE8]'}`}>
                      {gzip === null ? '—' : kb(gzip)}
                    </td>
                    <td className="px-3 py-2.5 text-[#A08E84]">≤ {BUDGET_KB[level.id]} KB</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-2.5 text-[#F2EDE8]">grain</td>
                  <td className="px-3 py-2.5 text-[#BCADA3]" colSpan={5}>
                    160 × 160 tile, three greys (TPDF)
                  </td>
                  <td className="px-3 py-2.5 text-[#F2EDE8]">{grain ? kb(grain.length) : '—'}</td>
                  <td className="px-3 py-2.5 text-[#A08E84]">PNG</td>
                  <td className="px-3 py-2.5 text-[#A08E84]">≤ 6 KB</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          n="02 · archipelago"
          title="The whole frame, 71 cities and the crop boxes"
          note={`Every Nearby city on the 1 km level; the dashed boxes are the Visayas, Cebu and radar crops. The thin copper line is the land test's outline (${LAND_TOLERANCE_KM} km): ${citiesOnLand} of ${CITIES.length} cities pass pointInLand.`}
        >
          <div className="grid items-start gap-10 md:grid-cols-[minmax(0,460px)_1fr]">
            <figure>
              <Frame view={frame} layers={[{ level: archipelago, opacity: 0.32 }]}>
                <Overlay view={frame}>
                  <path d={landPath} fill="none" stroke={ACCENT} strokeOpacity={0.7} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
                  {[visayas, cebu, radar].map((l) => (
                    <rect
                      key={l.id}
                      x={l.bbox.x}
                      y={l.bbox.y}
                      width={l.bbox.width}
                      height={l.bbox.height}
                      fill="none"
                      stroke={INK}
                      strokeOpacity={0.55}
                      strokeDasharray="3 3"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </Overlay>
                {CITIES.map((c) => (
                  <Dot key={c.name} view={frame} x={c.x} y={c.y} size={4} color={c.name === HOME.name ? INK : ACCENT} />
                ))}
              </Frame>
              <Caption>
                archipelago.svg · bbox 0 0 {VIEWBOX.width} {VIEWBOX.height} · islands ≥ {archipelago.minAreaKm2} km² · Kalayaan
                cropped
              </Caption>
            </figure>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold">Land checks, on the files as they are</h3>
              <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-[#BCADA3]">
                <li>
                  {citiesEverywhere} of {CITIES.length} cities are on land at every level that holds them; {citiesOnLand} of{' '}
                  {CITIES.length} pass pointInLand.
                </li>
                {named.map((n) => (
                  <li key={n.name}>
                    {n.name}: {n.checks.join(', ')}.
                  </li>
                ))}
                <li>
                  Where simplification cut a city off its island, the build puts the source coast back around it (the pins
                  are in its log).
                </li>
                <li>
                  pointInLand with insetKm {LAND_SAFE_INSET_KM} keeps a point on land at every level: the outline is coarser
                  than what is drawn.
                </li>
              </ul>
              <h3 className="mt-8 text-[15px] font-semibold">Cities</h3>
              <p className="figure mt-3 text-[11px] leading-[1.9] text-[#A08E84]">
                {CITIES.map((c) => c.name).join(' · ')}
              </p>
            </div>
          </div>
        </Section>

        <Section
          n="03 · crops"
          title="Visayas, Cebu, radar"
          note="Each crop's <img> at its own bbox. Roster stars are placed from Mika by offsetKm (bearing and whole km from story.ts); red ones sit in the sea on the finest level that holds them."
        >
          <div className="grid gap-x-8 gap-y-14 md:grid-cols-2">
            <figure>
              <Frame view={visayas.bbox} layers={[{ level: visayas, opacity: 0.32 }]}>
                {visayasCities.map((c) => (
                  <Dot
                    key={c.name}
                    view={visayas.bbox}
                    x={c.x}
                    y={c.y}
                    size={5}
                    color={c.name === HOME.name ? INK : ACCENT}
                    label={visayasLabels.has(c.name) ? c.name : undefined}
                  />
                ))}
              </Frame>
              <Caption>
                visayas.svg · {visayas.toleranceKm} km · islands ≥ {visayas.minAreaKm2} km² · {visayas.zoomRange[0]}–
                {visayas.zoomRange[1]}×
              </Caption>
            </figure>
            <figure>
              <Frame view={cebu.bbox} layers={[{ level: cebu, opacity: 0.32 }]}>
                <Overlay view={cebu.bbox}>
                  <Rings radii={[25, 50, 100]} />
                </Overlay>
                {cebuCities.map((c) => (
                  <Dot key={c.name} view={cebu.bbox} x={c.x} y={c.y} size={5} color={SECONDARY} label={cebuLabels.has(c.name) ? c.name : undefined} />
                ))}
                {people
                  .filter((p) => inside(cebu.bbox, p.x, p.y))
                  .map((p) => (
                    <Dot
                      key={p.name}
                      view={cebu.bbox}
                      x={p.x}
                      y={p.y}
                      size={p.name === 'Mika' ? 7 : 5}
                      color={p.name === 'Mika' ? INK : p.land ? ACCENT : SEA}
                      halo={p.name === 'Mika'}
                      label={p.name === 'Mika' ? 'Mika' : p.km >= 30 ? `${p.name} ${p.km} km` : undefined}
                    />
                  ))}
              </Frame>
              <Caption>
                cebu.svg · {cebu.toleranceKm} km · rings 25, 50, 100 km · Mactan, Olango, Camotes, Bantayan, Bohol
              </Caption>
            </figure>
            <figure>
              <Frame view={radar.bbox} layers={[{ level: radar, opacity: 0.32 }]}>
                <Overlay view={radar.bbox}>
                  <Rings radii={[5, 25]} />
                </Overlay>
                {people
                  .filter((p) => inside(radar.bbox, p.x, p.y))
                  .map((p) => (
                    <Dot
                      key={p.name}
                      view={radar.bbox}
                      x={p.x}
                      y={p.y}
                      size={p.name === 'Mika' ? 7 : 5}
                      color={p.name === 'Mika' ? INK : p.land ? ACCENT : SEA}
                      halo={p.name === 'Mika'}
                      label={p.km >= 8 ? `${p.name} ${p.km}` : undefined}
                    />
                  ))}
              </Frame>
              <Caption>radar.svg · {radar.toleranceKm} km · 80 km square on Cebu City · rings 5 and 25 km</Caption>
            </figure>
            <figure>
              <Frame view={nearView} layers={[{ level: radar, opacity: 0.32 }]}>
                <Overlay view={nearView}>
                  <Rings radii={[1, 2, 3, 4, 5]} />
                </Overlay>
                {people
                  .filter((p) => inside(nearView, p.x, p.y))
                  .map((p) => (
                    <Dot
                      key={p.name}
                      view={nearView}
                      x={p.x}
                      y={p.y}
                      size={p.name === 'Mika' ? 8 : 6}
                      color={p.name === 'Mika' ? INK : p.land ? ACCENT : SEA}
                      halo={p.name === 'Mika'}
                      label={`${p.name}${p.km ? ` ${p.km} km` : ''}${p.cast && p.name !== 'Mika' ? ' ·cast' : ''}`}
                    />
                  ))}
              </Frame>
              <Caption>The 5 km framing: radar.svg in a 13 km window (the radar level at about 50× and up stays crisp)</Caption>
            </figure>
          </div>
        </Section>

        <Section
          n="04 · roster"
          title={atSea.length ? `${atSea.length} roster stars are in the sea` : 'Every roster star is on land'}
          note="Each person in story.ts, placed from Cebu City, tested on the finest level that holds them. Corrected bearings are reported by the build; story.ts is not edited from here."
        >
          <div className="overflow-x-auto rounded-[10px] ring-1 ring-white/10">
            <table className="figure w-full min-w-[520px] text-left text-[12px]">
              <thead className="text-[11px] uppercase tracking-[0.1em] text-[#A08E84]">
                <tr className="border-b border-white/10">
                  {['who', 'km', 'bearing', 'level', 'where'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.name} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-[#F2EDE8]">
                      {p.name}
                      {p.cast && p.name !== 'Mika' ? <span className="text-[#A08E84]"> · cast</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[#BCADA3]">{p.km}</td>
                    <td className="px-3 py-2 text-[#BCADA3]">{p.bearing}°</td>
                    <td className="px-3 py-2 text-[#BCADA3]">{p.level}</td>
                    <td className="px-3 py-2" style={{ color: p.land ? ACCENT : SEA }}>
                      {p.land ? 'land' : 'sea'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          n="05 · overlay"
          title="The levels line up"
          note="Pairs drawn with a difference blend: where both levels say land, the land cancels to black, so only the coastline between them shows. An offset would show as a band along every coast; this is a hairline, the two simplifications differing."
        >
          <div className="grid gap-x-8 gap-y-14 md:grid-cols-3">
            <figure>
              <Frame view={visayas.bbox} layers={[{ level: archipelago }, { level: visayas, blend: 'difference' }]} />
              <Caption>archipelago × visayas · the Visayas box</Caption>
            </figure>
            <figure>
              <Frame view={kmBox(HOME.x, HOME.y, 90)} layers={[{ level: visayas }, { level: cebu, blend: 'difference' }]} />
              <Caption>visayas × cebu · 180 km window on Cebu City</Caption>
            </figure>
            <figure>
              <Frame view={kmBox(HOME.x, HOME.y, 15)} layers={[{ level: cebu }, { level: radar, blend: 'difference' }]} />
              <Caption>cebu × radar · 30 km window on Cebu City</Caption>
            </figure>
          </div>
        </Section>

        <Section
          n="06 · §1.13"
          title="The plane"
          note="The archipelago level laid back as the map plane: CSS perspective and rotateX 50°, swaying on the compositor. Ch8's constellation cities hover above the ground on threads of light, at depth, not drawn smaller."
        >
          <figure>
            <div className="lab-stage relative flex h-[440px] items-center justify-center overflow-hidden rounded-[10px] bg-[radial-gradient(120%_80%_at_50%_100%,#1E1A17_0%,#161311_60%)] ring-1 ring-white/10 md:h-[700px]">
              <div className="lab-plane relative w-[min(64vw,240px)] shrink-0 md:mb-[56px] md:w-[440px]" style={{ aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}` }}>
                <img src={asset(archipelago.file)} alt="The archipelago level as a plane" draggable={false} className="absolute inset-0 h-full w-full select-none opacity-[0.28]" />
                {CITIES.map((c) => (
                  <span
                    key={c.name}
                    aria-hidden
                    className="absolute h-[3px] w-[3px] rounded-full bg-[#F2EDE8]/50"
                    style={{ left: pct(c.x, VIEWBOX.width), top: pct(c.y, VIEWBOX.height), transform: 'translate(-50%, -50%)' }}
                  />
                ))}
                {CLUSTER_CITIES.map((name, i) => {
                  const c = city(name);
                  const left = pct(c.x, VIEWBOX.width);
                  const top = pct(c.y, VIEWBOX.height);
                  const lift = 22 + ((i * 7) % 4) * 6;
                  // Direct children of the plane: preserve-3d reaches one level only, and a wrapper would flatten them.
                  return (
                    <Fragment key={name}>
                      <span
                        aria-hidden
                        className="absolute w-px"
                        style={{
                          left,
                          top: `calc(${top} - ${lift}px)`,
                          height: lift,
                          transformOrigin: '50% 100%',
                          transform: 'rotateX(-90deg)',
                          background: 'linear-gradient(to top, rgba(242,237,232,0), rgba(242,237,232,.55))',
                        }}
                      />
                      <span
                        aria-hidden
                        className="lab-star absolute h-[7px] w-[7px] rounded-full"
                        style={
                          {
                            left,
                            top,
                            '--delay': `${-(i * 0.53).toFixed(2)}s`,
                            transform: `translateZ(${lift}px) translate(-50%, -50%) rotateX(-50deg)`,
                            background: 'radial-gradient(circle, #FFE7C2 0%, #F2C48D 45%, rgba(209,138,90,0) 72%)',
                            boxShadow: '0 0 10px 3px rgba(242,196,141,.35)',
                          } as CSSProperties
                        }
                      />
                    </Fragment>
                  );
                })}
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#161311] to-transparent" />
            </div>
            <Caption>
              archipelago.svg on a plane at rotateX 50° · perspective 900 px (1,200 from md) · {CLUSTER_CITIES.length} stars on
              threads · reduced motion keeps the pose
            </Caption>
          </figure>
        </Section>

        <Section
          n="07 · B4"
          title="Grain"
          note="160 × 160, three greys around mid-grey at a quarter, a half and a quarter: a triangular dither, neutral under overlay. Every pixel is independent, so the tile has no seam; the dashed lines mark where the tiles meet."
        >
          <div className="grid items-start gap-10 md:grid-cols-3">
            <figure>
              <img
                src={asset('grain.png')}
                alt="The grain tile at 2×"
                width={320}
                height={320}
                className="w-full max-w-[320px] rounded-[6px] ring-1 ring-white/10"
                style={{ imageRendering: 'pixelated' }}
              />
              <Caption>grain.png at 2×, pixelated · {grain ? `${grain.length} bytes` : 'missing'}</Caption>
            </figure>
            <figure>
              <div
                className="relative aspect-square w-full max-w-[480px] overflow-hidden rounded-[6px] ring-1 ring-white/10"
                style={{ backgroundImage: `url(${asset('grain.png')})`, backgroundSize: '33.3333% 33.3333%' }}
              >
                {[1, 2].map((k) => (
                  <span key={`v${k}`} aria-hidden className="absolute inset-y-0 border-l border-dashed border-[#D18A5A]/60" style={{ left: `${(k * 100) / 3}%` }} />
                ))}
                {[1, 2].map((k) => (
                  <span key={`h${k}`} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[#D18A5A]/60" style={{ top: `${(k * 100) / 3}%` }} />
                ))}
              </div>
              <Caption>Tiled 3 × 3: look for the seams at the dashed lines</Caption>
            </figure>
            <figure>
              <div className="grid grid-cols-2 gap-3">
                {[false, true].map((on) => (
                  <div
                    key={String(on)}
                    className="relative aspect-[3/4] overflow-hidden rounded-[6px] ring-1 ring-white/10"
                    style={{ background: 'radial-gradient(90% 70% at 50% 85%, #3A2618 0%, #231A14 45%, #161311 100%)' }}
                  >
                    {on ? (
                      <div
                        aria-hidden
                        className="absolute inset-0 opacity-[0.14]"
                        style={{ backgroundImage: `url(${asset('grain.png')})`, backgroundSize: '160px 160px', mixBlendMode: 'overlay' }}
                      />
                    ) : null}
                    <span className="figure absolute bottom-2 left-2 text-[11px] text-[#A08E84]">{on ? 'grain 14%, overlay' : 'no grain'}</span>
                  </div>
                ))}
              </div>
              <Caption>A night glow with and without the grain (overlay at 14%)</Caption>
            </figure>
          </div>
        </Section>

        <p className="figure mt-20 text-[11px] leading-relaxed text-[#A08E84]">
          Source: {MAP_SOURCE.name}, sha256 {MAP_SOURCE.sha256.slice(0, 16)}…, {MAP_SOURCE.licence} ({MAP_SOURCE.licenceUrl}).
        </p>
      </div>
    </main>
  );
}
