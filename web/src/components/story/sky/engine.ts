/**
 * B1: the sky engine. One canvas, one 3D camera, two scenes (storyboard §1.3,
 * §1.13), framework-free so the page, the lab and any test page drive it the
 * same way.
 *
 * Each frame it draws the seeded star cloud and the story's marks in the geo
 * scene, Virgo at its real distances in the deep-sky scene (crossfading by
 * opacity), writes the map layers' `matrix3d` so the plane y = 0 lands on the
 * same pixels as the canvas, and moves the HTML labels by translate only.
 *
 * Cost control, as the storyboard sets it:
 * - Draws only when the frame object changes, or for the twinkle (8% of
 *   stars, at most 30 fps). While the camera holds still the steady stars
 *   are cached in an offscreen bitmap: a twinkle frame is one blit plus the
 *   twinkling few.
 * - Device pixel ratio: 1.5 on phones; desktop min(dpr, 2, √(8M / (w × h))).
 * - Sprite budget per frame: 600 on phones, 1,200 on desktop, all marks included.
 * - Stops when the tab is hidden or its sentinel leaves the viewport; under
 *   `<html data-paused>` the twinkle stops but scroll-driven frames still draw.
 * - Lite mode (Save-Data, 2G/3G, ≤ 2 GB memory): 160 stars, no twinkle.
 * - Auto-degrade, measured on this device: if the median draw over 45 draws
 *   (skipping the first 10 after mount or resize) passes 6 ms, or more than
 *   a quarter of 45 frames of camera motion arrive later than 1.5× the
 *   device's own measured frame interval, halve the stars and stop the
 *   twinkle; if it fires again, freeze to the poster.
 *
 * Deep space (space.ts) sits behind both scenes: built at idle in slices,
 * faded in, drawn into this canvas (into the steady cache with the cloud
 * while the camera holds). Its far stars twinkle with the cloud's; a
 * shooting star crosses at most every 8 to 12 s, only while a chapter shows
 * the sky (`setLive`), never under Pause, in lite mode, after a degrade or
 * in a hidden tab. Lite mode draws no deep space at all. `destroy()` gives
 * every bitmap back (the canvas, the cache, the sprites and deep space).
 */
import { KM_PER_UNIT } from '../data/projection';
import { pixelsPerUnit, planeMatrix, project, smoothstep, view, type PlaneBox, type Projected, type View } from './camera';
import { paintCloud, paintClusters, paintMotes, paintRings, paintStars, paintThreads, type CloudLook, type Painter } from './paint';
import { SEED_MAP } from './seed-map';
import { COUNTS, deepField, hashStars, motes, starCloud, type SeedMap, type SkyVariant, type StarCloud } from './sky-seed';
import type { Meteor, SpaceArt, SpaceBuilder, SpaceView } from './space';
import { tileSize } from './space-size';
import { context, makeSprites, release, releaseSprites, surface, type Ctx, type Surface } from './sprites';
import type { FrameSource, GeoState, SkyFrame, SkyStats } from './types';

const BUDGET: Record<SkyVariant, number> = { desktop: 1200, mobile: 600, lite: 600 };
/** Kept back from the cloud's share of the budget for the story's own marks; half of it is the motes' ceiling. */
const RESERVE = 160;
const CLOUD_BASE = [5, 8.5, 14] as const;
/** The large stars' halo, as a share of their alpha. */
const CLOUD_GLOW = 0.3;
const FIELD_BASE = [3.8, 6, 9.5] as const;
const TWINKLE_MS = 1000 / 30;
const WINDOW = 45;
const SKIP = 10;
const SLOW_DRAW_MS = 6;
/** Deep space fades in over this long once built. */
const SPACE_FADE_MS = 900;
/** The first shooting star comes this long after the sky first shows (plus up to the same again); then every 8 to 12 s. */
const METEOR_FIRST_MS = 5000;
const METEOR_GAP_MS = [8000, 12000] as const;

type SpaceModule = typeof import('./space');

export type SkyEngineOptions = {
  /** The stage: holds the canvas, `[data-sky-map]` with its `[data-sky-map-level]` layers, and `[data-sky-label]` elements. */
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  frame: FrameSource;
  /** Default 'auto': lite on constrained devices, mobile under 768 px wide, else desktop. */
  variant?: SkyVariant | 'auto';
  /** Drawing stops while this element is out of view (default: never). */
  sentinel?: Element | null;
  /** The story map the stars are seeded on. Default: seed-map.ts, the real one. */
  seed?: SeedMap;
  /** Deep space behind the scenes (default true; lite mode never draws it). */
  space?: boolean;
  /** Whether a chapter is showing the sky at first (default true): shooting stars only cross a live sky. See `setLive`. */
  live?: boolean;
  onStats?: (stats: SkyStats) => void;
  /** The engine has given up drawing; show the poster. */
  onFreeze?: () => void;
};

