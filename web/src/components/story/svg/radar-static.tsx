import { RADII, within } from '../data/story';
import { project, rig, view, type Projected } from '../sky/camera';

/** The radar's plane, seen from this camera: the same perspective the canvas uses, frozen. */
const W = 400;
const H = 300;
const STAND = 9;

function scene(radiusKm: number, tilt: number) {
  // The outer ring is 1 world unit; the camera sits back far enough to frame it with margin.
  const v = view(rig({ target: [0, 0, 0], distance: 3.1, pitch: tilt, heading: 0, fov: 38 }), W, H);
  const p: Projected = { x: 0, y: 0, depth: 0 };
  const at = (km: number, bearing: number, lift = 0) => {
    const b = (bearing * Math.PI) / 180;
    const r = km / radiusKm;
    project(v, Math.sin(b) * r, lift, Math.cos(b) * r, p);
    return { x: p.x, y: p.y };
  };
  return { at, unit: v.focal / v.range };
}

const n1 = (x: number) => x.toFixed(1);

/**
 * B6: Nearby's distance rings, still (Ch2's reduced-motion figure and the
 * "Try the distance" demo). The rings lie on the map plane seen at an angle,
 * like a ripple on water; each person in the illustrative roster stands
 * above the plane at their distance on a short stem, Mika's job at the
 * centre. One path draws every ring, one path every stem.
 *
 * `radiusKm` is the selected Nearby radius (5, 25, 50, 100 or 200) and sets
 * the scale; the rings are the app's radii up to it, labelled where there is
 * room. The person erased in the privacy beat is not there, unless
 * `beforeErase` draws the moment before it (Ch2's reduced before/after pair).
 */
export function RadarStatic({
  radiusKm = 25,
  tilt = 52,
  beforeErase = false,
  className = '',
}: {
  radiusKm?: (typeof RADII)[number];
  tilt?: number;
  beforeErase?: boolean;
  className?: string;
}) {
  const { at, unit } = scene(radiusKm, tilt);
  const rings = RADII.filter((r) => r <= radiusKm);
  const ringPath = rings
    .map((km) => {
      const pts: string[] = [];
      for (let i = 0; i <= 72; i++) {
        const q = at(km, (i / 72) * 360);
        pts.push(`${n1(q.x)} ${n1(q.y)}`);
      }
      return `M${pts.join('L')}Z`;
    })
    .join('');
  const people = within(radiusKm, !beforeErase).map((n) => ({ n, ground: at(n.km, n.bearing), top: at(n.km, n.bearing, STAND / unit) }));
  const centre = { ground: at(0, 0), top: at(0, 0, (STAND * 1.6) / unit) };
  const stems = [...people, centre].map((s) => `M${n1(s.ground.x)} ${n1(s.ground.y)}L${n1(s.top.x)} ${n1(s.top.y)}`).join('');
  // Ring labels at each ring's near edge (south), where it is widest; skipped when too tight to read.
  const outer = at(radiusKm, 180).y - at(0, 0).y;
  const labelled = rings.filter((km) => (km / radiusKm) * outer > 18);
  return (
    <div aria-hidden="true" data-part="radar-static" className={`relative w-full ${className}`} style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} focusable="false" className="absolute inset-0 h-full w-full">
        <path d={ringPath} fill="none" stroke="#F0C88E" strokeOpacity={0.55} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
        <path d={stems} fill="none" stroke="#F0C88E" strokeOpacity={0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {people.map(({ n, ground, top }) => (
          <g key={n.name} data-person={n.name}>
            <ellipse cx={n1(ground.x)} cy={n1(ground.y)} rx={2.4} ry={1} fill="#F0C88E" opacity={0.25} />
            <circle cx={n1(top.x)} cy={n1(top.y)} r={5.5} fill="#F0C88E" opacity={0.14} />
            <circle cx={n1(top.x)} cy={n1(top.y)} r={2.1} fill="#F7EFE6" />
          </g>
        ))}
        <circle cx={n1(centre.top.x)} cy={n1(centre.top.y)} r={9} fill="#F0C88E" opacity={0.2} />
        <circle cx={n1(centre.top.x)} cy={n1(centre.top.y)} r={3.4} fill="#FFE2B8" />
      </svg>
      {labelled.map((km) => {
        const q = at(km, 180);
        return (
          <span
            key={km}
            className="absolute -translate-x-1/2 translate-y-[0.35em] font-mono text-[11px] leading-none tracking-[0.06em] text-[#BCADA3] sm:text-xs"
            style={{ left: `${((q.x / W) * 100).toFixed(2)}%`, top: `${((q.y / H) * 100).toFixed(2)}%` }}
          >
            {km} km
          </span>
        );
      })}
    </div>
  );
}
