#!/usr/bin/env node
/**
 * Behaviour check for the sky engine (storyboard §1.3 cost rules), run
 * headless: the DOM APIs the engine touches are faked, the 2D context counts
 * calls, and the clock is fake, so a "slow device" is a number, not a wait.
 *
 *   node --experimental-strip-types web/src/components/story/sky/check-engine.mjs
 *
 * Proves: the DPR caps; the variant counts; draws only on change; the
 * twinkle at no more than 30 fps on a 120 Hz screen; the cached steady layer
 * (a twinkle frame is one blit plus the twinkling few); Pause stops the
 * twinkle but not scroll-driven frames; hidden tab and offscreen sentinel
 * stop everything; lite mode; the sprite budget; and both auto-degrade
 * signals (median draw cost over 6 ms, skipping 10; more than 25% of 45
 * motion frames slower than 1.5× the device's own measured interval), with
 * a 30 Hz device as the control that must not degrade.
 *
 * Deep space (space.ts) is off in the checks above, so their counts stay
 * exact; its own section proves it builds, counts against the budget, rides
 * in the steady cache, never comes in lite mode, and that shooting stars
 * keep to one every 8 to 12 s on a live sky only, draw every frame while one
 * crosses, and stop under Pause, in a hidden tab and where a frame says so;
 * and that destroy() gives the canvas back.
 */
/* global console, process */
import module from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' || w.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  console.warn(`${w.name}: ${w.message}`);
});
const SCRIPT_EXT = /^\.(?:[cm]?[jt]sx?|json)$/i;
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (!relative || SCRIPT_EXT.test(extname(specifier)) || !context.parentURL?.split('?')[0].endsWith('.ts')) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

// ─── A fake browser ──────────────────────────────────────────────────────

let clock = 0;
let frameTime = 0;
/** What one drawImage costs on the pretend device, ms. */
let spriteCost = 0.0004;
performance.now = () => clock;

