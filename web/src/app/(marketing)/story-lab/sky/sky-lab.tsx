'use client';

import { motion, useMotionValue, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { STARS, type StarId } from '@/components/story/data/constellation';
import { CAST } from '@/components/story/data/story';
import type { SkyEngine } from '@/components/story/sky/engine';
import { MapLayer, type MapLayerLevel } from '@/components/story/sky/map-layer';
import { SkyCanvas } from '@/components/story/sky/sky-canvas';
import type { SkyVariant } from '@/components/story/sky/sky-seed';
import type { SkyFrame, SkyStats } from '@/components/story/sky/types';
import { StarStop } from '@/components/story/svg/star-stop';
import { CITY_LABELS, labFrame, type Layout } from './choreography';

const CAST_LABELS: { star: StarId; text: string }[] = (['mika', 'ernie', 'kenn', 'bea'] as const).map((who) => {
  const star = STARS.find((s) => s.id === CAST[who].star)!;
  return { star: star.id, text: `${CAST[who].first} · ${star.label}` };
});

/** Where each cast label sits against its star, so Heze and Porrima (close on the sky) never collide. */
const LABEL_SIDE: Partial<Record<StarId, string>> = {
  alpha: '-translate-x-1/2 translate-y-[14px]',
  gamma: 'translate-x-[10px] translate-y-[8px]',
  epsilon: '-translate-x-1/2 -translate-y-[calc(100%+14px)]',
  zeta: '-translate-x-[calc(100%+10px)] -translate-y-[calc(100%+4px)]',
};

const CAST_NAMES = (['alpha', 'gamma', 'epsilon', 'zeta'] as const).map((id) => STARS.find((s) => s.id === id)!);
/** "Spica 250 ly", "Porrima 38 ly", …, from constellation.ts (Hipparcos 2007 parallaxes). */
const DISTANCES = CAST_NAMES.map((s) => `${s.label} ${Math.round(s.ly)} ly`);

// ─── Frame-cost instrumentation (lab only) ───────────────────────────────

/** The last 120 choreography costs: building one SkyFrame from scroll progress, ms. */
const choreo: number[] = [];
/** Long tasks seen since the page loaded (or since the benchmark started). */
let longTasks = 0;

/** performance.now() is coarse (0.1 ms in most browsers), so a mean over many frames says more than a median. */
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function percentile(xs: number[], q: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
}

type Bench = {
  size: string;
  variant: string;
  draws: number;
  median: number;
  p95: number;
  max: number;
  choreoMean: number;
  choreoMax: number;
  frames: number;
  fps: number;
  slow: number;
  longTasks: number;
  sprites: number;
};

/**
 * Scroll-linked useTransform stops, safe for Motion's native ScrollTimeline
 * path: every stop inside 0..1 (WAAPI rejects keyframe offsets outside it and
 * throws) and strictly increasing.
 */
function stops(...xs: number[]): number[] {
  const out: number[] = [];
  for (const x of xs) {
    const v = Math.min(1, Math.max(0, x));
    out.push(out.length && v <= out[out.length - 1] ? Math.min(1, out[out.length - 1] + 0.001) : v);
  }
  return out;
}

const REST = 'perspective(1000px) translate3d(0px, 0px, 0px) rotateX(0deg)';

/**
 * One copy beat over the sky, landing in 3D: it rises out of depth, tilted
 * back, turns to face the reader at 0° before it is read, and tips away as
 * it leaves. Transform and opacity only, one useTransform each. A beat that
 * is on screen at load (the hero) starts at rest: it is never hidden.
 */
function Beat({
  progress,
  at,
  children,
  place = 'center',
}: {
  progress: MotionValue<number>;
  at: [number, number];
  children: ReactNode;
  /** Where on screen the beat reads: centred, low (under a figure), or left of a desktop sky. */
  place?: 'center' | 'low' | 'left';
}) {
  const [a, b] = at;
  const atLoad = a - 0.1 < 0;
  const transform = useTransform(progress, stops(a - 0.1, a, b, b + 0.1), [
    atLoad ? REST : 'perspective(1000px) translate3d(0px, 64px, -140px) rotateX(16deg)',
    REST,
    REST,
    'perspective(1000px) translate3d(0px, -48px, -110px) rotateX(-12deg)',
  ]);
  const opacity = useTransform(progress, stops(a - 0.1, a - 0.02, b + 0.02, b + 0.1), [atLoad ? 1 : 0, 1, 1, 0]);
  const top = `calc(${(a + b) / 2} * (100% - 100vh) + ${place === 'low' ? 'var(--low, 86vh)' : '50vh'})`;
  const align = place === 'left' ? 'justify-center lg:justify-start lg:pl-[5vw]' : 'justify-center';
  return (
    <motion.div className={`absolute inset-x-0 z-10 flex -translate-y-1/2 px-4 ${align}`} style={{ top }}>
      <motion.div style={{ transform, opacity }} className="w-full max-w-2xl will-change-transform">
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Staggered lines inside a beat: each enters a little after the one above (all at rest at load for the hero). */
function Line({ progress, at, i, children, className = '' }: { progress: MotionValue<number>; at: number; i: number; children: ReactNode; className?: string }) {
  const s = at - 0.1 + i * 0.022;
  const atLoad = at - 0.1 < 0;
  const transform = useTransform(progress, stops(s, s + 0.07), [atLoad ? 'translate3d(0px, 0px, 0px)' : 'translate3d(0px, 22px, 0px)', 'translate3d(0px, 0px, 0px)']);
  const opacity = useTransform(progress, stops(s, s + 0.06), [atLoad ? 1 : 0, 1]);
  return (
    <motion.div style={{ transform, opacity }} className={className}>
      {children}
    </motion.div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/8 bg-[#161311]/[0.92] px-5 py-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] sm:px-7 sm:py-6 ${className}`}>
      {children}
    </div>
  );
}

const eyebrow = 'font-mono text-[0.75rem] tracking-[0.14em] text-[#BCADA3] uppercase';
const h2 = 'mt-3 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] leading-none font-semibold tracking-[-0.03em] text-[#F2EDE8]';

function useLayout(): [Layout, MotionValue<Layout>] {
  const [layout, setLayout] = useState<Layout>({ w: 1440, h: 900, mobile: false });
  const mv = useMotionValue<Layout>(layout);
  useEffect(() => {
    const read = () => {
      const next = { w: window.innerWidth, h: window.innerHeight, mobile: window.innerWidth < 768 };
      setLayout((old) => (old.w === next.w && old.h === next.h ? old : next));
      mv.set(next);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [mv]);
  return [layout, mv];
}

/** Each demo track: progress 0 to 1 while it scrolls through the viewport, pinned-track style. */
const TRACK = ['start start', 'end end'] as ['start start', 'end end'];

export function SkyLab({ levels }: { levels: MapLayerLevel[] }) {
  const main = useRef<HTMLElement>(null);
  const prologueRef = useRef<HTMLElement>(null);
  const connectRef = useRef<HTMLElement>(null);
  const craneRef = useRef<HTMLElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);
  const { scrollYProgress: p1 } = useScroll({ target: prologueRef, offset: TRACK });
  const { scrollYProgress: p2 } = useScroll({ target: connectRef, offset: TRACK });
  const { scrollYProgress: p3 } = useScroll({ target: craneRef, offset: TRACK });
  const { scrollYProgress: page } = useScroll();
  const [layout, layoutMV] = useLayout();
  const frame = useTransform<number, SkyFrame>(() => {
    const t0 = performance.now();
    const f = labFrame(p1.get(), p2.get(), p3.get(), layoutMV.get());
    choreo.push(performance.now() - t0);
    if (choreo.length > 120) choreo.shift();
    return f;
  });

  const [variant, setVariant] = useState<SkyVariant | 'auto'>('auto');
  const [frozen, setFrozen] = useState(false);
  const statsSink = useRef<((s: SkyStats) => void) | null>(null);
  const onStats = useCallback((s: SkyStats) => statsSink.current?.(s), []);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
    const po = new PerformanceObserver((list) => {
      longTasks += list.getEntries().length;
    });
    po.observe({ type: 'longtask', buffered: true });
    return () => po.disconnect();
  }, []);

  const progressBar = useTransform(page, [0, 1], ['scaleX(0)', 'scaleX(1)']);

  const labels = (
    <>
      <div data-sky-label="mika-chip" className="absolute top-0 left-0 opacity-0">
        <div className="-translate-x-1/2 translate-y-[18px] rounded-full border border-[#F0C88E]/30 bg-[#161311]/[0.92] px-3.5 py-1.5 font-mono text-[11px] tracking-[0.06em] whitespace-nowrap text-[#F2EDE8] sm:text-xs">
          Mika · Photographer · Cebu City
        </div>
      </div>
      {CAST_LABELS.map(({ star, text }) => (
        <div key={star} data-sky-label={`cast-${star}`} className="absolute top-0 left-0 opacity-0">
          <div className={`${LABEL_SIDE[star] ?? LABEL_SIDE.alpha} font-mono text-[11px] tracking-[0.06em] whitespace-nowrap text-[#F2EDE8] [text-shadow:0_1px_8px_#161311,0_0_2px_#161311] sm:text-xs`}>
            {text}
          </div>
        </div>
      ))}
      {CITY_LABELS.map((name) => (
        <div key={name} data-sky-label={`city-${name}`} className="absolute top-0 left-0 opacity-0">
          <div className="translate-x-[14px] -translate-y-1/2 font-mono text-[11px] tracking-[0.08em] whitespace-nowrap text-[#BCADA3] uppercase [text-shadow:0_1px_8px_#161311]">
            {name}
          </div>
        </div>
      ))}
      <div data-sky-label="bea-tag" className="absolute top-0 left-0 opacity-0">
        <div className="-translate-x-1/2 translate-y-[16px] rounded-xl border border-white/10 bg-[#161311]/[0.92] px-3 py-2 font-mono text-[11px] whitespace-nowrap text-[#F2EDE8] sm:translate-x-[16px] sm:-translate-y-1/2 sm:text-xs">
          Bea · HMUA · Cebu City
        </div>
      </div>
    </>
  );

  return (
    <main ref={main} className="relative bg-[#0E0C0B] text-[#F2EDE8] [overflow-x:clip]">
      {/* The fixed stage: a sibling of the tracks, never inside a transformed ancestor. */}
      <div className="fixed inset-x-0 top-0 h-lvh bg-[radial-gradient(120%_80%_at_50%_100%,#1E1A17_0%,#161311_45%,#0E0C0B_100%)]">
        {frozen ? (
          <div className="absolute inset-0 grid place-items-center font-mono text-xs text-[#A08E84]">Frozen to the poster by the auto-degrade.</div>
        ) : (
          <SkyCanvas
            key={variant}
            frame={frame}
            variant={variant}
            sentinel={main}
            onStats={onStats}
            onFreeze={() => setFrozen(true)}
            engineRef={engineRef}
            map={<MapLayer levels={levels} />}
            labels={labels}
          />
        )}
      </div>

      <motion.div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[2px] origin-left bg-[#D18A5A]" style={{ transform: progressBar }} />

      <header className="relative z-20 mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-5 pt-16 pb-10">
        <p className={eyebrow}>Story lab · sky</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">One camera, two skies</h1>
        <p className="mt-4 max-w-xl text-[#BCADA3]">
          Scroll. Three scenes on one 3D camera: the Prologue descent onto Cebu City, Ch3&rsquo;s Virgo seen from where you
          stand, and Ch8&rsquo;s crane up over the archipelago. The coastline is G-b&rsquo;s map, placed by the same camera
          as the stars ({levels.length} levels).
        </p>
        <p className="mt-6 font-mono text-xs text-[#A08E84]">Scroll down ↓</p>
      </header>

      <section ref={prologueRef} className="relative h-[300vh] sm:h-[340vh]" aria-label="Prologue: the descent">
        <Beat progress={p1} at={[0.04, 0.16]} place="left">
          <Card className="bg-[#161311]/[0.72]">
            <Line progress={p1} at={0.04} i={0}>
              <p className={eyebrow}>Built in the Philippines, for Filipino creatives</p>
            </Line>
            <Line progress={p1} at={0.04} i={1}>
              <p className="mt-3 text-[clamp(2.4rem,1.4rem+4.6vw,5.4rem)] leading-[0.95] font-semibold tracking-[-0.035em]">
                <span className="block font-medium text-[#BCADA3]">Where creatives find</span>
                <span className="block bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">
                  each other, and get paid
                  <StarStop />
                </span>
              </p>
            </Line>
            <Line progress={p1} at={0.04} i={2}>
              <p className="mt-4 max-w-[52ch] text-[1.0625rem] leading-[1.55] text-[#BCADA3]">
                Virgo is a network of photographers, videographers, editors and other creatives, and the workspace they run the job from.
              </p>
            </Line>
          </Card>
        </Beat>
        <Beat progress={p1} at={[0.5, 0.6]}>
          <p className="text-center font-mono text-xs tracking-[0.14em] text-[#BCADA3] uppercase [text-shadow:0_1px_10px_#0E0C0B]">
            Archipelago → Visayas → Cebu City
          </p>
        </Beat>
      </section>

      <section ref={connectRef} className="relative h-[340vh] [--low:60vh] sm:h-[380vh] md:[--low:86vh]" aria-label="Ch3: from where you stand">
        <Beat progress={p2} at={[0.04, 0.12]}>
          <Card>
            <Line progress={p2} at={0.04} i={0}>
              <p className={eyebrow}>03 · Thursday, 12:31 AM</p>
            </Line>
            <Line progress={p2} at={0.04} i={1}>
              <h2 className={h2}>Nobody lands in your network without agreeing to it.</h2>
            </Line>
          </Card>
        </Beat>
        <Beat progress={p2} at={[0.44, 0.58]} place="low">
          <Card className="max-w-md">
            <Line progress={p2} at={0.44} i={0}>
              <p className={eyebrow}>From where you stand</p>
            </Line>
            <Line progress={p2} at={0.44} i={1}>
              <p className="mt-2 text-[#BCADA3]">
                The same fourteen stars at their real distances. From off to one side they are a scatter; only from Earth do
                they line up.
              </p>
            </Line>
          </Card>
        </Beat>
        <Beat progress={p2} at={[0.93, 0.99]} place="low">
          <div className="text-center [text-shadow:0_1px_10px_#0E0C0B]">
            <p className="font-mono text-xs tracking-[0.06em] text-[#F2EDE8] md:hidden">Virgo · Spica, Porrima, Vindemiatrix, Heze</p>
            <p className="hidden font-mono text-xs tracking-[0.06em] text-[#F2EDE8] md:block">Virgo, from real star positions: Spica, Porrima, Vindemiatrix, Heze.</p>
            {/* Two pairs that wrap as pairs, so a narrow screen never starts a line with a separator. */}
            <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-[#BCADA3]">
              <span className="inline-block whitespace-nowrap">
                {DISTANCES[0]} · {DISTANCES[1]}
              </span>
              <span className="hidden sm:inline"> · </span>{' '}
              <span className="inline-block whitespace-nowrap">
                {DISTANCES[2]} · {DISTANCES[3]}
              </span>
            </p>
          </div>
        </Beat>
      </section>

      <section ref={craneRef} className="relative h-[300vh] sm:h-[320vh]" aria-label="Ch8: the crane up">
        <Beat progress={p3} at={[0.62, 0.8]}>
          <Card>
            <Line progress={p3} at={0.62} i={0}>
              <p className={eyebrow}>08 · Every Saturday</p>
            </Line>
            <Line progress={p3} at={0.62} i={1}>
              <h2 className={h2}>A creative industry is a people business.</h2>
            </Line>
          </Card>
        </Beat>
      </section>

      <footer className="relative z-20 mx-auto max-w-3xl px-5 py-24 text-[#BCADA3]">
        <p className={eyebrow}>End of the lab</p>
        <p className="mt-3">Run the benchmark from the panel to scroll the whole lab at a steady pace and record every draw.</p>
      </footer>

      <Overlay engineRef={engineRef} sinkRef={statsSink} variant={variant} setVariant={setVariant} layout={layout} />
    </main>
  );
}

/**
 * The frame-cost panel. It owns its state, so the 4 Hz stats updates re-render
 * it alone and never the lab around it.
 */
function Overlay({
  engineRef,
  sinkRef,
  variant,
  setVariant,
  layout,
}: {
  engineRef: RefObject<SkyEngine | null>;
  sinkRef: RefObject<((s: SkyStats) => void) | null>;
  variant: SkyVariant | 'auto';
  setVariant: (v: SkyVariant | 'auto') => void;
  layout: Layout;
}) {
  const [stats, setStats] = useState<SkyStats | null>(null);
  const [bench, setBench] = useState<Bench[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    sinkRef.current = setStats;
    return () => {
      sinkRef.current = null;
    };
  }, [sinkRef]);

  useEffect(() => {
    const html = document.documentElement;
    if (paused) html.setAttribute('data-paused', '');
    else html.removeAttribute('data-paused');
    return () => html.removeAttribute('data-paused');
  }, [paused]);

  /** Scroll the whole lab top to bottom at a steady pace and record every draw, choreography and frame. */
  const runBench = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || running) return;
    setRunning(true);
    window.scrollTo(0, 0);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const duration = 16000;
    const frames: number[] = [];
    const choreoAll: number[] = [];
    let start = 0;
    let last = 0;
    const step = (now: number) => {
      if (!start) {
        start = now;
        longTasks = 0;
        choreo.length = 0;
        engine.startTrace();
      } else frames.push(now - last);
      last = now;
      choreoAll.push(...choreo.splice(0));
      const t = Math.min(1, (now - start) / duration);
      window.scrollTo(0, Math.round(max * t));
      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      const trace = engine.stopTrace();
      const draws = trace?.draws ?? [];
      const base = percentile(frames, 0.2);
      const s = (window as unknown as { __skyStats?: SkyStats }).__skyStats;
      const result: Bench = {
        size: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}`,
        variant: s ? `${s.variant}, DPR ${s.dpr}` : '',
        draws: draws.length,
        median: percentile(draws, 0.5),
        p95: percentile(draws, 0.95),
        max: Math.max(0, ...draws),
        choreoMean: mean(choreoAll),
        choreoMax: Math.max(0, ...choreoAll),
        frames: frames.length,
        fps: Math.round((frames.length / duration) * 1000),
        slow: frames.filter((f) => f > base * 1.5).length / Math.max(1, frames.length),
        longTasks,
        sprites: Math.max(0, ...(trace?.sprites ?? [])),
      };
      const w = window as unknown as { __skyBench?: Bench[] };
      w.__skyBench = [...(w.__skyBench ?? []), result];
      setBench((b) => [...b, result]);
      setRunning(false);
    };
    requestAnimationFrame(step);
  }, [engineRef, running]);

  useEffect(() => {
    (window as unknown as { __skyStats?: SkyStats | null }).__skyStats = stats;
  }, [stats]);

  const c50 = mean(choreo);
  return (
    <>
      {/* Machine-readable copies for headless checks (an isolated script world cannot see window globals). */}
      <div hidden data-sky-stats={stats ? JSON.stringify({ ...stats, choreoMs: c50, mobile: layout.mobile }) : ''} data-sky-bench={JSON.stringify(bench)} />
      <aside className="fixed right-2 bottom-2 z-40 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-white/10 bg-[#0E0C0B]/90 p-2.5 font-mono text-[11px] leading-[1.5] text-[#BCADA3] shadow-2xl sm:right-3 sm:bottom-3 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#F2EDE8]">sky · frame cost</span>
          <span className="tabular-nums">{stats ? `${stats.medianMs.toFixed(2)} ms · ${stats.variant} · DPR ${stats.dpr}` : '…'}</span>
          <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="rounded-md border border-white/10 px-1.5 sm:hidden">
            {open ? 'less' : 'more'}
          </button>
        </div>
        <div className={open ? 'block' : 'hidden sm:block'}>
          {stats && (
            <div className="mt-1 grid grid-cols-2 gap-x-3 tabular-nums" data-testid="sky-stats">
              <span>draw {stats.drawMs.toFixed(2)} ms</span>
              <span>
                median {stats.medianMs.toFixed(2)} · p95 {stats.p95Ms.toFixed(2)}
              </span>
              <span>choreography {c50.toFixed(3)} ms</span>
              <span>draws/s {stats.fps}</span>
              <span>
                sprites {stats.sprites}/{stats.budget}
              </span>
              <span>stars {stats.stars}</span>
              <span>
                level {stats.level} · base {stats.baseMs} ms
              </span>
              <span>
                slow {(stats.slowShare * 100).toFixed(0)}%{stats.idle ? ` · ${stats.idle}` : ''}
              </span>
              <span>
                {stats.width}×{stats.height}
              </span>
              <span>seed {stats.seedHash}</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['auto', 'desktop', 'mobile', 'lite'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={`rounded-md border px-2 py-1 ${variant === v ? 'border-[#D18A5A] text-[#F2EDE8]' : 'border-white/10'}`}
              >
                {v}
              </button>
            ))}
            <button type="button" aria-pressed={paused} onClick={() => setPaused((x) => !x)} className={`rounded-md border px-2 py-1 ${paused ? 'border-[#D18A5A] text-[#F2EDE8]' : 'border-white/10'}`}>
              pause
            </button>
            <button type="button" disabled={running} onClick={runBench} className="rounded-md border border-[#D18A5A]/60 px-2 py-1 text-[#F2EDE8] disabled:opacity-50">
              {running ? 'running…' : 'benchmark'}
            </button>
          </div>
          {bench.map((b, i) => (
            <div key={i} className="mt-1.5 border-t border-white/10 pt-1.5 tabular-nums" data-testid="sky-bench">
              {b.size} ({b.variant}): {b.draws} draws, median {b.median.toFixed(2)} ms, p95 {b.p95.toFixed(2)}, max {b.max.toFixed(1)}; choreography
              mean {b.choreoMean.toFixed(3)} ms (max {b.choreoMax.toFixed(1)}); {b.fps} fps, {(b.slow * 100).toFixed(1)}% slow frames, {b.longTasks} long tasks; ≤ {b.sprites} sprites
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
