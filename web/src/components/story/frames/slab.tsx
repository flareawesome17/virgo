import type { ReactNode } from 'react';

/**
 * A slab: a phone, a card or a window given thickness, so it reads as an
 * object in a 3D scene rather than a picture of one (storyboard §1.13).
 *
 *   slab                 the box the layout sees; flat, never transformed
 *   ├─ slab-shadow       contact shadow: radial gradients, never a blur
 *   └─ slab-body         the one preserve-3d level; Phase 4 writes its transform
 *      ├─ slab-edge      a back plate one `depth` behind the face; the sliver of
 *      │                 it a turn reveals is the slab's edge
 *      └─ slab-face      the mock, flat at z = 0
 *         ├─ {children}
 *         ├─ slab-sheen-a  highlight, upper left
 *         └─ slab-sheen-b  highlight, lower right
 *
 * Why a back plate rather than four side walls: side walls are rectangles,
 * and every slab here has rounded corners, so the walls leave notches at
 * each corner. A plate of the same shape has the same corners. It is scaled
 * by (p + depth) / p, so at rest perspective shrinks it to exactly the face's
 * outline and it hides; any turn slides it out on the far side by about
 * depth × sin(angle). One extra layer per slab, not a stack.
 *
 * Perspective: each slab carries its own, from the same tokens as
 * `Perspective` (900 px, 1200 px from md), centred on itself. CSS
 * perspective reaches only an element's direct children, so a slab that
 * relied on an ancestor's would go flat inside the first wrapper Phase 4
 * puts round it. Use `Perspective` for scenes whose direct children share
 * one eye (a fan of cards in depth); a lone slab needs nothing around it.
 *
 * Motion contract (Phase 4):
 * - Turn the slab by writing `transform` on `[data-part=slab-body]` only:
 *   `rotateX() rotateY() translateZ()`, within MAX_TILT. Compositor-only.
 * - Crossfade the sheens with opacity as it turns (`sheenOpacity` gives the
 *   rest values). Never animate the gradients themselves.
 * - The shadow may scale and fade (transform/opacity) as the slab lifts.
 * - Do not add preserve-3d anywhere inside the face: this is the only level.
 *
 * Server-rendered, no hooks; the rest pose is fully drawn without JS.
 */

export type SlabEdge = 'device' | 'card' | 'paper';

const EDGE: Record<SlabEdge, string> = {
  // Anodised dark metal: the sliver a turn reveals catches a little light at
  // the top and falls off below.
  device: 'linear-gradient(170deg, #4a413b 0%, #241e1b 30%, #110e0d 100%)',
  // A card's cut edge: the card colour, darker.
  card: 'linear-gradient(170deg, #3a322d 0%, #221d1a 40%, #141110 100%)',
  // The client page's paper, seen from the side.
  paper: 'linear-gradient(170deg, #efe4d6 0%, #d6c5b1 45%, #b9a48f 100%)',
};

export type SlabShadow = 'floor' | 'drop' | false;

/** Opacity of the two sheen layers for a turn of `rotateY` degrees. */
export function sheenOpacity(rotateY: number): { a: number; b: number } {
  const t = Math.max(-1, Math.min(1, rotateY / 18));
  // Turned left (negative), the light falls on the upper left; turned right,
  // the lower right. Both at half when square on.
  const a = Math.round((0.5 - t * 0.5) * 100) / 100;
  return { a, b: Math.round((1 - a) * 100) / 100 };
}

/** The shadow's rest scale and opacity for a lift of `translateZ` px. */
export function shadowPose(translateZ: number): { scale: number; opacity: number } {
  const lift = Math.max(0, translateZ);
  return {
    scale: Math.round((1 + lift / 600) * 1000) / 1000,
    opacity: Math.round(Math.max(0.35, 1 - lift / 300) * 100) / 100,
  };
}