class Ctx {
  constructor(canvas) {
    this.canvas = canvas;
    this.draws = 0;
    this.clears = 0;
    this.sprites = 0;
  }
  setTransform() {}
  clearRect() {
    this.clears++;
  }
  beginPath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  stroke() {}
  fillRect() {}
  createRadialGradient() {
    return { addColorStop() {} };
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData() {}
  drawImage() {
    this.sprites++;
    clock += spriteCost;
  }
}
class FakeCanvas {
  constructor(w = 300, h = 150) {
    this.width = w;
    this.height = h;
    this.style = {};
    this.ctx = null;
  }
  getContext() {
    return (this.ctx ??= new Ctx(this));
  }
  getBoundingClientRect() {
    return { width: view.w, height: view.h };
  }
}
let view = { w: 1440, h: 900 };
globalThis.OffscreenCanvas = class extends FakeCanvas {};
const listeners = {};
const attrs = new Set();
const mutations = [];
const mutation = () => mutations.forEach((cb) => cb());
let intersect = () => {};
globalThis.document = {
  hidden: false,
  documentElement: { hasAttribute: (n) => attrs.has(n) },
  addEventListener: (type, fn) => (listeners[type] = fn),
  removeEventListener: () => {},
  createElement: () => new FakeCanvas(),
};
globalThis.window = { devicePixelRatio: 2 };
globalThis.MutationObserver = class {
  constructor(cb) {
    mutations.push(cb);
  }
  observe() {}
  disconnect() {}
};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class {
  constructor(cb) {
    intersect = cb;
  }
  observe() {}
  disconnect() {}
};
let rafs = new Map();
let rafId = 0;
globalThis.requestAnimationFrame = (fn) => {
  rafs.set(++rafId, fn);
  return rafId;
};
globalThis.cancelAnimationFrame = (id) => rafs.delete(id);
const setConnection = (value) => Object.defineProperty(globalThis.navigator, 'connection', { value, configurable: true });

/** One display frame `dt` ms after the last. */
function frame(dt) {
  frameTime += dt;
  clock = Math.max(clock, frameTime);
  const due = rafs;
  rafs = new Map();
  for (const fn of due.values()) fn(frameTime);
}
const settle = () => new Promise((r) => setTimeout(r, 0));

// ─── The engine and a scene ──────────────────────────────────────────────

const { SkyEngine } = await import(pathToFileURL(join(HERE, 'engine.ts')).href);
const { rig, view: viewOf, project, planeMatrix, mixRig, rigAt, easeCamera } = await import(pathToFileURL(join(HERE, 'camera.ts')).href);
const { CLUSTERS } = await import(pathToFileURL(join(HERE, 'clusters.generated.ts')).href);

/** A MotionValue-shaped source. */
function source() {
  let value = null;
  const subs = new Set();
  return {
    get: () => value,
    on: (_event, cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    set(v) {
      value = v;
      for (const cb of subs) cb(v);
    },
  };
}
let step = 0;
/** The whole archipelago from above, nudged a little each call (camera motion). */
const geoFrame = (extra = {}) => ({
  geo: { camera: rig({ target: [320 + (step++ % 50) * 0.01, 0, -550], distance: 1150, pitch: 88, heading: 0, fov: 62 }), opacity: 1, ...extra },
});

function make({ w = 1440, h = 900, dpr = 2, variant = 'auto', space = false } = {}) {
  view = { w, h };
  window.devicePixelRatio = dpr;
  attrs.clear();
  document.hidden = false;
  rafs = new Map();
  const canvas = new FakeCanvas();
  const stats = [];
  let frozen = false;
  const src = source();
  src.set(geoFrame());
  const engine = new SkyEngine({
    root: { querySelector: () => null, querySelectorAll: () => [] },
    canvas,
    frame: src,
    variant,
    space,
    sentinel: {},
    onStats: (s) => stats.push(s),
    onFreeze: () => (frozen = true),
  });
  return { engine, canvas, ctx: canvas.getContext(), src, stats, last: () => stats[stats.length - 1], frozen: () => frozen };
}

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures.push(message);
};
/** Scroll-driven frames: a new frame object every display frame. */
async function scroll(t, frames, dt = 1000 / 60, extra) {
  for (let i = 0; i < frames; i++) {
    t.src.set(geoFrame(extra));
    await settle();
    frame(dt);
  }
}
/** Display frames with nothing changing. */
function idle(frames, dt) {
  for (let i = 0; i < frames; i++) frame(dt);
}

// ─── The checks ──────────────────────────────────────────────────────────

console.log('DPR caps and counts');
{
  const phone = make({ w: 375, h: 812, dpr: 3 });
  await settle();
  check(phone.last().dpr === 1.5 && phone.canvas.width === 563, `phone at DPR 3 draws at 1.5 (${phone.last().dpr}, backing ${phone.canvas.width}×${phone.canvas.height})`);
  check(phone.last().variant === 'mobile' && phone.last().stars === 320 && phone.last().budget === 600, `phone: mobile, 320 stars, budget 600`);
  phone.engine.destroy();
  const laptop = make({ w: 1440, h: 900, dpr: 3 });
  await settle();
  check(laptop.last().dpr === 2, `1440×900 at DPR 3 caps at 2 (${laptop.last().dpr})`);
  check(laptop.last().stars === 700 && laptop.last().budget === 1200, 'desktop: 700 stars, budget 1,200');
  laptop.engine.destroy();
  const big = make({ w: 2560, h: 1440, dpr: 2 });
  await settle();
  const want = Math.round(Math.sqrt(8e6 / (2560 * 1440)) * 100) / 100;
  check(big.last().dpr === want, `2560×1440 at DPR 2 caps at √(8M / area) = ${want} (${big.last().dpr})`);
  big.engine.destroy();
  setConnection({ saveData: true });
  const lite = make({ w: 1440, h: 900, dpr: 2 });
  await settle();
  check(lite.last().variant === 'lite' && lite.last().stars === 160, `Save-Data: lite, 160 stars (${lite.last().variant}, ${lite.last().stars})`);
  const clears = lite.ctx.clears;
  idle(120, 1000 / 60);
  check(lite.ctx.clears === clears, 'lite: no twinkle, nothing drawn while idle');
  lite.engine.destroy();
  setConnection({ effectiveType: '3g' });
  const slow = make();
  await settle();
  check(slow.last().variant === 'lite', '3G: lite');
  slow.engine.destroy();
  setConnection(undefined);
}

console.log('Drawing on change, the twinkle and the cache');
{
  const t = make();
  await settle();
  const c0 = t.ctx.clears;
  idle(240, 1000 / 120);
  const perSecond = (t.ctx.clears - c0) / 2;
  check(perSecond >= 28 && perSecond <= 30, `twinkle on a 120 Hz screen: ${perSecond} draws a second (at most 30)`);
  // A steady camera: after the cache is built, a twinkle frame is one blit plus the twinkling stars.
  const before = t.ctx.sprites;
  idle(4, 1000 / 30);
  const perFrame = (t.ctx.sprites - before) / 4;
  check(perFrame < 80, `cached twinkle frame: ${perFrame.toFixed(0)} sprites (1 blit + the 8% that twinkle), not ~700`);
  // Scroll: every frame draws, directly.
  const s0 = t.ctx.clears;
  await scroll(t, 30);
  check(t.ctx.clears - s0 >= 30, `scroll-driven: ${t.ctx.clears - s0} draws for 30 changed frames`);
  t.engine.destroy();
}

console.log('Pause, hidden tab, offscreen');
{
  const t = make();
  await settle();
  attrs.add('data-paused');
  mutation();
  await settle();
  const c0 = t.ctx.clears;
  idle(120, 1000 / 60);
  check(t.ctx.clears === c0, 'Pause: the twinkle stops (no draws while idle)');
  await scroll(t, 5);
  check(t.ctx.clears - c0 === 5, `Pause: scroll-driven frames still draw (${t.ctx.clears - c0} of 5)`);
  attrs.delete('data-paused');
  mutation();
  document.hidden = true;
  listeners.visibilitychange();
  const c1 = t.ctx.clears;
  idle(60, 1000 / 60);
  await scroll(t, 5);
  check(t.ctx.clears === c1, 'hidden tab: nothing draws, not even scroll-driven frames');
  document.hidden = false;
  listeners.visibilitychange();
  intersect([{ isIntersecting: false }]);
  const c2 = t.ctx.clears;
  idle(60, 1000 / 60);
  await scroll(t, 5);
  check(t.ctx.clears === c2, 'sentinel offscreen: nothing draws');
  intersect([{ isIntersecting: true }]);
  check(t.ctx.clears > c2, 'back in view: draws the current frame at once');
  t.engine.destroy();
}

console.log('Sprite budget');
{
  const t = make({ w: 375, h: 812, dpr: 3 });
  await settle();
  // Two thousand haloed story stars, all in view: far more than a phone may draw.
  const crowd = Array.from({ length: 1000 }, (_, i) => ({ world: [300 + (i % 40) * 2, 1, -500 - Math.floor(i / 40) * 2], size: 6, alpha: 1, halo: 1 }));
  const s0 = t.ctx.sprites;
  t.src.set(geoFrame({ stars: crowd }));
  await settle();
  const drawn = t.ctx.sprites - s0;
  check(drawn <= 600, `phone budget: ${drawn} sprites drawn for 320 stars + 2,000 story sprites (≤ 600)`);
  t.engine.destroy();
}

console.log('Motes, clusters and the budget');
{
  const t = make({ w: 375, h: 812, dpr: 3 });
  await settle();
  /** Sprites one changed frame draws (a moving camera, so nothing comes from the cache). */
  let nudge = 0;
  const drawn = async (u, geo) => {
    const s = u.ctx.sprites;
    u.src.set({ geo: { ...geo, camera: rig({ ...geo.rig, distance: geo.rig.distance * (1 + (nudge++ % 2) * 1e-4) }) } });
    await settle();
    return u.ctx.sprites - s;
  };
  // The descent's middle: high over the Visayas.
  const descent = { rig: { target: [404, 0, -640], distance: 300, pitch: 80, heading: 6, fov: 56 }, opacity: 1 };
  const without = await drawn(t, { ...descent, motes: 0 });
  const withMotes = await drawn(t, { ...descent, motes: 1 });
  check(withMotes > without, `motes add sprites while the camera travels (${without} without, ${withMotes} with)`);
  const crowd = Array.from({ length: 1000 }, (_, i) => ({ world: [400 + (i % 40) * 0.2, 1, -640 - Math.floor(i / 40) * 0.2], size: 6, alpha: 1, halo: 1 }));
  const full = await drawn(t, { ...descent, motes: 1, stars: crowd, clusters: { wave: 1, list: CLUSTERS.mobile } });
  check(full <= 600, `phone budget with motes, clusters and 2,000 story sprites: ${full} (≤ 600)`);
  t.engine.destroy();
  const d = make();
  await settle();
  const wide = { rig: { target: [318, 0, -560], distance: 830, pitch: 35, heading: -6, fov: 50 }, opacity: 1 };
  const plain = await drawn(d, wide);
  const clustered = await drawn(d, { ...wide, clusters: { wave: 1, list: CLUSTERS.desktop } });
  const stars = CLUSTERS.desktop.reduce((n, c) => n + c.stars.length, 0);
  check(clustered - plain >= stars, `Ch8: the 18 clusters come from the frame and draw (${clustered - plain} more sprites, ${stars} stars plus glows)`);
  d.engine.destroy();
}

console.log('The map plane and the canvas agree (matrix3d against project)');
{
  /** Where CSS puts element pixel (u, w) under a matrix3d string, with transform-origin 0 0. */
  const apply = (m, u, w) => {
    const v = m.slice(9, -1).split(',').map(Number);
    const X = v[0] * u + v[4] * w + v[12];
    const Y = v[1] * u + v[5] * w + v[13];
    const W = v[3] * u + v[7] * w + v[15];
    return [X / W, Y / W];
  };
  const box = { x: 284.1, y: 500.4, width: 275.9, height: 261.2, scale: 6 };
  const cameras = {
    'top-down, Visayas': rig({ target: [404, 0, -640], distance: 300, pitch: 88, heading: 0, fov: 56 }),
    'oblique, Cebu City': rig({ target: [417.6, 0.8, -651.4], distance: 15, pitch: 46, heading: 22, fov: 42 }),
    'Ch8 crane end': rig({ target: [318, 0, -560], distance: 830, pitch: 35, heading: -6, fov: 50, shift: [0.04, -0.02] }),
    'lens shift, hero': rig({ target: [296, 0, -520], distance: 1053, pitch: 88, heading: 0, fov: 56, shift: [0.2, 0] }),
  };
  const pt = { x: 0, y: 0, depth: 0 };
  for (const [name, cam] of Object.entries(cameras)) {
    const v = viewOf(cam, 1440, 900);
    const m = planeMatrix(v, box);
    let worst = 0;
    let tested = 0;
    for (const [mx, my] of [[417.583, 651.432], [340.37, 627.91], [482.366, 596.182], [300, 520], [550, 750]]) {
      project(v, mx, 0, -my, pt);
      if (!(pt.depth > 0)) continue;
      const [cx, cy] = apply(m, (mx - box.x) * box.scale, (my - box.y) * box.scale);
      worst = Math.max(worst, Math.hypot(cx - pt.x, cy - pt.y));
      tested++;
    }
    check(tested > 0 && worst < 0.01, `${name}: ${tested} map points land within ${worst.toExponential(1)} px of the canvas`);
  }
}

console.log('Camera keys: log zoom, the camera curve, and continuity');
{
  const a = { target: [296, 0, -520], distance: 1000, pitch: 88, heading: 0, fov: 56 };
  const b = { target: [417.6, 0, -651.4], distance: 10, pitch: 46, heading: 22, fov: 42 };
  const mid = mixRig(a, b, 0.5);
  check(Math.abs(mid.distance - 100) < 1e-9, `half way between 1,000 and 10 units is 100 (log zoom), not 505: ${mid.distance}`);
  check(Math.abs(easeCamera(0.5) - 0.5) < 1e-6 && easeCamera(0.25) < 0.25 && easeCamera(0.75) > 0.75, 'cubic-bezier(0.65, 0, 0.35, 1) is symmetric and eases in and out');
  // Scrubbing: tiny steps in p never jump the camera.
  const keys = [{ at: 0, rig: a }, { at: 0.5, rig: { ...b, distance: 60 } }, { at: 1, rig: b }];
  let jump = 0;
  let prev = rig(rigAt(keys, 0)).position;
  for (let i = 1; i <= 2000; i++) {
    const cur = rig(rigAt(keys, i / 2000)).position;
    jump = Math.max(jump, Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]));
    prev = cur;
  }
  check(jump < 3, `2,000 scrub steps across two keys: largest step ${jump.toFixed(2)} units (no jumps at the keys)`);
}

