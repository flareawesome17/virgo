'use client';

import { useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { GLIDE, stableViewportHeight, steady, useMotionGate } from '../motion';
import { camera, clamp01, lerp, seg } from './ease';

/**
 * The cuts between chapters (05-cinema.md §1.5, §1.8): an overlay driven by
 * where a chapter's top edge is on screen, so the seam where one pinned scene
 * scrolls away and the next arrives is never seen.
 *
 * Every cut is a camera's own mechanism, never a symbol (owner, 2026-10-05:
 * no shapes on the shutters):
 * - `iris`: the lens's aperture. Curved metal blades turn shut, the barrel
 *   darkens round them, and as they open the frame fires with a flash of
 *   light through the opening.
 * - `curtain`: the focal-plane shutter. A slatted metal curtain rises over
 *   the old scene, with the scroll; the second curtain lifts off the new one
 *   from below (where it arrives), and it comes in exposed in a warm flash.
 * - `leak`: a film light leak. Warm, organic light washes over the seam with
 *   a rose fringe, a burned edge and an anamorphic streak.
 * - `warp`: into the sky. The frame falls into the dark of space and the
 *   stars stream past, faster at the seam, then slow as the next scene comes.
 *
 * `u` runs 0 → 1 as the incoming chapter's top travels from the bottom of the
 * screen to the top; the frame is fully covered around u = 0.5.
 *
 * Everything is drawn into one canvas the size of the screen, and only while
 * a cut is live. An earlier version used a full-screen element per blade and
 * per ring, each many times the screen's size; on an iPhone that was
 * gigabytes of layers, and iOS closed the tab mid-scroll.
 */

export type CutKind = 'iris' | 'curtain' | 'leak' | 'warp';
export type Cut = { into: string; kind: CutKind };

const BLADES = 7;
const SLATS = 6;

/** How closed the frame is: 0 open → 1 shut, held shut briefly around the seam. */
const shut = (u: number) => (u <= 0 || u >= 1 ? 0 : u < 0.5 ? camera(seg(u, 0.04, 0.44)) : 1 - camera(seg(u, 0.56, 0.96)));

/** A bell over [a, b], 1 at its middle. */
const bell = (u: number, a: number, b: number) => {
  const t = seg(u, a, b);
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
};

export function Cuts({ cuts }: { cuts: readonly Cut[] }) {
  const gate = useMotionGate();
  const { scrollY } = useScroll();
  // The same glide as the scenes, so the cut and the scene it hides move together.
  const y = useSpring(scrollY, GLIDE);
  const tops = useRef<number[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);

  const live = useTransform(y, (v) => {
    if (typeof window === 'undefined') return { i: -1, u: 0 };
    // Phones: the small viewport, which holds still while the address bar slides (motion.tsx).
    const h = steady() ? stableViewportHeight() : window.innerHeight;
    for (let i = 0; i < tops.current.length; i++) {
      const u = 1 - (tops.current[i] - v) / h;
      if (u > 0 && u < 1) return { i, u };
    }
    return { i: -1, u: 0 };
  });

  const draw = () => {
    const el = canvas.current;
    if (!el) return;
    const { i, u } = live.get();
    const cut = cuts[i];
    if (!cut) {
      if (el.style.visibility !== 'hidden') {
        el.style.visibility = 'hidden';
        el.getContext('2d')?.clearRect(0, 0, el.width, el.height);
      }
      return;
    }
    el.style.visibility = 'visible';
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    // Per axis: on a phone the backing store keeps its size while the address bar slides (see measure).
    ctx.setTransform(el.width / w || 1, 0, 0, el.height / h || 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (cut.kind === 'iris') drawIris(ctx, w, h, u);
    else if (cut.kind === 'curtain') drawCurtain(ctx, w, h, u);
    else if (cut.kind === 'warp') drawWarp(ctx, w, h, u);
    else drawLeak(ctx, w, h, u);
  };

  useMotionValueEvent(live, 'change', draw);

  useEffect(() => {
    if (!gate.motion) return;
    const measure = () => {
      tops.current = cuts.map((c) => {
        const el = document.getElementById(c.into);
        return el ? el.getBoundingClientRect().top + window.scrollY : Infinity;
      });
      const el = canvas.current;
      if (el) {
        // Two device pixels per CSS pixel at most: the cuts are soft shapes, and every pixel is memory.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(window.innerWidth * dpr);
        const height = Math.round(window.innerHeight * dpr);
        // Phones: the address bar sliding changes only the height, a little. Reallocating the canvas
        // for it (which also clears it) mid-cut flickers, so it keeps its store and stretches to fit.
        const toolbar = steady() && width === el.width && Math.abs(height - el.height) < el.height * 0.2;
        if (!toolbar) {
          el.width = width;
          el.height = height;
        }
      }
      draw();
    };
    measure();
    // The body has a fixed height, so watch the story wrapper, which grows with its chapters.
    const ro = new ResizeObserver(measure);
    ro.observe(document.querySelector('.story-page') ?? document.documentElement);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // `draw` reads only refs and motion values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.motion, cuts]);

  if (!gate.motion) return null;
  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[44] h-full w-full" style={{ visibility: 'hidden' }} />;
}

/** Light pouring through an opening: a warm bloom, and the lens's horizontal streak through it. */
function flash(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, k: number) {
  if (k <= 0) return;
  const diag = Math.hypot(w, h);
  const r = diag * (0.12 + 0.4 * k);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255,244,226,${0.85 * k})`);
  g.addColorStop(0.25, `rgba(255,226,186,${0.45 * k})`);
  g.addColorStop(1, 'rgba(240,200,142,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // The anamorphic streak: a long, thin ellipse of light.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.018);
  const s = w * 0.7;
  const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, s);
  streak.addColorStop(0, `rgba(255,236,206,${0.75 * k})`);
  streak.addColorStop(0.5, `rgba(240,200,142,${0.25 * k})`);
  streak.addColorStop(1, 'rgba(240,200,142,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.restore();
}

/**
 * The aperture: BLADES curved blades whose inner edges make a rounded
 * opening of apothem `d`. Each blade runs from its inner edge outward between
 * the extensions of its neighbours' edges, so the blades tile the frame like
 * a real iris, and at d = 0 they meet at the centre. Each edge bows outward
 * through the polygon's circumradius, as a real diaphragm's do, so the
 * opening reads round, not polygonal.
 */
function drawIris(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const s = shut(u);
  const cx = w / 2;
  const cy = h / 2;
  const diag = Math.hypot(w, h);
  if (s > 0) {
    const d = diag * 0.56 * (1 - s);
    // The barrel: the edges fall off into shadow as the aperture closes, so the frame reads as looking down a lens.
    const v = ctx.createRadialGradient(cx, cy, d * 0.85, cx, cy, Math.max(d * 0.85 + 1, diag * 0.62));
    v.addColorStop(0, 'rgba(6,5,4,0)');
    v.addColorStop(1, `rgba(6,5,4,${Math.min(0.9, s * 1.8)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);

    const twist = (lerp(-42, 42, clamp01(u)) * Math.PI) / 180;
    const R = d / Math.cos(Math.PI / BLADES);
    const step = (Math.PI * 2) / BLADES;
    const V = Array.from({ length: BLADES }, (_, k) => {
      const a = twist + k * step + step / 2;
      return [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
    });
    // Each inner edge's direction: tangent to the polygon, the same whatever its size (so it holds at d = 0).
    const E = V.map((_, k) => {
      const a = twist + (k + 1) * step + Math.PI / 2;
      return [Math.cos(a), Math.sin(a)] as const;
    });
    const L = diag * 2;
    // The light sweeps across the metal as the blades turn.
    const sheenAt = clamp01(0.5 + Math.sin(twist * 2.2) * 0.35);
    const edges: { a: readonly [number, number]; b: readonly [number, number]; c: readonly [number, number] }[] = [];
    for (let k = 0; k < BLADES; k++) {
      const a = V[k];
      const b = V[(k + 1) % BLADES];
      const eIn = E[(k - 1 + BLADES) % BLADES];
      const eOut = E[k];
      const out = twist + (k + 1) * step;
      // The control point that bows the edge out through the circumradius: (2R − d) along the edge's normal.
      const c = [cx + (2 * R - d) * Math.cos(out), cy + (2 * R - d) * Math.sin(out)] as const;
      edges.push({ a, b, c });
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      ctx.lineTo(b[0] + eOut[0] * L, b[1] + eOut[1] * L);
      ctx.lineTo(a[0] + eIn[0] * L, a[1] + eIn[1] * L);
      ctx.closePath();
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const nx = Math.cos(out);
      const ny = Math.sin(out);
      // Brushed dark metal: lit at the edge, falling into the barrel's shadow.
      const g = ctx.createLinearGradient(mx, my, mx + nx * diag * 0.55, my + ny * diag * 0.55);
      g.addColorStop(0, k % 2 ? '#3A2D24' : '#33281F');
      g.addColorStop(0.18, k % 2 ? '#1C1612' : '#18130F');
      g.addColorStop(1, '#0A0807');
      ctx.fillStyle = g;
      ctx.fill();
      // A band of sheen across the blade, its place set by the turn.
      ctx.save();
      ctx.clip();
      const tx = -ny;
      const ty = nx;
      const sheen = ctx.createLinearGradient(mx - tx * diag * 0.5, my - ty * diag * 0.5, mx + tx * diag * 0.5, my + ty * diag * 0.5);
      sheen.addColorStop(clamp01(sheenAt - 0.12), 'rgba(240,200,142,0)');
      sheen.addColorStop(sheenAt, `rgba(240,200,142,${(0.1 + 0.06 * (k % 3)) * s})`);
      sheen.addColorStop(clamp01(sheenAt + 0.12), 'rgba(240,200,142,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // Where each blade overlaps the next: a soft shadow along its side.
    ctx.lineCap = 'round';
    for (let k = 0; k < BLADES; k++) {
      const b = V[(k + 1) % BLADES];
      const eOut = E[k];
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] + eOut[0] * L, b[1] + eOut[1] * L);
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // The blades' leading edges catch the light: a hot line over a soft glow.
    for (const { a, b, c } of edges) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      ctx.strokeStyle = 'rgba(240,200,142,0.14)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(246,214,170,0.75)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }
  // The shutter fires: as the blades part, light floods through the opening.
  flash(ctx, cx, cy, w, h, bell(u, 0.46, 0.7));
}

/**
 * The focal-plane shutter: a curtain of SLATS metal slats, travelling up the
 * frame as the page does. Closing, it rises from the foot over the seam, its
 * slats fanning out as it travels; opening, the second curtain lifts away
 * and folds at the head, uncovering the new scene from below, where it is
 * arriving. The leading edge carries a highlight and a smear of motion; the
 * new scene comes in a warm exposure.
 */
function drawCurtain(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const closing = u < 0.5;
  const t = closing ? camera(seg(u, 0.04, 0.44)) : camera(seg(u, 0.56, 0.96));
  const top = closing ? (1 - t) * h : 0;
  const bottom = closing ? h : (1 - t) * h;
  const span = bottom - top;
  // The new scene arrives exposed: a warm flash below the lifting curtain.
  if (!closing && bottom < h) {
    const k = 1 - seg(u, 0.54, 0.74);
    if (k > 0) {
      ctx.fillStyle = `rgba(255,236,206,${0.32 * k})`;
      ctx.fillRect(0, bottom, w, h - bottom);
    }
  }
  if (span <= 0.5) return;
  const sh = span / SLATS;
  for (let i = 0; i < SLATS; i++) {
    const y0 = top + i * sh;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + sh);
    g.addColorStop(0, '#2E251F');
    g.addColorStop(0.12, '#1D1713');
    g.addColorStop(0.7, '#120E0C');
    g.addColorStop(1, '#0A0807');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, w, sh + 0.5);
    // The slat's lit lip and the dark seam under it.
    ctx.fillStyle = 'rgba(240,200,142,0.16)';
    ctx.fillRect(0, y0, w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, y0 + sh - 1, w, 1);
  }
  // A long, slow sheen across the metal.
  const sx = w * lerp(-0.2, 1.2, u);
  const sheen = ctx.createLinearGradient(sx - w * 0.25, 0, sx + w * 0.25, 0);
  sheen.addColorStop(0, 'rgba(240,200,142,0)');
  sheen.addColorStop(0.5, 'rgba(240,200,142,0.07)');
  sheen.addColorStop(1, 'rgba(240,200,142,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, top, w, span);
  // The leading edge: a hot line, and the smear of its travel, longer when it moves fast.
  const edge = closing ? top : bottom;
  const speed = closing ? bell(u, 0.04, 0.44) : bell(u, 0.56, 0.96);
  if (edge > 0 && edge < h) {
    // Out of the curtain, into the open frame.
    const dir = closing ? -1 : 1;
    const smear = 10 + 70 * speed;
    const sm = ctx.createLinearGradient(0, edge, 0, edge + dir * smear);
    sm.addColorStop(0, 'rgba(10,8,7,0.55)');
    sm.addColorStop(1, 'rgba(10,8,7,0)');
    ctx.fillStyle = sm;
    ctx.fillRect(0, Math.min(edge, edge + dir * smear), w, smear);
    ctx.fillStyle = 'rgba(246,214,170,0.8)';
    ctx.fillRect(0, edge - (closing ? 0 : 1.5), w, 1.5);
    const glow = ctx.createLinearGradient(0, edge, 0, edge + dir * 18);
    glow.addColorStop(0, `rgba(240,200,142,${0.25 + 0.2 * speed})`);
    glow.addColorStop(1, 'rgba(240,200,142,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, Math.min(edge, edge + dir * 18), w, 18);
  }
}

/** The leak: warm, organic light washing over the seam, with a rose fringe, a burned edge and a streak. */
function drawLeak(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const a = shut(u);
  if (a <= 0) return;
  // The wash: enough to hide the seam at its height.
  const cx = w * (0.4 + lerp(-0.25, 0.25, u));
  const cy = h * 0.5;
  ctx.save();
  ctx.globalAlpha = a * 0.97;
  ctx.translate(cx, cy);
  ctx.scale(1, (0.8 * h) / (0.6 * w));
  const r = 0.6 * w * 1.4;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgb(255,236,206)');
  g.addColorStop(0.35, 'rgba(240,200,142,0.95)');
  g.addColorStop(0.65, 'rgba(209,138,90,0.88)');
  g.addColorStop(1, 'rgba(122,62,30,0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(-w * 2, -h * 4, w * 4, h * 8);
  ctx.restore();
  // The light itself, added on: a hot core drifting right, a rose fringe drifting left, the burn at the film's edge.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const blob = (x: number, y: number, rr: number, rgb: string, k: number) => {
    const b = ctx.createRadialGradient(x, y, 0, x, y, rr);
    b.addColorStop(0, `rgba(${rgb},${k})`);
    b.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = b;
    ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  };
  blob(w * lerp(0.15, 0.85, u), h * 0.42, Math.max(w, h) * 0.45, '255,226,180', 0.24 * a);
  blob(w * lerp(0.95, 0.35, u), h * 0.22, Math.max(w, h) * 0.4, '214,92,64', 0.22 * a);
  blob(0, h, Math.max(w, h) * 0.7, '196,84,34', 0.3 * a);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  flash(ctx, w * lerp(0.35, 0.65, u), h * 0.5, w, h, 0.32 * bell(u, 0.3, 0.7));
  ctx.restore();
}

/** The star field for the warp, seeded once: angle, depth, speed, brightness and tint per streak. */
const WARP = (() => {
  let a = 0x5eed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 150 }, () => ({ ang: rnd() * Math.PI * 2, q0: rnd(), sp: 0.6 + rnd() * 0.8, b: 0.35 + rnd() * 0.65, warm: rnd() < 0.45 }));
})();

/** Into the sky: the frame falls into the dark of space while the stars stream past, fastest at the seam. */
function drawWarp(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const s = shut(u);
  const v = bell(u, 0.06, 0.94);
  if (s <= 0 && v <= 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const diag = Math.hypot(w, h);
  // The dark of space, with a faint violet depth at its heart.
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * 0.6);
  bg.addColorStop(0, `rgba(24,18,30,${s})`);
  bg.addColorStop(1, `rgba(6,5,8,${s})`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (v <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const count = w < 768 ? 90 : WARP.length;
  for (let i = 0; i < count; i++) {
    const st = WARP[i];
    // Depth runs 0 (far, at the centre) → 1 (past the camera), wrapping; it accelerates outward, as perspective does.
    const q = (st.q0 + u * 2.4 * st.sp) % 1;
    const r = q * q * diag * 0.62;
    const len = v * (0.01 + 0.3 * q * q) * diag * st.sp;
    const alpha = st.b * v * clamp01(q / 0.12) * (1 - clamp01((q - 0.85) / 0.15));
    if (alpha <= 0.01) continue;
    const dx = Math.cos(st.ang);
    const dy = Math.sin(st.ang);
    ctx.beginPath();
    ctx.moveTo(cx + dx * r, cy + dy * r);
    ctx.lineTo(cx + dx * (r + len), cy + dy * (r + len));
    ctx.strokeStyle = st.warm ? `rgba(240,200,142,${alpha})` : `rgba(226,232,255,${alpha})`;
    ctx.lineWidth = 0.6 + 1.8 * q;
    ctx.stroke();
  }
  ctx.restore();
  // The destination's light at the centre, brightest at the seam.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, diag * 0.18);
  g.addColorStop(0, `rgba(255,236,206,${0.35 * v})`);
  g.addColorStop(1, 'rgba(255,236,206,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - diag * 0.18, cy - diag * 0.18, diag * 0.36, diag * 0.36);
}