const SHADOW: Record<Exclude<SlabShadow, false>, { className: string; background: string }> = {
  // Under something standing up: a tight dark core where it meets the
  // ground, and a wide soft falloff.
  floor: {
    className: 'inset-x-[4%] -bottom-[5%] h-[10%]',
    background:
      'radial-gradient(closest-side, rgba(0,0,0,0.62), rgba(0,0,0,0.3) 45%, rgba(0,0,0,0) 100%), radial-gradient(50% 40% at 50% 45%, rgba(0,0,0,0.5), rgba(0,0,0,0) 100%)',
  },
  // Under something floating: the whole outline, offset down and spread.
  drop: {
    className: '-inset-x-[6%] top-[6%] -bottom-[10%]',
    background:
      'radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0.32) 55%, rgba(0,0,0,0) 100%)',
  },
};

export function Slab({
  children,
  rotateX = 0,
  rotateY = 0,
  translateZ = 0,
  depth = 12,
  radius = 'rounded-2xl',
  edge = 'card',
  sheen = true,
  shadow = 'drop',
  className = '',
}: {
  children: ReactNode;
  /** Rest pose, degrees. Positive tips the top away. Keep within MAX_TILT. */
  rotateX?: number;
  /** Rest pose, degrees. Positive turns the right side away. */
  rotateY?: number;
  /** Rest lift toward the viewer, px. */
  translateZ?: number;
  /** Thickness, px. A phone at 320 px wide reads right at 12–16. */
  depth?: number;
  /** Tailwind radius classes, shared by the face and the edge (e.g. PHONE_RADIUS). */
  radius?: string;
  edge?: SlabEdge;
  sheen?: boolean;
  shadow?: SlabShadow;
  /**
   * Layout classes for the outer box. Size the slab here and let the child
   * fill it (`PhoneFrame width="100%"`): the edge plate takes the slab's box,
   * so a child narrower than the slab leaves the plate showing beside it.
   */
  className?: string;
}) {
  const s = sheenOpacity(rotateY);
  const sp = shadowPose(translateZ);
  const shade = shadow ? SHADOW[shadow] : null;

  return (
    <div
      data-part="slab"
      className={`relative [--story-p:900] [perspective:calc(var(--story-p)*1px)] md:[--story-p:1200] ${className}`}
    >
      {shade && (
        <div
          aria-hidden
          data-part="slab-shadow"
          className={`pointer-events-none absolute ${shade.className}`}
          style={{
            background: shade.background,
            opacity: sp.opacity,
            transform: sp.scale === 1 ? undefined : `scale(${sp.scale})`,
          }}
        />
      )}
      <div
        data-part="slab-body"
        className="relative [transform-style:preserve-3d]"
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(${translateZ}px)`,
        }}
      >
        <div
          aria-hidden
          data-part="slab-edge"
          className={`absolute inset-0 ${radius}`}
          style={{
            background: EDGE[edge],
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            transform: `translateZ(-${depth}px) scale(calc((var(--story-p, 1200) + ${depth}) / var(--story-p, 1200)))`,
          }}
        />
        <div
          data-part="slab-face"
          className={`relative overflow-hidden ${radius}`}
          // A hairline of light along the top edge, as on any lit object.
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}
        >
          {children}
          {sheen && (
            <>
              <div
                aria-hidden
                data-part="slab-sheen-a"
                className="pointer-events-none absolute inset-0 z-30"
                style={{
                  opacity: s.a,
                  background:
                    'linear-gradient(118deg, rgba(255,255,255,0) 6%, rgba(255,255,255,0.075) 19%, rgba(255,255,255,0.02) 29%, rgba(255,255,255,0) 38%)',
                }}
              />
              <div
                aria-hidden
                data-part="slab-sheen-b"
                className="pointer-events-none absolute inset-0 z-30"
                style={{
                  opacity: s.b,
                  background:
                    'linear-gradient(118deg, rgba(255,255,255,0) 58%, rgba(255,255,255,0.065) 71%, rgba(255,255,255,0.015) 80%, rgba(255,255,255,0) 90%)',
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