console.log('Auto-degrade: draw cost');
{
  spriteCost = 0.012; // about 8.5 ms for 700 stars: a slow device
  const t = make();
  await settle();
  await scroll(t, 10 + 45);
  check(t.last().level === 1 && t.last().stars === 350, `median over 6 ms → halved, twinkle off (level ${t.last().level}, ${t.last().stars} stars)`);
  await scroll(t, 60);
  check(t.last().level === 1 && !t.frozen(), `at half the stars it is fast enough: stays at level 1 (median ${t.last().medianMs.toFixed(1)} ms)`);
  t.engine.destroy();
  spriteCost = 0.03; // about 21 ms, then 10.5 ms at half: still too slow
  const u = make();
  await settle();
  await scroll(u, 2 * (10 + 45) + 5);
  check(u.frozen() && u.canvas.style.opacity === '0', `still over 6 ms after halving → frozen to the poster (onFreeze ${u.frozen()}, canvas opacity ${u.canvas.style.opacity})`);
  const c0 = u.ctx.clears;
  await scroll(u, 10);
  check(u.ctx.clears === c0, 'frozen: nothing draws');
  u.engine.destroy();
  spriteCost = 0.0004;
}

console.log('Auto-degrade: dropped frames, against the device’s own interval');
{
  const t = make();
  await settle();
  await scroll(t, 40, 1000 / 60); // learn the base interval
  for (let i = 0; i < 60; i++) {
    t.src.set(geoFrame());
    await settle();
    frame(i % 5 < 2 ? 50 : 1000 / 60); // 40% of motion frames three frames late
  }
  check(t.last().level === 1, `60 Hz device, 40% of motion frames at 3× the interval → degraded (level ${t.last().level}, slow ${(t.last().slowShare * 100).toFixed(0)}%)`);
  t.engine.destroy();
  const capped = make();
  await settle();
  await scroll(capped, 140, 1000 / 30); // a 30 Hz device (Low Power Mode): every frame is "slow" against 60 Hz, none against itself
  check(capped.last().level === 0, `30 Hz device, steady: base ${capped.last().baseMs} ms, ${(capped.last().slowShare * 100).toFixed(0)}% slow → no degrade`);
  capped.engine.destroy();
}

