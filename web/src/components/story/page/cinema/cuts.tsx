'use client';

import { useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { GLIDE, useMotionGate } from '../motion';
import { camera, clamp01, lerp, seg } from './ease';
import { morphPath, type MorphShape } from './morph';

/**
 * The cuts between chapters (05-cinema.md §1.5, §1.8): an overlay driven by
 * where a chapter's top edge is on screen, so the seam where one pinned scene
 * scrolls away and the next arrives is never seen.
 *
 * - `iris`: the camera's aperture closes on the old scene, turning, and opens
 *   on the new one.
 * - `tunnel`: a zoom through rings of aperture hexagons into the next scene.
 * - `leak`: a warm light leak washes over the seam.
 *
 * Through every cut a gold glyph morphs from the old scene's symbol into the
 * new one's (Mika's star → the group chat, the job → a map pin, …): the thread
 * of the story, carried across the seam.
 *
 * `u` runs 0 → 1 as the incoming chapter's top travels from the bottom of the
 * screen to the top; the frame is fully covered around u = 0.5.
 *
 * Everything is drawn into one canvas the size of the screen, and only while
 * a cut is live. An earlier version used a full-screen element per blade and
 * per ring, each many times the screen's size; on an iPhone that was
 * gigabytes of layers, and iOS closed the tab mid-scroll.
 */

export type CutKind = 'iris' | 'tunnel' | 'leak';
export type Cut = { into: string; kind: CutKind; from: MorphShape; to: MorphShape };

const BLADES = 7;
const RINGS = 7;

/** How closed the frame is: 0 open → 1 shut, held shut briefly around the seam. */
const shut = (u: number) => (u <= 0 || u >= 1 ? 0 : u < 0.5 ? camera(seg(u, 0.04, 0.44)) : 1 - camera(seg(u, 0.56, 0.96)));

export function Cuts({ cuts }: { cuts: readonly Cut[] }) {
  const gate = useMotionGate();
  const { scrollY } = useScroll();
  // The same glide as the scenes, so the cut and the scene it hides move together.
  const y = useSpring(scrollY, GLIDE);
  const tops = useRef<number[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);

  const live = useTransform(y, (v) => {
    if (typeof window === 'undefined') return { i: -1, u: 0 };
    const h = window.innerHeight;
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
    const dpr = el.width / el.clientWidth || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (cut.kind === 'iris') drawIris(ctx, w, h, u);
    else if (cut.kind === 'tunnel') drawTunnel(ctx, w, h, u);
    else drawLeak(ctx, w, h, u);
    drawGlyph(ctx, w, h, u, cut);
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
        el.width = Math.round(window.innerWidth * dpr);
        el.height = Math.round(window.innerHeight * dpr);
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

/**
 * The aperture: BLADES blades whose inner edges make a regular polygon of
 * apothem `d`. Each blade runs from its inner edge outward between the
 * extensions of its neighbours' edges, so the blades tile the frame like a
 * real iris, and at d = 0 they meet at the centre.
 */
function drawIris(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const s = shut(u);
  if (s <= 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const diag = Math.hypot(w, h);
  const d = diag * 0.56 * (1 - s);
  const twist = (lerp(-38, 38, clamp01(u)) * Math.PI) / 180;
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
  for (let k = 0; k < BLADES; k++) {
    const a = V[k];
    const b = V[(k + 1) % BLADES];
    const eIn = E[(k - 1 + BLADES) % BLADES];
    const eOut = E[k];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(b[0] + eOut[0] * L, b[1] + eOut[1] * L);
    ctx.lineTo(a[0] + eIn[0] * L, a[1] + eIn[1] * L);
    ctx.closePath();
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const out = twist + (k + 1) * step;
    const g = ctx.createLinearGradient(mx, my, mx + Math.cos(out) * diag * 0.6, my + Math.sin(out) * diag * 0.6);
    g.addColorStop(0, k % 2 ? '#2A211B' : '#251D18');
    g.addColorStop(0.25, k % 2 ? '#151210' : '#100D0B');
    g.addColorStop(1, '#0B0908');
    ctx.fillStyle = g;
    ctx.fill();
    // The blade's leading edge, catching the light; its side, in shadow.
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = 'rgba(209,138,90,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] + eOut[0] * L, b[1] + eOut[1] * L);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // The warm glint at the instant the aperture meets.
  const glint = clamp01(1 - Math.abs(u - 0.5) / 0.08);
  if (glint > 0) {
    const r = 80 * (0.6 + glint * 0.8);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,231,194,${0.9 * glint})`);
    g.addColorStop(0.4, `rgba(240,200,142,${0.35 * glint})`);
    g.addColorStop(1, 'rgba(240,200,142,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

function hexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = rot + (k * Math.PI) / 3 - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** The tunnel: a dark hexagon portal grows to swallow the frame while gold hexagon rings rush past. */
function drawTunnel(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const cx = w / 2;
  const cy = h / 2;
  const vmax = Math.max(w, h);
  const vmin = Math.min(w, h);
  const grow = u < 0.5 ? lerp(0.02, 3.2, camera(seg(u, 0.08, 0.48))) : 3.2;
  const alpha = u < 0.5 ? 1 : 1 - camera(seg(u, 0.52, 0.9));
  if (alpha > 0) {
    const r = 0.35 * vmax * grow;
    hexagon(ctx, cx, cy, r, (u * 30 * Math.PI) / 180);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(11,9,8,${alpha})`);
    g.addColorStop(0.6, `rgba(11,9,8,${alpha})`);
    g.addColorStop(1, `rgba(22,19,17,${alpha})`);
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.lineWidth = 1.2;
  for (let i = 0; i < RINGS; i++) {
    const k = clamp01(u * 1.25 - i / RINGS / 1.6);
    if (k <= 0 || k >= 1) continue;
    const r = 0.2 * vmin * 0.03 * Math.pow(120, k);
    ctx.strokeStyle = `rgba(240,200,142,${Math.min(1, k * 5) * (1 - k) * 0.9})`;
    hexagon(ctx, cx, cy, r, ((i * 9 + u * 40) * Math.PI) / 180);
    ctx.stroke();
  }
}

/** The leak: a warm wash of light across the frame, drifting left to right. */
function drawLeak(ctx: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const a = shut(u) * 0.97;
  if (a <= 0) return;
  const cx = w * (0.4 + lerp(-0.25, 0.25, u));
  const cy = h * 0.5;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy);
  ctx.scale(1, (0.8 * h) / (0.6 * w));
  const r = 0.6 * w * 1.4;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgb(255,236,206)');
  g.addColorStop(0.35, 'rgba(240,200,142,0.95)');
  g.addColorStop(0.65, 'rgba(209,138,90,0.85)');
  g.addColorStop(1, 'rgba(122,62,30,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(-w * 2, -h * 4, w * 4, h * 8);
  ctx.restore();
}

/** The thread: the old scene's symbol morphs into the new one's at the centre of the cut. */
function drawGlyph(ctx: CanvasRenderingContext2D, w: number, h: number, u: number, cut: Cut) {
  const a = clamp01(seg(u, 0.16, 0.32) * (1 - seg(u, 0.7, 0.86)));
  if (a <= 0) return;
  const size = Math.max(64, Math.min(w, h) * 0.16);
  const path = new Path2D(morphPath(cut.from, cut.to, camera(seg(u, 0.3, 0.66))));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(w / 2, h / 2);
  ctx.rotate((lerp(-12, 12, u) * Math.PI) / 180);
  const s = (size / 200) * lerp(0.7, 1.15, u);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(240,200,142,0.45)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = cut.kind === 'leak' ? '#7A3E1E' : '#F0C88E';
  ctx.fill(path);
  ctx.restore();
}
