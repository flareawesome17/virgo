import type { ReactNode } from "react";
import { PHONE_RADIUS, PhoneFrame, Slab, type SignalBars } from "../../../web/src/components/story/frames";

/** The phone as the mocks expect it: 390 CSS px wide with its 7 px bezel, so the screen is 376 (they want ≥ 360). */
export const PHONE_W = 390;
/** Its height at the frames' 9 : 19.5 screen. */
export const PHONE_H = Math.round(((PHONE_W - 14) * 19.5) / 9 + 14);

/**
 * The phone is laid out at this zoom and only ever scaled down from it.
 * Chrome rasterises a 3D-transformed layer at its laid-out size, so a phone
 * scaled up with a transform goes soft; laid out large (CSS zoom) and scaled
 * down, its text stays sharp at every pose.
 */
export const RASTER = 2.6;

export type PhonePose = {
  /** Where the focus point lands on the reel's frame, px. */
  readonly x: number;
  readonly y: number;
  /** The focus point on the phone, CSS px from its top left (default: its centre). Scaling grows the phone about it, so a push-in keeps it still. */
  readonly fx?: number;
  readonly fy?: number;
  readonly scale: number;
  /** The slab's turn, degrees (§1.13: ≤ 18°), and lift, px. */
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly z?: number;
  readonly opacity?: number;
  /** 0..1: the screen's light spilling onto the night around it. */
  readonly glow?: number;
};

/**
 * Anything laid out at phone size, placed by a pose: laid out at RASTER and
 * scaled down to `pose.scale`, about the focus point.
 */
export function Rig({ pose, w, h, children }: { pose: PhonePose; w: number; h: number; children: ReactNode }) {
  const fx = pose.fx ?? w / 2;
  const fy = pose.fy ?? h / 2;
  return (
    <div
      style={{
        position: "absolute",
        left: pose.x - fx * RASTER,
        top: pose.y - fy * RASTER,
        width: w * RASTER,
        height: h * RASTER,
        transformOrigin: `${fx * RASTER}px ${fy * RASTER}px`,
        transform: `scale(${(pose.scale / RASTER).toFixed(5)}) rotate(${pose.rz ?? 0}deg)`,
        opacity: pose.opacity ?? 1,
      }}
    >
      <div style={{ zoom: RASTER, position: "relative", width: w, height: h }}>{children}</div>
    </div>
  );
}

/**
 * A phone in the reel's 3D: the story's own `Slab` (thickness, sheen,
 * contact shadow) around its own `PhoneFrame`, holding a real mock. The mock
 * is laid out at phone size and the whole rig is placed by its pose, so a
 * mock renders exactly as on the page, only larger.
 */
export function PhoneRig({
  pose,
  time,
  signal = 4,
  screen = "#161311",
  tone = "light",
  battery,
  shadow = "drop",
  children,
}: {
  pose: PhonePose;
  time: string;
  signal?: SignalBars;
  screen?: string;
  tone?: "light" | "dark";
  battery?: number;
  shadow?: "floor" | "drop" | false;
  children?: ReactNode;
}) {
  const glow = pose.glow ?? 0;
  return (
    <Rig pose={pose} w={PHONE_W} h={PHONE_H}>
      {glow > 0.001 ? (
        <div
          style={{
            position: "absolute",
            left: "-60%",
            right: "-60%",
            top: "-30%",
            bottom: "-30%",
            opacity: glow,
            background: "radial-gradient(closest-side, rgba(240,200,142,0.22), rgba(193,119,69,0.08) 55%, rgba(193,119,69,0) 100%)",
          }}
        />
      ) : null}
      <Slab className="w-full" rotateX={pose.rx ?? 0} rotateY={pose.ry ?? 0} translateZ={pose.z ?? 0} depth={14} radius={PHONE_RADIUS} edge="device" shadow={shadow}>
        <PhoneFrame width="100%" time={time} signal={signal} screen={screen} tone={tone} battery={battery}>
          {children}
        </PhoneFrame>
      </Slab>
    </Rig>
  );
}
