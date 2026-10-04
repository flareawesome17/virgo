/**
 * B5: the map under the sky. Static SVG detail levels, each an `<img>` in a
 * wrapper whose `matrix3d` the sky engine writes from the camera, so the
 * plane y = 0 lands on exactly the canvas's pixels (storyboard §1.3, §1.13).
 * Levels crossfade by opacity: a level shows while its simplification
 * tolerance stays at or under about 2 px on screen, and a crop only once it
 * covers the whole view.
 *
 * Server-renderable markup, no hooks: put it in SkyCanvas's `map` slot. The
 * group's opacity (the coastline at 14% in Ch8) is the frame's `geo.map`.
 *
 * Over the levels, inside the group, sits a haze: a night-coloured gradient
 * whose top edge the engine pins to the camera's horizon (translate only).
 * In an oblique view the far land fades into the dark the way distance does
 * at night, and the crops' far edges never draw a line; looking straight
 * down, the horizon is far off screen and the haze with it.
 */

/** One detail level: a crop of the story map's viewBox, as a static SVG. */
export type MapLayerLevel = {
  readonly id: string;
  /** Hashed URL of the level's SVG. */
  readonly src: string;
  /** The crop, in viewBox units (x east, y down). */
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Simplification tolerance, km: decides when the level is fine enough. */
  readonly toleranceKm: number;
  /**
   * CSS px per viewBox unit the image is laid out at. The browser rasterises
   * it at this size, so pick about the largest on-screen scale the level
   * serves; it is only ever scaled down from there, never blurred up.
   */
  readonly scale: number;
};

/**
 * Device pixels one level may rasterize to. A level is laid out at the largest
 * scale it is ever shown at, which on a 3× phone came to 2,900 × 2,900 CSS px
 * for the radar: about 300 MB of layer, several levels crossfading at once,
 * and iOS closed the tab. Past the budget a level is laid out smaller (its
 * `data-scale` with it, so the engine still places it to the pixel); phones,
 * which show the map smaller anyway, lose nothing they can see.
 */
function budget(): number {
  if (typeof window === 'undefined') return Infinity;
  return window.innerWidth < 1024 ? 6e6 : 16e6;
}

export function MapLayer({ levels, className = '' }: { levels: readonly MapLayerLevel[]; className?: string }) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const max = budget();
  return (
    <div data-sky-map="" className={`absolute inset-0 ${className}`} style={{ opacity: 0 }}>
      {levels.map((l) => {
        // Fractional CSS sizes, so one scale holds on both axes.
        const device = l.box.width * l.box.height * l.scale * l.scale * dpr * dpr;
        const scale = device > max ? l.scale * Math.sqrt(max / device) : l.scale;
        const width = l.box.width * scale;
        const height = l.box.height * scale;
        return (
          <div
            key={l.id}
            data-sky-map-level={l.id}
            data-box={`${l.box.x} ${l.box.y} ${l.box.width} ${l.box.height}`}
            data-scale={scale}
            data-tolerance={l.toleranceKm}
            className="absolute top-0 left-0 origin-top-left"
            style={{ width, height, opacity: 0, visibility: 'hidden', willChange: 'transform, opacity' }}
          >
            {/* A plain img: next/image would re-encode the SVG and wrap it, and the
                engine needs one static element whose CSS size is the layout scale. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.src} alt="" width={Math.round(width)} height={Math.round(height)} decoding="async" draggable={false} className="block h-full w-full select-none" />
          </div>
        );
      })}
      <div
        data-sky-haze=""
        className="absolute inset-x-0 top-0 h-full"
        style={{
          transform: 'translate3d(0px, -200%, 0px)',
          background: 'linear-gradient(to bottom, rgba(14,12,11,0.96) 0%, rgba(14,12,11,0.7) 18%, rgba(14,12,11,0.3) 42%, rgba(14,12,11,0.08) 68%, rgba(14,12,11,0) 100%)',
          willChange: 'transform',
        }}
      />
    </div>
  );
}