/** Save-Data, a 2G or 3G connection, or 2 GB of memory or less. */
export function liteDevice(): boolean {
  const n = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  const c = n.connection;
  return !!(c?.saveData || /^(slow-2g|2g|3g)$/.test(c?.effectiveType ?? '') || (n.deviceMemory && n.deviceMemory <= 2));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  return s.length ? s[s.length >> 1] : 0;
};
const percentile = (xs: number[], q: number) => {
  const s = [...xs].sort((p, r) => p - r);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

/** Every draw cost and every frame interval while a trace runs: for benchmarks. */
export type SkyTrace = { draws: number[]; frames: number[]; sprites: number[] };

/** The deep-sky painter, a chunk of its own (see paint-deep.ts). */
type DeepPainter = typeof import('./paint-deep');

type MapLayer = { el: HTMLElement; box: PlaneBox; tolerance: number; matrix: string; weight: number };
type Label = { el: HTMLElement; transform: string; opacity: number };

export class SkyEngine {
  private readonly o: SkyEngineOptions;
  private readonly g: CanvasRenderingContext2D;
  private readonly read: () => SkyFrame | null;
  private readonly unsubscribe: (() => void) | null;
  private readonly cleanups: (() => void)[] = [];
  private readonly painter: Painter;
  private readonly seed: SeedMap;
  private readonly seedHash: string;
  private readonly field = deepField();
  private readonly motes = motes();
  private readonly gv = {} as View;
  private readonly dv = {} as View;
  private readonly pt: Projected = { x: 0, y: 0, depth: 0 };
  private cache: Surface | null = null;
  private cacheG: Ctx | null = null;
  private cacheOk = false;
  private readonly key = new Float64Array(32);
  private readonly nextKey = new Float64Array(32);
  private spaceMod: SpaceModule | null = null;
  private spaceLoading = false;
  private spaceBuilder: SpaceBuilder | null = null;
  private spaceArt: SpaceArt | null = null;
  private spaceKey = '';
  private spaceAt = 0;
  private readonly sv = {} as SpaceView;
  private live = true;
  private meteor: Meteor | null = null;
  private nextMeteor = 0;
  private meteorRnd: (() => number) | null = null;
  private meteors = 0;
  private variant: SkyVariant = 'desktop';
  private level: 0 | 1 | 2 = 0;
  private cloud: StarCloud;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private frame: SkyFrame | null = null;
  private drawn: SkyFrame | null | undefined = undefined;
  private hidden = false;
  private offscreen = false;
  private paused = false;
  private destroyed = false;
  private pending = false;
  private raf = 0;
  private lastTick = 0;
  private lastTwinkle = 0;
  private moved = false;
  private motionUntil = 0;
  private time = 0;
  private costs: number[] = [];
  private skip = SKIP;
  private intervals: number[] = [];
  private base = 1000 / 60;
  private slow: boolean[] = [];
  private slowShare = 0;
  private drawTimes: number[] = [];
  private lastCost = 0;
  private statsAt = -Infinity;
  private map: MapLayer[] = [];
  private mapRoot: HTMLElement | null = null;
  private mapOpacity = -1;
  private haze: HTMLElement | null = null;
  private hazeY = NaN;
  private labels = new Map<string, Label>();
  private labelsSeen = new Set<string>();
  private traced: SkyTrace | null = null;
  private deepPainter: DeepPainter | null = null;
  private deepLoading = false;

  constructor(options: SkyEngineOptions) {
    this.o = options;
    const g = options.canvas.getContext('2d', { alpha: true });
    if (!g) throw new Error('SkyEngine: no 2D canvas');
    this.g = g;
    this.painter = { g, sprites: makeSprites(1), count: 0, budget: 0, time: 0 };
    this.seed = options.seed ?? SEED_MAP;
    this.cloud = starCloud(this.seed, 0);
    this.seedHash = hashStars(starCloud(this.seed, COUNTS.desktop));

    const src = options.frame;
    if (typeof src === 'function') {
      this.read = src;
      this.unsubscribe = null;
    } else {
      this.read = () => src.get();
      this.unsubscribe = src.on('change', this.onChange);
    }

    this.paused = document.documentElement.hasAttribute('data-paused');
    this.hidden = document.hidden;
    this.live = options.live ?? true;
    this.refresh();
    this.resize();

    const onVisibility = () => {
      this.hidden = document.hidden;
      // A shooting star never waits out a hidden tab to finish on its return.
      if (this.hidden) this.meteor = null;
      this.wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const paused = new MutationObserver(() => {
      this.paused = document.documentElement.hasAttribute('data-paused');
      this.cacheOk = false;
      this.wake();
    });
    paused.observe(document.documentElement, { attributes: true, attributeFilter: ['data-paused'] });
    this.cleanups.push(() => paused.disconnect());

    const sized = new ResizeObserver(() => this.resize());
    sized.observe(options.canvas);
    this.cleanups.push(() => sized.disconnect());

    // Labels and map layers come and go with the page's own rendering: find them again only when they do.
    const added = new MutationObserver(() => this.refresh());
    added.observe(options.root, { childList: true, subtree: true });
    this.cleanups.push(() => added.disconnect());

    if (options.sentinel) {
      const seen = new IntersectionObserver((entries) => {
        this.offscreen = !entries[entries.length - 1].isIntersecting;
        this.wake();
      });
      seen.observe(options.sentinel);
      this.cleanups.push(() => seen.disconnect());
    }

    this.frame = this.read();
    this.wake();

    // Fetch the deep-sky painter once the page is idle, well before Ch3 needs it; then build deep space.
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const later = () => {
      this.loadDeep();
      this.loadSpace();
    };
    if (idle) idle(later, { timeout: 4000 });
    else setTimeout(later, 1500);
  }

  /** Whether a chapter is showing the sky right now: shooting stars only cross a live sky. */
  setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    if (live) this.wake();
  }

  /** Builds deep space now rather than at idle, and resolves once it is drawn (for checks and the lab). */
  async loadSpaceNow(): Promise<boolean> {
    this.loadSpace(true);
    for (let i = 0; i < 400 && !this.destroyed && (this.spaceLoading || this.spaceBuilder) && !this.spaceArt; i++) {
      await new Promise((r) => setTimeout(r, 0));
    }
    return !!this.spaceArt;
  }

  private loadSpace(now = false) {
    if (this.spaceMod || this.spaceLoading || this.destroyed || this.o.space === false) return;
    this.spaceLoading = true;
    import('./space').then(
      (m) => {
        this.spaceMod = m;
        this.spaceLoading = false;
        this.ensureSpace(now);
      },
      () => {
        this.spaceLoading = false;
      },
    );
  }

  /** Starts (or restarts, after a resize that changes its size) building deep space for the current variant and DPR. */
  private ensureSpace(now = false) {
    const m = this.spaceMod;
    if (!m || this.destroyed) return;
    if (this.variant === 'lite') {
      this.dropSpace();
      return;
    }
    const variant = this.variant === 'mobile' ? 'mobile' : 'desktop';
    const key = `${variant}|${tileSize(this.dpr)}`;
    if (key === this.spaceKey) return;
    this.dropSpace();
    this.spaceKey = key;
    const builder = new m.SpaceBuilder(variant, this.dpr);
    this.spaceBuilder = builder;
    const idle = (globalThis as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const next = (fn: (d?: { timeRemaining(): number }) => void) => (idle && !now ? idle(fn, { timeout: 1000 }) : setTimeout(fn, 0));
    const run = (deadline?: { timeRemaining(): number }) => {
      if (this.destroyed || this.spaceBuilder !== builder) return;
      const ms = deadline ? Math.max(3, Math.min(12, deadline.timeRemaining() - 1)) : 6;
      if (!builder.step(ms)) {
        next(run);
        return;
      }
      this.spaceBuilder = null;
      this.spaceArt = builder.art;
      this.spaceAt = performance.now();
      this.cacheOk = false;
      this.drawn = undefined;
      this.motionUntil = Math.max(this.motionUntil, this.spaceAt + SPACE_FADE_MS + 60);
      this.wake();
    };
    next(run);
  }

  private dropSpace() {
    this.spaceBuilder?.dispose();
    this.spaceBuilder = null;
    this.spaceMod?.releaseSpace(this.spaceArt);
    this.spaceArt = null;
    this.spaceKey = '';
    this.meteor = null;
    this.cacheOk = false;
  }

  private loadDeep() {
    if (this.deepPainter || this.deepLoading || this.destroyed) return;
    this.deepLoading = true;
    import('./paint-deep').then(
      (m) => {
        this.deepPainter = m;
        this.drawn = undefined;
        this.wake();
      },
      () => {
        this.deepLoading = false;
      },
    );
  }

  /** Re-read the map layers and labels in the stage, after the DOM inside it changed. */
  refresh(): void {
    const root = this.o.root;
    this.mapRoot = root.querySelector<HTMLElement>('[data-sky-map]');
    this.mapOpacity = -1;
    this.haze = root.querySelector<HTMLElement>('[data-sky-haze]');
    this.hazeY = NaN;
    this.map = [...root.querySelectorAll<HTMLElement>('[data-sky-map-level]')]
      .map((el) => {
        const [x, y, width, height] = (el.dataset.box ?? '').split(/\s+/).map(Number);
        return {
          el,
          box: { x, y, width, height, scale: Number(el.dataset.scale) || 1 },
          tolerance: Number(el.dataset.tolerance) || 1,
          matrix: '',
          weight: -1,
        };
      })
      .filter((m) => m.box.width > 0 && m.box.height > 0)
      .sort((a, b) => b.tolerance - a.tolerance);
    const labels = new Map<string, Label>();
    for (const el of root.querySelectorAll<HTMLElement>('[data-sky-label]')) {
      const id = el.dataset.skyLabel ?? '';
      labels.set(id, this.labels.get(id)?.el === el ? this.labels.get(id)! : { el, transform: '', opacity: -1 });
    }
    this.labels = labels;
    this.drawn = undefined;
    this.onChange();
  }

  /** Draw again on the next microtask: for a getter source, call this whenever the frame changes. */
  invalidate(): void {
    this.onChange();
  }

  /** A world point on screen in the given scene's current camera, or null when it is behind the camera. */
  project(scene: 'geo' | 'deep', x: number, y: number, z: number): { x: number; y: number } | null {
    const v = scene === 'geo' ? this.gv : this.dv;
    if (!v.width) return null;
    project(v, x, y, z, this.pt);
    return this.pt.depth > 0 ? { x: this.pt.x, y: this.pt.y } : null;
  }

  /** Start recording every draw cost and frame interval. */
  startTrace(): void {
    this.traced = { draws: [], frames: [], sprites: [] };
  }

  /** Stop recording and hand the samples over. */
  stopTrace(): SkyTrace | null {
    const t = this.traced;
    this.traced = null;
    return t;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.unsubscribe?.();
    for (const c of this.cleanups) c();
    // Give every bitmap back now: iOS counts a canvas's memory until it is collected.
    this.dropSpace();
    release(this.cache);
    this.cache = null;
    this.cacheG = null;
    releaseSprites(this.painter.sprites);
    this.o.canvas.width = 0;
    this.o.canvas.height = 0;
  }

  // ─── Scheduling ────────────────────────────────────────────────────────

  private active(): boolean {
    return !this.destroyed && !this.hidden && !this.offscreen && this.level < 2 && this.w > 0;
  }

  private twinkles(): boolean {
    return !this.paused && this.level === 0 && this.variant !== 'lite';
  }

  /** A new frame value: draw it in a microtask, still inside the frame Motion just updated. */
  private onChange = () => {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(this.flush);
  };

  private flush = () => {
    this.pending = false;
    if (!this.active()) return;
    const next = this.read();
    if (next === this.drawn) return;
    this.frame = next;
    this.moved = true;
    const now = performance.now();
    this.motionUntil = now + 320;
    // A moving frame redraws every star anyway: let it carry the twinkle, so
    // the 30 fps twinkle tick does not draw the same frame twice.
    if (this.twinkles()) {
      this.time = now / 1000;
      this.lastTwinkle = now;
    }
    this.draw();
    this.loop();
  };

  private wake() {
    if (!this.active()) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.lastTick = 0;
      return;
    }
    this.frame = this.read();
    if (this.frame !== this.drawn) this.draw();
    this.loop();
  }

  private loop() {
    if (!this.raf && this.active() && (this.twinkles() || performance.now() < this.motionUntil)) {
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.active()) {
      this.lastTick = 0;
      return;
    }
    if (this.lastTick) this.measure(now - this.lastTick);
    this.lastTick = now;
    this.moved = false;
    // A shooting star is too quick for the 30 fps twinkle: while one crosses, every frame draws.
    if (this.twinkles() && (this.meteor || now - this.lastTwinkle >= TWINKLE_MS - 2)) {
      this.lastTwinkle = now;
      this.time = now / 1000;
      this.draw();
    }
    if (this.twinkles() || now < this.motionUntil) this.raf = requestAnimationFrame(this.tick);
    else this.lastTick = 0;
  };

  /** The device's own frame interval, and how many motion frames come in late against it. */
  private measure(dt: number) {
    if (dt > 250) return;
    this.traced?.frames.push(dt);
    this.intervals.push(dt);
    if (this.intervals.length > 90) this.intervals.shift();
    // Judge nothing until this device's own interval is known: a phone held
    // at 30 Hz by Low Power Mode is not dropping frames against an assumed 60.
    if (this.intervals.length < 20) return;
    this.base = percentile(this.intervals, 0.2);
    if (!this.moved) return;
    this.slow.push(dt > this.base * 1.5);
    if (this.slow.length > WINDOW) this.slow.shift();
    if (this.slow.length === WINDOW) {
      this.slowShare = this.slow.filter(Boolean).length / WINDOW;
      if (this.slowShare > 0.25) this.degrade();
    }
  }

  private degrade() {
    this.slow = [];
    this.costs = [];
    this.skip = SKIP;
    if (this.level === 0) {
      this.level = 1;
      this.cloud = starCloud(this.seed, COUNTS[this.variant] >> 1);
      this.cacheOk = false;
      this.drawn = undefined;
      this.report(true);
      return;
    }
    this.level = 2;
    this.o.canvas.style.opacity = '0';
    if (this.mapRoot) this.mapRoot.style.opacity = '0';
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.report(true);
    this.o.onFreeze?.();
  }

  // ─── Size ──────────────────────────────────────────────────────────────

  private resize() {
    const rect = this.o.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (!w || !h) return;
    const want = this.o.variant && this.o.variant !== 'auto' ? this.o.variant : liteDevice() ? 'lite' : w < 768 ? 'mobile' : 'desktop';
    const device = window.devicePixelRatio || 1;
    const dpr =
      want === 'desktop' ? Math.min(device, 2, Math.sqrt(8e6 / (w * h))) : Math.min(device, 1.5);
    const changedDpr = Math.abs(dpr - this.dpr) > 0.01;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.o.canvas.width !== bw || this.o.canvas.height !== bh) {
      this.o.canvas.width = bw;
      this.o.canvas.height = bh;
    }
    if (changedDpr || !this.painter.sprites.px.length) {
      releaseSprites(this.painter.sprites);
      this.painter.sprites = makeSprites(dpr);
    }
    this.variant = want;
    this.cloud = starCloud(this.seed, COUNTS[this.variant] >> (this.level === 1 ? 1 : 0));
    release(this.cache);
    this.cache = null;
    this.cacheG = null;
    this.cacheOk = false;
    this.costs = [];
    this.skip = SKIP;
    this.drawn = undefined;
    this.ensureSpace();
    this.wake();
  }

  // ─── Drawing ───────────────────────────────────────────────────────────

  private draw() {
    const frame = this.frame;
    if (!this.active()) return;
    const t0 = performance.now();
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const p = this.painter;
    p.g = g;
    p.count = 0;
    p.time = this.time;
    const total = BUDGET[this.variant];
    const geo = frame?.geo;
    const deep = frame?.deep;
    const gv = geo ? view(geo.camera, this.w, this.h, this.gv) : null;
    const dv = deep ? view(deep.camera, this.w, this.h, this.dv) : null;
    const painter = this.deepPainter;
    if (deep && !painter) this.loadDeep();
    const geoDrawn = !!(geo && gv && geo.opacity > 0.002);
    const deepDrawn = !!(deep && dv && painter && deep.opacity > 0.002);
    // Deep space: behind everything; it rides in the steady cache when the geo scene is all there is.
    const sv = this.spaceView(frame, geoDrawn ? gv : null, deepDrawn ? dv : null, t0);
    const spaceInCache = !!sv && geoDrawn && !deepDrawn;
    if (sv && !spaceInCache) {
      p.budget = total - RESERVE;
      this.spaceMod!.paintSpace(p, this.spaceArt!, sv, 0, this.twinkles());
    }
    if (geo && gv && geoDrawn) {
      p.budget = total;
      this.drawCloud(geo, gv, spaceInCache ? sv : null);
      this.drawMeteor(sv, t0);
      if (geo.threads) paintThreads(p, gv, geo.threads, geo.opacity);
      if (geo.rings) paintRings(p, gv, geo.rings, geo.opacity);
      if (geo.clusters) paintClusters(p, gv, geo.clusters.list, geo.clusters.wave, geo.opacity);
      if (geo.figure && painter) painter.paintFigure(p, gv, geo.figure, geo.opacity);
      if (geo.stars) paintStars(p, gv, geo.stars, geo.opacity);
    } else this.drawMeteor(sv, t0);
    if (deep && dv && painter && deepDrawn) {
      p.budget = total - RESERVE / 2;
      // The field sits far behind the figure; a high fog floor keeps it a sky rather than dust.
      const look: CloudLook = { base: FIELD_BASE, opacity: deep.opacity * (deep.field ?? 1), twinkle: this.twinkles(), floor: 0.7, glow: CLOUD_GLOW };
      if (look.opacity > 0.002) paintCloud(p, dv, this.field, look, 0);
      p.budget = total;
      painter.paintDeep(p, dv, deep, gv);
    }
    this.placeMap(geo, gv);
    this.placeLabels(frame, gv, dv, deepDrawn);
    g.globalAlpha = 1;
    this.drawn = frame;

    const now = performance.now();
    const cost = now - t0;
    this.lastCost = cost;
    if (this.traced) {
      this.traced.draws.push(cost);
      this.traced.sprites.push(p.count);
    }
    this.drawTimes.push(now);
    while (this.drawTimes.length && now - this.drawTimes[0] > 1000) this.drawTimes.shift();
    if (this.skip > 0) this.skip--;
    else {
      this.costs.push(cost);
      if (this.costs.length > WINDOW) this.costs.shift();
      if (this.costs.length === WINDOW && median(this.costs) > SLOW_DRAW_MS) this.degrade();
    }
    if (now - this.statsAt > 250) this.report(false);
  }

  /** Where deep space is this frame, or null when it is not built, not wanted, or nothing shows. */
  private spaceView(frame: SkyFrame | null, gv: View | null, dv: View | null, now: number): SpaceView | null {
    const m = this.spaceMod;
    if (!m || !this.spaceArt || this.variant === 'lite') return null;
    // The fade-in runs on the twinkle's clock; with the twinkle off it is simply there.
    const fade = this.twinkles() ? smoothstep(0, SPACE_FADE_MS, now - this.spaceAt) : 1;
    const strength = (frame?.space?.opacity ?? 1) * fade;
    const sv = m.spaceView(gv, frame?.geo?.opacity ?? 0, dv, frame?.deep?.opacity ?? 0, strength, this.sv);
    // Rounded, so a settled camera keeps an identical cache key.
    if (sv) sv.alpha = Math.round(sv.alpha * 500) / 500;
    return sv;
  }

  /**
   * The rare shooting star: only on a live sky, with the twinkle on (so never
   * under Pause, in lite mode or after a degrade), at most one every 8 to 12 s.
   */
  private drawMeteor(sv: SpaceView | null, now: number) {
    const m = this.spaceMod;
    if (this.meteor && now - this.meteor.t0 >= this.meteor.dur) this.meteor = null;
    if (!this.twinkles() || !m) {
      this.meteor = null;
      return;
    }
    if (!sv) return;
    if (!this.meteor) {
      const allowed = this.live && sv.alpha > 0.35 && this.frame?.space?.meteors !== false;
      if (!allowed) return;
      this.meteorRnd ??= m.meteorRandom();
      if (!this.nextMeteor) {
        this.nextMeteor = now + METEOR_FIRST_MS * (1 + this.meteorRnd());
        return;
      }
      if (now < this.nextMeteor) return;
      this.meteor = m.spawnMeteor(sv, this.meteorRnd, now);
      this.meteors++;
      this.nextMeteor = now + METEOR_GAP_MS[0] + (METEOR_GAP_MS[1] - METEOR_GAP_MS[0]) * this.meteorRnd();
    }
    const p = this.painter;
    const budget = p.budget;
    p.budget = BUDGET[this.variant];
    if (!m.paintMeteor(p, this.meteor, sv, now)) this.meteor = null;
    p.budget = budget;
  }

  /**
   * Deep space (when it rides with the cloud), the seeded cloud and the
   * motes: straight to the canvas while the camera moves, from the cached
   * bitmap while it holds. Each paints within its own share of the budget,
   * so the story's marks always have room.
   */
  private drawCloud(geo: GeoState, v: View, sv: SpaceView | null) {
    const p = this.painter;
    const total = p.budget;
    const twinkle = this.twinkles();
    const look: CloudLook = { base: CLOUD_BASE, opacity: geo.opacity * (geo.cloud ?? 1), dim: geo.dimOuter, twinkle, glow: CLOUD_GLOW, people: true };
    const moteStrength = (geo.motes ?? 0) * geo.opacity;
    const space = sv && this.spaceMod && this.spaceArt ? { m: this.spaceMod, art: this.spaceArt, sv } : null;
    const steady = (pass: 0 | 1) => {
      p.budget = total - RESERVE;
      if (space) space.m.paintSpace(p, space.art, space.sv, pass, twinkle);
      if (look.opacity > 0.002) paintCloud(p, v, this.cloud, look, pass);
      p.budget = total - RESERVE / 2;
      paintMotes(p, v, this.motes, moteStrength);
      p.budget = total;
    };
    if (look.opacity <= 0.002 && moteStrength <= 0.01 && !space) return;
    if (!twinkle) {
      steady(0);
      return;
    }
    const k = this.nextKey;
    const c = geo.camera;
    const d = geo.dimOuter;
    const sh = c.shift ?? [0, 0];
    k.set([...c.position, ...c.target, ...(c.up ?? [0, 1, 0]), c.fov, sh[0], sh[1], look.opacity, d?.center[0] ?? 0, d?.center[2] ?? 0, d?.radius ?? 0, d?.amount ?? 0, this.w, this.h, this.dpr, this.cloud.count, moteStrength, space ? space.sv.alpha : -1]);
    let same = true;
    for (let i = 0; i < k.length; i++) {
      if (k[i] !== this.key[i]) {
        same = false;
        break;
      }
    }
    if (!same) {
      // Moving: draw everything directly; the cache waits for the camera to settle.
      this.key.set(k);
      this.cacheOk = false;
      steady(0);
      return;
    }
    if (!this.cacheOk) {
      const bw = this.o.canvas.width;
      const bh = this.o.canvas.height;
      if (!this.cache || this.cache.width !== bw || this.cache.height !== bh) {
        this.cache = surface(bw, bh);
        this.cacheG = context(this.cache);
      }
      const cg = this.cacheG;
      if (!cg) {
        steady(0);
        return;
      }
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.clearRect(0, 0, bw, bh);
      cg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const count = p.count;
      p.g = cg;
      steady(1);
      cg.globalAlpha = 1;
      p.g = this.g;
      // The cache is built once per settle; the frame itself pays for one blit.
      p.count = count;
      this.cacheOk = true;
    }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(this.cache!, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    p.count++;
    p.budget = total - RESERVE;
    if (space) space.m.paintSpace(p, space.art, space.sv, 2, twinkle);
    if (look.opacity > 0.002) paintCloud(p, v, this.cloud, look, 2);
    p.budget = total;
  }

  // ─── The map ───────────────────────────────────────────────────────────

  /** Where a screen point's ray meets the map plane, in viewBox units, or null above the horizon. */
  private ground(v: View, sx: number, sy: number): [number, number] | null {
    const a = (sx - v.cx) / v.focal;
    const b = (sy - v.cy) / v.focal;
    const dy = v.fy + a * v.ry - b * v.uy;
    if (dy >= -1e-6) return null;
    const t = -v.py / dy;
    if (t <= 0) return null;
    return [v.px + t * (v.fx + a * v.rx - b * v.ux), -(v.pz + t * (v.fz + a * v.rz - b * v.uz))];
  }

  private placeMap(geo: GeoState | undefined, v: View | null) {
    const opacity = geo && v ? geo.opacity * (geo.map ?? 0) : 0;
    const o = opacity < 0.002 ? 0 : Math.round(opacity * 1000) / 1000;
    if (this.mapRoot && o !== this.mapOpacity) {
      this.mapRoot.style.opacity = String(o);
      this.mapOpacity = o;
    }
    if (this.haze) {
      // The ground plane's horizon on screen: where a ray turns level. Cameras here never roll.
      const y = v && o && v.uy > 1e-4 ? v.cy + (v.focal * v.fy) / v.uy : -1e9;
      const top = Math.max(-2 * this.h, Math.min(this.h, Math.round(y * 2) / 2));
      if (top !== this.hazeY) {
        this.haze.style.transform = `translate3d(0px,${top}px,0px)`;
        this.hazeY = top;
      }
    }
    if (!this.map.length) return;
    const pxPerKm = v ? pixelsPerUnit(v) / KM_PER_UNIT : 0;
    // A crop only counts when it covers the whole view.
    const corners = v && o ? [this.ground(v, 0, 0), this.ground(v, v.width, 0), this.ground(v, 0, v.height), this.ground(v, v.width, v.height)] : [];
    const usable = this.map.map((m, i) => {
      if (!o) return false;
      if (i === 0) return true;
      return corners.every((c) => !!c && c[0] >= m.box.x && c[0] <= m.box.x + m.box.width && c[1] >= m.box.y && c[1] <= m.box.y + m.box.height);
    });
    let previous = -1;
    for (let i = 0; i < this.map.length; i++) {
      const m = this.map[i];
      let weight = 0;
      if (usable[i]) {
        const next = usable.indexOf(true, i + 1);
        // Fade in over the coarser level as it nears its 2 px limit, then let that one go.
        const fadeIn = previous < 0 ? 1 : smoothstep(1.3, 1.65, pxPerKm * this.map[previous].tolerance);
        const fadeOut = next < 0 ? 0 : smoothstep(1.65, 2, pxPerKm * m.tolerance);
        weight = Math.round(fadeIn * (1 - fadeOut) * 1000) / 1000;
        previous = i;
      }
      if (weight > 0 && v) {
        const matrix = planeMatrix(v, m.box);
        if (!matrix) weight = 0;
        else if (matrix !== m.matrix) {
          m.el.style.transform = matrix;
          m.matrix = matrix;
        }
      }
      if (weight !== m.weight) {
        m.el.style.opacity = String(weight);
        m.el.style.visibility = weight > 0 ? 'visible' : 'hidden';
        m.weight = weight;
      }
    }
  }

  // ─── Labels ────────────────────────────────────────────────────────────

  private placeLabels(frame: SkyFrame | null, gv: View | null, dv: View | null, deepDrawn: boolean) {
    if (!this.labels.size) return;
    const seen = this.labelsSeen;
    seen.clear();
    for (const l of frame?.labels ?? []) {
      const label = this.labels.get(l.id);
      if (!label) continue;
      seen.add(l.id);
      let x = NaN;
      let y = NaN;
      if (l.scene === 'deep' && l.star) {
        const s = deepDrawn ? this.deepPainter?.deepScreen(l.star) : undefined;
        if (s?.ok) {
          x = s.x;
          y = s.y;
        }
      } else {
        const v = l.scene === 'deep' ? dv : gv;
        if (v && l.world) {
          project(v, l.world[0], l.world[1], l.world[2], this.pt);
          if (this.pt.depth > 0) {
            x = this.pt.x;
            y = this.pt.y;
          }
        }
      }
      const inView = x > -240 && x < this.w + 240 && y > -120 && y < this.h + 120;
      this.setLabel(label, inView ? l.opacity : 0, inView ? `translate3d(${Math.round(x * 2) / 2}px,${Math.round(y * 2) / 2}px,0)` : label.transform);
    }
    for (const [id, label] of this.labels) if (!seen.has(id)) this.setLabel(label, 0, label.transform);
  }

  private setLabel(label: Label, opacity: number, transform: string) {
    const o = opacity < 0.01 ? 0 : Math.round(opacity * 100) / 100;
    if (transform !== label.transform) {
      label.el.style.transform = transform;
      label.transform = transform;
    }
    if (o !== label.opacity) {
      label.el.style.opacity = String(o);
      label.opacity = o;
    }
  }

  // ─── Stats ─────────────────────────────────────────────────────────────

  private report(force: boolean) {
    const cb = this.o.onStats;
    if (!cb && !force) return;
    this.statsAt = performance.now();
    cb?.({
      drawMs: this.lastCost,
      medianMs: median(this.costs),
      p95Ms: percentile(this.costs, 0.95),
      fps: this.drawTimes.length,
      sprites: this.painter.count,
      budget: BUDGET[this.variant],
      stars: this.cloud.count,
      variant: this.variant,
      dpr: Math.round(this.dpr * 100) / 100,
      width: this.w,
      height: this.h,
      level: this.level,
      baseMs: Math.round(this.base * 10) / 10,
      slowShare: this.slowShare,
      running: this.raf !== 0,
      idle: this.destroyed ? 'destroyed' : this.hidden ? 'tab hidden' : this.offscreen ? 'offscreen' : this.level === 2 ? 'frozen' : this.paused ? 'paused' : '',
      seedHash: this.seedHash,
      space: this.spaceArt ? 'on' : this.spaceBuilder || this.spaceLoading ? 'building' : 'off',
      meteors: this.meteors,
      live: this.live,
    });
  }
}