console.log('Deep space: the far field, the Milky Way, shooting stars');
{
  const { spacePixels } = await import(pathToFileURL(join(HERE, 'space-size.ts')).href);
  const phonePx = spacePixels(390, 844, 3);
  const deskPx = spacePixels(1440, 900, 2);
  check(phonePx < 1e6 && deskPx < 1.6e6 && spacePixels(390, 844, 3, true) === 0, `textures: ${(phonePx / 1e6).toFixed(2)} M device px on a phone, ${(deskPx / 1e6).toFixed(2)} M on desktop, none in lite (taken off the map's budget)`);

  // The same changed frame with and without deep space.
  let nudge = 0;
  const changed = async (u, extra) => {
    const s = u.ctx.sprites;
    u.src.set(geoFrame({ ...extra, motes: (nudge++ % 2) * 1e-3 }));
    await settle();
    return u.ctx.sprites - s;
  };
  const plain = make();
  await settle();
  const without = await changed(plain);
  plain.engine.destroy();

  const t = make({ space: true });
  await settle();
  const built = await t.engine.loadSpaceNow();
  idle(70, 1000 / 60); // the 900 ms fade-in
  check(built && t.last().space === 'on', `it builds at idle, in slices (space: ${t.last().space})`);
  const withSpace = await changed(t);
  check(withSpace > without + 4 && withSpace - without < 120, `a moving frame adds the panorama, two tile layers and the far twinklers: ${withSpace - without} sprites (${without} → ${withSpace})`);
  const before = t.ctx.sprites;
  idle(4, 1000 / 30);
  const perFrame = (t.ctx.sprites - before) / 4;
  // One blit, the cloud's 8% and the far twinklers in view (about 40 at the widest framing): still nowhere near ~800.
  check(perFrame < 120, `cached twinkle frame with deep space: ${perFrame.toFixed(0)} sprites (deep space rides in the cache; only its twinklers redraw)`);

  // Shooting stars: one every 8 to 12 s on a live sky, the first 5 to 10 s in.
  const seen = [];
  let last = t.last().meteors ?? 0;
  const run = (seconds, onFrame) => {
    for (let i = 0; i < seconds * 60; i++) {
      frame(1000 / 60);
      const n = t.last().meteors ?? 0;
      if (n !== last) {
        seen.push(frameTime);
        last = n;
        onFrame?.();
      }
    }
  };
  let fullRate = -1;
  const start = frameTime;
  run(62, () => {
    if (fullRate >= 0) return;
    const c0 = t.ctx.clears;
    idle(12, 1000 / 60);
    fullRate = t.ctx.clears - c0;
  });
  const gaps = seen.slice(1).map((x, i) => (x - seen[i]) / 1000);
  check(seen.length >= 4 && seen.length <= 8, `${seen.length} shooting stars in 62 s (first at ${((seen[0] - start) / 1000).toFixed(1)} s)`);
  check(gaps.every((g) => g >= 7.7 && g <= 12.4), `gaps ${gaps.map((g) => g.toFixed(1)).join(', ')} s (8 to 12, measured to the 250 ms stats tick)`);
  check(fullRate >= 10, `while one crosses, every frame draws: ${fullRate} of 12 display frames (the twinkle alone draws 6)`);

  const quiet = (label, seconds = 30) => {
    const n0 = t.last().meteors ?? 0;
    for (let i = 0; i < seconds * 60; i++) frame(1000 / 60);
    check((t.last().meteors ?? 0) === n0, `${label}: no shooting star in ${seconds} s`);
  };
  t.engine.setLive(false);
  quiet('no chapter showing the sky');
  t.engine.setLive(true);
  t.src.set(geoFrame({}));
  t.src.set({ ...geoFrame(), space: { meteors: false } });
  await settle();
  quiet('a frame that says no (Ch3 while Virgo forms)');
  t.src.set(geoFrame());
  await settle();
  attrs.add('data-paused');
  mutation();
  await settle();
  const c0 = t.ctx.clears;
  quiet('Pause');
  check(t.ctx.clears === c0, 'Pause: deep space draws nothing while idle either');
  attrs.delete('data-paused');
  mutation();
  document.hidden = true;
  listeners.visibilitychange();
  const c1 = t.ctx.clears;
  for (let i = 0; i < 30 * 60; i++) frame(1000 / 60);
  check(t.ctx.clears === c1, 'hidden tab: no shooting stars, nothing drawn');
  document.hidden = false;
  listeners.visibilitychange();
  t.engine.destroy();
  check(t.canvas.width === 0 && t.canvas.height === 0, 'destroy() gives the canvas back (0 × 0), with the cache, sprites and deep space');

  const phone = make({ w: 375, h: 812, dpr: 3, space: true });
  await settle();
  await phone.engine.loadSpaceNow();
  const crowd = Array.from({ length: 1000 }, (_, i) => ({ world: [300 + (i % 40) * 2, 1, -500 - Math.floor(i / 40) * 2], size: 6, alpha: 1, halo: 1, featured: 1 }));
  const s0 = phone.ctx.sprites;
  phone.src.set(geoFrame({ stars: crowd }));
  await settle();
  check(phone.ctx.sprites - s0 <= 600, `phone budget with deep space and 1,000 featured stars: ${phone.ctx.sprites - s0} sprites (≤ 600)`);
  phone.engine.destroy();

  setConnection({ saveData: true });
  const lite = make({ space: true });
  await settle();
  const liteBuilt = await lite.engine.loadSpaceNow();
  check(!liteBuilt && lite.last().space === 'off', `lite: no deep space (space: ${lite.last().space})`);
  lite.engine.destroy();
  setConnection(undefined);
}

if (failures.length) {
  console.error(`\ncheck-engine: ${failures.length} failure${failures.length === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('\ncheck-engine: ok');
