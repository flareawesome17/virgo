import { useLayoutEffect, useRef, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { paintDeep } from "../../../web/src/components/story/sky/paint-deep";
import type { DeepState } from "../../../web/src/components/story/sky/types";
import { STAGE_BACKGROUND } from "../brand/palette";
import { deepField, paintCloud, project, view, type CloudLook, type GeoState, type Painter, type Projected, type Vec3 } from "../site";
import { SkyStill } from "../sky/SkyStill";
import { stillLevels } from "../sky/map-levels";
import { ENGINE, sprites, toScreen, type StillOptions } from "../sky/still-sky";

/**
 * The reel's sky: the page's own sky stage at phone proportions (540 × 960
 * CSS px at DPR 2, so a star is the size it is on a phone), drawn with the
 * page's painter, seed and map levels (marketing-assets/src/sky, which
 * mirrors engine.ts), plus the deep-sky scene (paint-deep.ts) on top, as the
 * engine draws it: the far field, then Virgo at its real distances.
 *
 * The twinkle runs on the reel's clock (`time`, seconds), so it moves.
 */
export const SKY_CSS = { width: 540, height: 960, dpr: 2 } as const;

/** Every map level, laid out at up to 150 device px per unit: the most the reel magnifies the plane (S4's radar). */
const LEVELS = stillLevels(150);
const FIELD = deepField(240);

export const skyOptions = (time: number | null): StillOptions => ({
  cssWidth: SKY_CSS.width,
  cssHeight: SKY_CSS.height,
  dpr: SKY_CSS.dpr,
  variant: "desktop",
  time,
});

/** A world point of the geo scene on the reel's frame (1080 × 1920 px), or null behind the camera. */
export function geoToFrame(geo: GeoState, world: Vec3): { x: number; y: number } | null {
  return toScreen(geo, skyOptions(null), world);
}

const pt: Projected = { x: 0, y: 0, depth: 0 };
/** A deep-scene point (light-years) on the reel's frame, px. */
export function deepToFrame(deep: DeepState, world: Vec3): { x: number; y: number } | null {
  const v = view(deep.camera, SKY_CSS.width, SKY_CSS.height);
  project(v, world[0], world[1], world[2], pt);
  if (!(pt.depth > 0)) return null;
  return { x: pt.x * SKY_CSS.dpr, y: pt.y * SKY_CSS.dpr };
}

function DeepLayer({ deep, geo, time }: { deep: DeepState | null; geo: GeoState | null; time: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const w = SKY_CSS.width * SKY_CSS.dpr;
  const h = SKY_CSS.height * SKY_CSS.dpr;
  useLayoutEffect(() => {
    const g = canvas.current?.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    if (!deep || deep.opacity <= 0.002) return;
    g.setTransform(SKY_CSS.dpr, 0, 0, SKY_CSS.dpr, 0, 0);
    const p: Painter = { g, sprites: sprites(SKY_CSS.dpr), count: 0, budget: ENGINE.BUDGET.desktop, time };
    const dv = view(deep.camera, SKY_CSS.width, SKY_CSS.height);
    const gv = geo ? view(geo.camera, SKY_CSS.width, SKY_CSS.height) : null;
    const look: CloudLook = { base: ENGINE.FIELD_BASE, opacity: deep.opacity * (deep.field ?? 1), twinkle: true, floor: 0.7, glow: ENGINE.CLOUD_GLOW };
    p.budget = ENGINE.BUDGET.desktop - ENGINE.RESERVE / 2;
    if (look.opacity > 0.002) paintCloud(p, dv, FIELD, look, 0);
    p.budget = ENGINE.BUDGET.desktop;
    paintDeep(p, dv, deep, gv);
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  });
  return <canvas ref={canvas} width={w} height={h} style={{ position: "absolute", inset: 0, width: w, height: h }} />;
}

/** A geo frame that draws nothing (for deep-only moments). */
const NOTHING: GeoState = { camera: { position: [0, 10, 0], target: [0, 0, 0], fov: 40 }, opacity: 0 };

export function ReelSky({
  geo,
  deep = null,
  time,
  background = STAGE_BACKGROUND,
  coast = 0,
  children,
}: {
  geo: GeoState | null;
  deep?: DeepState | null;
  /** Seconds on the reel's clock, for the twinkle. */
  time: number;
  background?: string;
  coast?: number;
  children?: ReactNode;
}) {
  return (
    <AbsoluteFill>
      <SkyStill geo={geo ?? NOTHING} options={skyOptions(time)} levels={LEVELS} background={background} coast={coast}>
        <DeepLayer deep={deep} geo={geo} time={time} />
        {children}
      </SkyStill>
    </AbsoluteFill>
  );
}
