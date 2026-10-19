import { useId, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { AbsoluteFill, Img } from "remotion";
import { STAGE_BACKGROUND } from "../brand/palette";
import type { GeoState } from "../site";
import { drawGeo, placeMap, type MapPlacement, type StillLevel, type StillOptions } from "./still-sky";

/** The haze map-layer.tsx lays over the levels, its top edge pinned to the horizon. */
const HAZE =
  "linear-gradient(to bottom, rgba(14,12,11,0.96) 0%, rgba(14,12,11,0.7) 18%, rgba(14,12,11,0.3) 42%, rgba(14,12,11,0.08) 68%, rgba(14,12,11,0) 100%)";

/** The levels as map-layer.tsx lays them out: one wrapper per level, its matrix3d from the camera. */
function Levels({ map, filter }: { map: MapPlacement; filter?: string }) {
  return (
    <AbsoluteFill style={filter ? { filter } : undefined}>
      {map.levels.map((l) =>
        l.weight > 0 && l.transform ? (
          <div
            key={l.id}
            data-sky-map-level={l.id}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: l.box.width * l.box.scale,
              height: l.box.height * l.box.scale,
              transformOrigin: "0 0",
              transform: l.transform,
              opacity: l.weight,
            }}
          >
            <Img src={l.src} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>
        ) : null,
      )}
    </AbsoluteFill>
  );
}

/** The haze as a mask (1 − its alpha), so the shore fades toward the horizon exactly as the land does. */
const hazeMask = (top: number, height: number) => {
  const at = (f: number) => `${(top + f * height).toFixed(1)}px`;
  return `linear-gradient(to bottom, rgba(0,0,0,0.04) ${at(0)}, rgba(0,0,0,0.3) ${at(0.18)}, rgba(0,0,0,0.7) ${at(0.42)}, rgba(0,0,0,0.92) ${at(0.68)}, rgba(0,0,0,1) ${at(1)})`;
};

const Haze = ({ top }: { top: number }) => (
  <div data-sky-haze="" style={{ position: "absolute", left: 0, right: 0, top: 0, height: "100%", background: HAZE, transform: `translate3d(0px, ${top}px, 0px)` }} />
);

/**
 * The page's sky stage as one still: its background, the map levels in
 * their camera-driven wrappers (map-layer.tsx's markup), the canvas, and
 * whatever labels the caller lays over it. Everything is placed by the
 * frame's own camera, so the map, the stars and the labels line up exactly
 * as they do on the page.
 *
 * `coast` (stills only; the page has no such layer) adds a thin gold line
 * along every shore at that opacity, traced from the same levels, for a still
 * that has to read as a map without motion to explain it.
 */
export function SkyStill({
  geo,
  options,
  levels,
  coast = 0,
  background = STAGE_BACKGROUND,
  children,
}: {
  geo: GeoState;
  options: StillOptions;
  levels: readonly StillLevel[];
  coast?: number;
  background?: string;
  children?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const filterId = `coast-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const width = Math.round(options.cssWidth * options.dpr);
  const height = Math.round(options.cssHeight * options.dpr);
  const map = useMemo(() => placeMap(geo, levels, options), [geo, levels, options]);

  useLayoutEffect(() => {
    const g = canvas.current?.getContext("2d");
    if (g) drawGeo(g, geo, options);
  }, [geo, options]);

  return (
    <AbsoluteFill style={{ background }}>
      <AbsoluteFill data-sky-map="" style={{ opacity: map.opacity }}>
        <Levels map={map} />
        <Haze top={map.hazeTop} />
      </AbsoluteFill>
      {coast > 0 && map.opacity > 0 ? (
        <AbsoluteFill data-sky-coast="" style={{ opacity: coast, maskImage: hazeMask(map.hazeTop, height), WebkitMaskImage: hazeMask(map.hazeTop, height) }}>
          <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
            {/* The shore: the land grown by a device pixel and a half, minus the land, softened, in gold. */}
            <filter id={filterId} x="-2%" y="-2%" width="104%" height="104%" colorInterpolationFilters="sRGB">
              <feMorphology in="SourceAlpha" operator="dilate" radius={0.75 * options.dpr} result="grown" />
              <feComposite in="grown" in2="SourceAlpha" operator="out" result="shore" />
              <feGaussianBlur in="shore" stdDeviation={0.35 * options.dpr} result="soft" />
              <feFlood floodColor="#F0C88E" />
              <feComposite in2="soft" operator="in" />
            </filter>
          </svg>
          <Levels map={map} filter={`url(#${filterId})`} />
        </AbsoluteFill>
      ) : null}
      <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width, height }} />
      {children}
    </AbsoluteFill>
  );
}
