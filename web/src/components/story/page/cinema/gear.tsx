/**
 * The gear (docs/redesign/05-cinema.md §1.7): the tools that say who the film
 * is about, drawn in code as lit "night product shots" (dark bodies, a warm
 * rim light from the gold palette). Decorative: every piece is aria-hidden.
 *
 * Server-safe (no hooks), so static scenes can use it too.
 *
 * Shading is stacked flat shapes: no <defs>, gradients, filters or ids. Several
 * pieces share a page, some inside display:none, and that breaks url(#id).
 * Two parts carry hooks for scenes to animate: [data-part="shutter"] on the
 * camera and [data-part="tally"] on the cinema rig.
 */

import type { ReactElement } from 'react';

export type GearKind = 'camera' | 'lens' | 'cinema' | 'gimbal' | 'light' | 'mic' | 'brush' | 'timeline';

/** Which tool stands for which role in the cast. */
export const ROLE_GEAR = {
  photographer: 'camera',
  videographer: 'cinema',
  editor: 'timeline',
  hmua: 'brush',
} as const satisfies Record<string, GearKind>;

/** Each piece's natural aspect (width / height), so layouts can size it without measuring. */
export const GEAR_ASPECT: Record<GearKind, number> = {
  camera: 1.45,
  lens: 1,
  cinema: 1.6,
  gimbal: 0.62,
  light: 0.7,
  mic: 0.42,
  brush: 0.3,
  timeline: 1.55,
};

const VIEW: Record<GearKind, string> = {
  camera: '0 0 290 200',
  lens: '0 0 200 200',
  cinema: '0 0 320 200',
  gimbal: '0 0 124 200',
  light: '0 0 140 200',
  mic: '0 0 84 200',
  brush: '0 0 60 200',
  timeline: '0 0 310 200',
};

/* The night product shot: warm-charcoal bodies, a gold rim light from the top left. */
const INK = '#1E1A17';
const BODY = '#2A2420';
const FACET = '#36302B';
const GOLD = '#F0C88E';
const COPPER = '#D18A5A';
const EMBER = '#A85F38';
const BONE = '#F2EDE8';
const GLASS = '#121718';
const TEAL = '#5E8F8A';
const TEAL_DEEP = '#3F6965';
const RED = '#E0533F';

/** Mirrorless body, 3/4 front: grip, shutter, mode dial, hot shoe, lens with a knurled focus ring and a gold mount ring. */
const CAMERA = (
  <>
    <path d="M70 62 L54 55 L54 154 Q54 158 58 160 L70 168 Z" fill={BODY} />
    <path d="M70 62 L236 62 L222 52 L58 52 Q54 52 54 55 Z" fill={FACET} />
    <rect x="70" y="62" width="166" height="106" rx="9" fill={BODY} />
    <path d="M78 62.8 L230 62.8" stroke={COPPER} strokeWidth="1.4" opacity="0.55" />
    <path d="M70 71 Q70 62 79 62 L104 62 Q111 62 111 70 L111 160 Q111 168 103 168 L79 168 Q70 168 70 159 Z" fill={FACET} />
    <path d="M75.5 72 L75.5 158" stroke={GOLD} strokeWidth="1.6" opacity="0.45" />
    <path d="M111.5 70 L111.5 160" stroke={INK} strokeWidth="2" />
    <path d="M122 62 L130 36 L116 28 L108 54 Z" fill={BODY} />
    <path d="M122 62 L129.5 37 Q131 33 135 33 L165 33 Q169 33 170.5 37 L178 62 Z" fill={BODY} />
    <path d="M133 33 L167 33 L153 25 L119 25 Z" fill={FACET} />
    <path d="M137 31 L159 31 L151 27 L129 27 Z" fill={COPPER} opacity="0.8" />
    <path d="M134 29 L154 29" stroke={BONE} strokeWidth="1" opacity="0.35" />
    <path d="M54 152 L54 56 Q54 52 58 52 L120 52 M108 54 L115.5 29 Q117 25 121 25 L153 25 M178 52 L220 52" stroke={GOLD} strokeWidth="2.5" opacity="0.95" />
    <circle cx="56.5" cy="53.5" r="2" fill={BONE} opacity="0.8" />
    <g data-part="shutter">
      <rect x="83" y="49" width="18" height="8" rx="2" fill={FACET} />
      <ellipse cx="92" cy="49" rx="9" ry="3" fill={COPPER} />
    </g>
    <rect x="194" y="45" width="26" height="12" rx="2" fill={BODY} />
    <path d="M197.5 47.5 L197.5 55.5 M201.3 47.5 L201.3 55.5 M205.1 47.5 L205.1 55.5 M208.9 47.5 L208.9 55.5 M212.7 47.5 L212.7 55.5 M216.5 47.5 L216.5 55.5" stroke={BONE} strokeWidth="1.1" opacity="0.22" />
    <ellipse cx="207" cy="45" rx="13" ry="3.5" fill={FACET} />
    <path d="M194.8 46.2 A13 3.5 0 0 1 211.4 41.7" stroke={GOLD} strokeWidth="1.6" />
    <ellipse cx="150" cy="115" rx="31" ry="50" fill={INK} stroke={COPPER} strokeWidth="1.5" strokeOpacity="0.45" />
    <path d="M150 71 L194 75 A26 44 0 0 1 194 163 L150 159 A26 44 0 0 1 150 71Z" fill={BODY} />
    <path d="M152.2 71.2 L155.7 71.5 A26 44 0 0 0 155.7 159.5 L152.2 159.2 A26 44 0 0 1 152.2 71.2Z" fill={COPPER} />
    <path d="M163.2 72.2 L181.7 73.9 A26 44 0 0 0 181.7 161.9 L163.2 160.2 A26 44 0 0 1 163.2 72.2Z" fill={INK} />
    <path d="M155.2 74.4 L173.6 76 M150.2 78.1 L168.7 79.8 M145.8 83.5 L164.3 85.2 M142.2 90.3 L160.6 92 M139.4 98.3 L157.9 100 M137.8 107.1 L156.2 108.7 M137.2 116.2 L155.7 117.9 M137.8 125.3 L156.2 127 M139.4 134.1 L157.9 135.8 M142.2 142.1 L160.6 143.7 M145.8 148.9 L164.3 150.6 M150.2 154.3 L168.7 156 M155.2 158 L173.6 159.7" stroke={BONE} strokeWidth="1.2" opacity="0.22" />
    <path d="M187 74.4 A26 44 0 0 0 187 162.4" stroke={INK} strokeWidth="1.5" />
    <path d="M150 71 L194 75" stroke={GOLD} strokeWidth="2.5" />
    <ellipse cx="194" cy="119" rx="26" ry="44" fill={FACET} />
    <ellipse cx="194" cy="119" rx="22" ry="37.5" fill={INK} />
    <ellipse cx="194" cy="119" rx="18" ry="31" fill={GLASS} />
    <ellipse cx="195.5" cy="121.5" rx="11" ry="19" stroke={TEAL} strokeWidth="1.4" opacity="0.45" />
    <path d="M180 112.5 A14.5 25 0 0 1 189.5 95.2" stroke={GOLD} strokeWidth="2.4" />
    <path d="M203.7 125 A9 15.5 0 0 1 198.1 135.6" stroke={COPPER} strokeWidth="1.4" opacity="0.7" />
    <circle cx="187.2" cy="103.2" r="2.2" fill={BONE} opacity="0.9" />
    <path d="M168.6 128.1 A26 44 0 0 1 200.7 76.5" stroke={GOLD} strokeWidth="2.4" />
    <circle cx="222" cy="77" r="3.2" fill={EMBER} opacity="0.9" />
    <circle cx="117" cy="154" r="4" fill={FACET} stroke={INK} strokeWidth="1.2" />
  </>
);

/** A prime lens from the front at about 3/4: gold mount, knurled focus ring, glass with concentric reflections. */
const LENS = (
  <>
    <path d="M56 47 L82 50 A30 50 0 0 1 82 150 L56 147 A30 50 0 0 1 56 47Z" fill={INK} />
    <path d="M56 47 L70.3 48.7 A30 50 0 0 0 70.3 148.7 L56 147 A30 50 0 0 1 56 47Z" fill={COPPER} />
    <path d="M27.8 79.9 A30 50 0 0 1 49.8 48.1" stroke={GOLD} strokeWidth="2.4" />
    <path d="M82 28 L132 33 A44 72 0 0 1 132 177 L82 172 A44 72 0 0 1 82 28Z" fill={BODY} />
    <path d="M82 28 L87 28.5 A44 72 0 0 0 87 172.5 L82 172 A44 72 0 0 1 82 28Z" fill={FACET} />
    <path d="M98 29.6 L122 32 A44 72 0 0 0 122 176 L98 173.6 A44 72 0 0 1 98 29.6Z" fill={INK} />
    <path d="M87.4 31.7 L111.4 34.1 M80.5 35.6 L104.5 38 M74 41.2 L98 43.6 M68.3 48.5 L92.3 50.9 M63.3 57.3 L87.3 59.7 M59.3 67.2 L83.3 69.6 M56.4 78.2 L80.4 80.6 M54.6 89.7 L78.6 92.1 M54 101.6 L78 104 M54.6 113.5 L78.6 115.9 M56.4 125 L80.4 127.4 M59.3 136 L83.3 138.4 M63.3 145.9 L87.3 148.3 M68.3 154.7 L92.3 157.1 M74 162 L98 164.4 M80.5 167.6 L104.5 170 M87.4 171.5 L111.4 173.9" stroke={BONE} strokeWidth="1.5" opacity="0.17" />
    <path d="M92 29 A44 72 0 0 0 92 173" stroke={COPPER} strokeWidth="1.2" opacity="0.5" />
    <circle cx="63.6" cy="47.6" r="2" fill={GOLD} />
    <path d="M82 28 L132 33" stroke={GOLD} strokeWidth="3" />
    <ellipse cx="132" cy="105" rx="44" ry="72" fill={FACET} />
    <ellipse cx="132" cy="105" rx="39" ry="64" fill={INK} />
    <ellipse cx="132" cy="105" rx="36.5" ry="60" stroke={BONE} strokeWidth="1" opacity="0.12" />
    <ellipse cx="132" cy="105" rx="33" ry="55" fill={GLASS} />
    <ellipse cx="135" cy="110" rx="22" ry="37" stroke={TEAL} strokeWidth="2" opacity="0.35" />
    <ellipse cx="137" cy="113" rx="11" ry="18.5" fill={INK} />
    <path d="M106 92.3 A27 46 0 0 1 122.8 61.8" stroke={GOLD} strokeWidth="3.4" />
    <path d="M117.3 96.4 A18 31 0 0 1 124.5 81.7" stroke={COPPER} strokeWidth="2" opacity="0.6" />
    <path d="M157.2 123.7 A25 42 0 0 1 145.7 145.1" stroke={TEAL} strokeWidth="2" opacity="0.55" />
    <path d="M129.7 107.3 A8 13.5 0 0 1 134.3 100.3" stroke={GOLD} strokeWidth="1.4" opacity="0.7" />
    <circle cx="118.2" cy="77.1" r="3.2" fill={BONE} opacity="0.92" />
    <circle cx="133.6" cy="104.8" r="1.6" fill={BONE} opacity="0.6" />
    <path d="M90.2 127.2 A44 72 0 0 1 147 37.3" stroke={GOLD} strokeWidth="3" />
    <path d="M169.7 121.6 A39 64 0 0 1 142.1 166.8" stroke={COPPER} strokeWidth="1.4" opacity="0.45" />
  </>
);

/** Cinema rig in profile: box body, top handle, side monitor, matte box with a flag, rod rail, red tally light. */
const CINEMA = (
  <>
    <rect x="52" y="146" width="224" height="5" rx="2.5" fill={BODY} />
    <rect x="42" y="154" width="232" height="6" rx="3" fill={FACET} />
    <path d="M47 155.2 L270 155.2 M56 146.8 L272 146.8" stroke={GOLD} strokeWidth="1.1" opacity="0.45" />
    <rect x="94" y="138" width="100" height="14" rx="3" fill={INK} />
    <rect x="256" y="128" width="10" height="30" rx="2" fill={INK} />
    <path d="M80 52 L112 46" stroke={INK} strokeWidth="5" />
    <path d="M22 31 Q22 28 25 28.3 L77 32.5 Q80 32.8 80 35.8 L80 68.5 Q80 71.5 77 71.8 L25 77.6 Q22 78 22 75 Z" fill={BODY} />
    <path d="M27 34.5 L75 38 L75 66.5 L27 71.8 Z" fill={INK} />
    <path d="M27 61 Q40 55 52 58.5 Q64 61.5 75 56.5 L75 66.5 L27 71.8 Z" fill={COPPER} opacity="0.4" />
    <circle cx="58" cy="50" r="5.5" fill={GOLD} opacity="0.75" />
    <path d="M22 74 L22 31 Q22 28 25 28.3 L77 32.5" stroke={GOLD} strokeWidth="2.2" />
    <path d="M96 64 L86 56 L86 132 L96 140 Z" fill={BODY} />
    <path d="M96.4 70 L96.4 134" stroke={COPPER} strokeWidth="1.2" opacity="0.4" />
    <path d="M96 64 L196 64 L186 56 L89 56 Q86 56 86 58 Z" fill={FACET} />
    <rect x="96" y="64" width="100" height="76" rx="5" fill={BODY} />
    <path d="M100 64.8 L192 64.8" stroke={COPPER} strokeWidth="1.3" opacity="0.5" />
    <rect x="108" y="78" width="42" height="26" rx="3" fill={INK} />
    <path d="M114 86 L134 86 M114 92 L127 92 M114 98 L139 98" stroke={BONE} strokeWidth="2" opacity="0.3" />
    <path d="M162 114 L184 114 M162 120 L184 120 M162 126 L184 126" stroke={INK} strokeWidth="2.4" />
    <circle cx="172" cy="86" r="5" fill={EMBER} stroke={INK} strokeWidth="1.5" />
    <path d="M108 58 L108 38 Q108 32 114 32 L174 32 Q180 32 180 38 L180 58 L172 58 L172 43 Q172 40 169 40 L119 40 Q116 40 116 43 L116 58 Z" fill={FACET} />
    <path d="M86 130 L86 59 Q86 56 89 56 L106 56 M108 54 L108 38 Q108 32 114 32 L174 32" stroke={GOLD} strokeWidth="2.5" />
    <rect x="196" y="76" width="40" height="52" rx="2" fill={BODY} />
    <rect x="196" y="76" width="40" height="8" rx="2" fill={FACET} />
    <rect x="207" y="74" width="18" height="56" rx="2" fill={INK} />
    <path d="M209.6 77 L209.6 127 M212.2 77 L212.2 127 M214.8 77 L214.8 127 M217.4 77 L217.4 127 M220 77 L220 127 M222.6 77 L222.6 127" stroke={BONE} strokeWidth="1" opacity="0.16" />
    <rect x="196" y="75" width="4" height="54" rx="1" fill={COPPER} />
    <path d="M200 76 L207 76 M207 74 L225 74 M225 76 L236 76" stroke={GOLD} strokeWidth="2" />
    <path d="M236 70 L284 50 L276 44 L228 64 Z" fill={FACET} />
    <path d="M236 70 L284 50 L284 154 L236 134 Z" fill={BODY} />
    <rect x="281" y="47" width="8" height="110" rx="2" fill={FACET} />
    <path d="M285 48 L303 34 L306 37 L289 50 Z" fill={FACET} />
    <path d="M228 64 L276 44 L282 47 M286 46 L302 34.5" stroke={GOLD} strokeWidth="2.2" />
    <rect x="183" y="50" width="12" height="8" rx="2" fill={INK} />
    <g data-part="tally">
      <circle cx="189" cy="50" r="9" fill={RED} opacity="0.22" />
      <circle cx="189" cy="50" r="3.8" fill={RED} />
      <circle cx="187.8" cy="48.8" r="1.3" fill={BONE} opacity="0.9" />
    </g>
  </>
);

/** Handheld 3-axis gimbal: handle, pan, roll and tilt motors, a small camera on top. */
const GIMBAL = (
  <>
    <path d="M98 61 L108 61 L108 90 Q108 100 98 100 L76 100 L76 90 L98 90 Z" fill={BODY} />
    <path d="M76 90 L98 90 L98 63" stroke={GOLD} strokeWidth="1.6" opacity="0.7" />
    <path d="M18 30 L12 25 L12 65 L18 70 Z" fill={BODY} />
    <path d="M18 30 L88 30 L82 25 L14.5 25 Q12 25 12 27 Z" fill={FACET} />
    <rect x="18" y="30" width="70" height="40" rx="6" fill={BODY} />
    <path d="M41 30 L45 19 Q46 17 48 17 L62 17 Q64 17 65 19 L69 30 Z" fill={BODY} />
    <path d="M47 17 L63 17 L57 13 L41 13 Z" fill={FACET} />
    <path d="M18 37 Q18 30 25 30 L31 30 Q34 30 34 33 L34 66 Q34 70 30 70 L25 70 Q18 70 18 63 Z" fill={FACET} />
    <rect x="20" y="21.5" width="10" height="4.5" rx="1.5" fill={COPPER} />
    <path d="M12 64 L12 27 Q12 25 14.5 25 L40 25 M42.5 24 L45 19 Q46 17 48 17 L60 17" stroke={GOLD} strokeWidth="2" />
    <circle cx="58" cy="50" r="17" fill={FACET} />
    <circle cx="58" cy="50" r="13.5" fill={INK} />
    <circle cx="58" cy="50" r="10" fill={GLASS} />
    <path d="M51 47.4 A7.5 7.5 0 0 1 56.4 42.7" stroke={GOLD} strokeWidth="1.8" />
    <circle cx="54.3" cy="45.3" r="1.5" fill={BONE} opacity="0.9" />
    <path d="M41.3 53 A17 17 0 0 1 61 33.3" stroke={GOLD} strokeWidth="2" />
    <rect x="86" y="45" width="10" height="10" rx="1" fill={INK} />
    <circle cx="103" cy="50" r="12" fill={FACET} />
    <circle cx="103" cy="50" r="7" fill={BODY} />
    <circle cx="103" cy="50" r="2.5" fill={COPPER} />
    <path d="M91 51 A12 12 0 0 1 106.1 38.4" stroke={GOLD} strokeWidth="2" />
    <circle cx="64" cy="95" r="13" fill={FACET} />
    <circle cx="64" cy="95" r="8" fill={BODY} />
    <circle cx="64" cy="95" r="3" fill={COPPER} />
    <path d="M51 96.1 A13 13 0 0 1 67.4 82.4" stroke={GOLD} strokeWidth="2" />
    <rect x="58" y="106" width="12" height="6" rx="1" fill={INK} />
    <rect x="47" y="110" width="34" height="13" rx="3" fill={BODY} />
    <ellipse cx="64" cy="110" rx="17" ry="4" fill={FACET} />
    <path d="M47.3 110.7 A17 4 0 0 1 69.8 106.2" stroke={GOLD} strokeWidth="1.6" />
    <path d="M50 123 L78 123 L76 184 Q75.5 194 64 194 Q52.5 194 52 184 Z" fill={BODY} />
    <path d="M50 123 L58 123 L58.5 193.6 Q53 191.5 52 184 Z" fill={FACET} opacity="0.85" />
    <rect x="51.5" y="154" width="25" height="28" rx="4" fill={INK} opacity="0.55" />
    <path d="M50 125 L52 184" stroke={GOLD} strokeWidth="2" opacity="0.85" />
    <circle cx="64" cy="134" r="5.5" fill={INK} />
    <circle cx="64" cy="134" r="2.6" fill={FACET} />
    <circle cx="64" cy="145" r="2.4" fill={EMBER} />
  </>
);

/** Studio strobe on a stand, an octabox face glowing warm. */
const LIGHT = (
  <>
    <path d="M103.3 89.2 L75.6 124.9 L36.4 124.9 L8.7 89.2 L8.7 38.8 L36.4 3.1 L75.6 3.1 L103.3 38.8Z" fill={GOLD} opacity="0.05" />
    <path d="M98.7 86.7 L73.7 118.9 L38.3 118.9 L13.3 86.7 L13.3 41.3 L38.3 9.1 L73.7 9.1 L98.7 41.3Z" fill={GOLD} opacity="0.09" />
    <path d="M72.1 14.1 L106 56 L106 78 L72.1 113.9 Z" fill={BODY} />
    <path d="M94.8 43.3 L106 60 M94.8 84.7 L106 74" stroke={FACET} strokeWidth="1.3" />
    <path d="M72.1 14.1 L106 56" stroke={GOLD} strokeWidth="2.2" />
    <rect x="104" y="55" width="7" height="25" rx="2" fill={COPPER} opacity="0.9" />
    <rect x="110" y="53" width="22" height="30" rx="4" fill={BODY} />
    <rect x="110" y="53" width="22" height="7" rx="3.5" fill={FACET} />
    <rect x="130" y="57" width="5" height="22" rx="2" fill={INK} />
    <path d="M111 57 Q111 53 114.5 53 L128 53" stroke={GOLD} strokeWidth="1.8" />
    <circle cx="121" cy="70" r="1.8" fill={EMBER} />
    <rect x="118.5" y="83" width="5" height="80" rx="1.5" fill={FACET} />
    <path d="M119.6 86 L119.6 158" stroke={GOLD} strokeWidth="1" opacity="0.45" />
    <rect x="116" y="116" width="10" height="8" rx="2" fill={BODY} />
    <circle cx="128.5" cy="120" r="3" fill={BODY} />
    <path d="M121 164 L97 195 M121 164 L134 195 M121 164 L120 197" stroke={BODY} strokeWidth="4.5" />
    <path d="M120.4 164.5 L97 194.4 M121 164 L120 196.4" stroke={GOLD} strokeWidth="1.2" opacity="0.4" />
    <rect x="116" y="158" width="10" height="10" rx="2" fill={INK} />
    <path d="M94.8 84.7 L72.1 113.9 L39.9 113.9 L17.2 84.7 L17.2 43.3 L39.9 14.1 L72.1 14.1 L94.8 43.3Z" fill={BODY} />
    <path d="M90.9 82.6 L70.5 108.9 L41.5 108.9 L21.1 82.6 L21.1 45.4 L41.5 19.1 L70.5 19.1 L90.9 45.4Z" fill={EMBER} />
    <path d="M87 80.5 L68.9 103.9 L43.1 103.9 L25 80.5 L25 47.5 L43.1 24.1 L68.9 24.1 L87 47.5Z" fill={COPPER} />
    <path d="M78.1 73.8 L64 91.9 L44 91.9 L29.9 73.8 L29.9 48.2 L44 30.1 L64 30.1 L78.1 48.2Z" fill={GOLD} />
    <path d="M65 63.4 L56.8 74 L45.2 74 L37 63.4 L37 48.6 L45.2 38 L56.8 38 L65 48.6Z" fill={BONE} opacity="0.6" />
    <path d="M56 64 L90.9 82.6 M56 64 L70.5 108.9 M56 64 L41.5 108.9 M56 64 L21.1 82.6 M56 64 L21.1 45.4 M56 64 L41.5 19.1 M56 64 L70.5 19.1 M56 64 L90.9 45.4" stroke={EMBER} strokeWidth="1" opacity="0.3" />
    <path d="M39.9 113.9 L17.2 84.7 L17.2 43.3 L39.9 14.1 L72.1 14.1" stroke={GOLD} strokeWidth="2.4" opacity="0.9" />
  </>
);

/** Handheld vocal mic: meshed ball grille, gold band, tapered handle (more legible small than a shotgun). */
const MIC = (
  <>
    <circle cx="42" cy="46" r="30" fill={INK} />
    <circle cx="39" cy="43" r="26.5" fill={BODY} />
    <circle cx="34.5" cy="37.5" r="15" fill={FACET} opacity="0.85" />
    <path d="M42 16 A10 30 0 0 0 42 76 A10 30 0 0 0 42 16 M42 16 A20 30 0 0 0 42 76 A20 30 0 0 0 42 16 M42 16 L42 76 M19.6 26 A22.4 3.5 0 0 0 64.4 26 M13.7 36 A28.3 3.5 0 0 0 70.3 36 M12 46 A30 3.5 0 0 0 72 46 M13.7 56 A28.3 3.5 0 0 0 70.3 56 M19.6 66 A22.4 3.5 0 0 0 64.4 66" stroke={BONE} strokeWidth="1" opacity="0.13" />
    <circle cx="42" cy="46" r="30" stroke={FACET} strokeWidth="1.2" />
    <path d="M13 53.8 A30 30 0 0 1 49.8 17" stroke={GOLD} strokeWidth="3" />
    <circle cx="30.5" cy="31" r="3.2" fill={BONE} opacity="0.85" />
    <circle cx="37" cy="26.5" r="1.4" fill={BONE} opacity="0.6" />
    <path d="M18 84 L66 84 L56.5 186 Q55.5 194 42 194 Q28.5 194 27.5 186 Z" fill={BODY} />
    <path d="M18 84 L31 84 L35 193.4 Q29 192 27.5 186 Z" fill={FACET} opacity="0.9" />
    <path d="M54 84 L66 84 L56.5 186 Q56 191 51 193 Z" fill={INK} opacity="0.8" />
    <path d="M18.5 86 L27.8 184" stroke={GOLD} strokeWidth="2" opacity="0.8" />
    <rect x="38" y="104" width="8" height="17" rx="3" fill={INK} />
    <circle cx="42" cy="109" r="1.6" fill={GOLD} opacity="0.8" />
    <path d="M30 186 Q42 190 54 186" stroke={COPPER} strokeWidth="1.4" opacity="0.55" />
    <rect x="15" y="74" width="54" height="10" rx="5" fill={COPPER} />
    <path d="M55 74 L64 74 Q69 74 69 79 Q69 84 64 84 L55 84 Z" fill={EMBER} />
    <rect x="19" y="75.5" width="24" height="2.6" rx="1.3" fill={GOLD} opacity="0.9" />
  </>
);

/** Kabuki-style makeup brush: bronze-dipped tapered head, gold ferrule, slim handle, a little loose powder. */
const BRUSH = (
  <>
    <path d="M20 88 C13 76 6 62 7 46 C7.5 24 17 7 30 7 C43 7 52.5 24 53 46 C54 62 47 76 40 88 Z" fill={BODY} />
    <path d="M11.1 70 C8.2 62.6 6.5 54.6 7 46 C7.5 24 17 7 30 7 C43 7 52.5 24 53 46 C53.5 54.6 51.8 62.6 48.9 70 Q30 76 11.1 70Z" fill={EMBER} opacity="0.95" />
    <path d="M6.9 50 C6.9 48.7 6.9 47.3 7 46 C7.5 24 17 7 30 7 C43 7 52.5 24 53 46 C53.1 47.3 53.1 48.7 53.1 50 Q30 56 6.9 50Z" fill={COPPER} />
    <path d="M9.4 29 C13.1 15.8 20.6 7 30 7 C39.4 7 46.9 15.8 50.6 29 Q30 34 9.4 29Z" fill={GOLD} opacity="0.95" />
    <ellipse cx="22.5" cy="21" rx="5" ry="8.5" fill={BONE} opacity="0.35" transform="rotate(28 22.5 21)" />
    <path d="M25 86 Q20 62 15 34 M30 86 L30 40 M35 86 Q40 62 45 34 M22 82 Q13 60 10.5 40 M38 82 Q47 60 49.5 40 M27.5 86 Q25.5 60 22.5 26 M32.5 86 Q34.5 60 37.5 26" stroke={INK} strokeWidth="1" opacity="0.22" />
    <path d="M9.6 33 L7.4 30.4 M13.4 23.4 L11.4 20.6 M19.4 14.6 L18 11.4 M26.4 9.2 L25.8 6 M33.6 9.2 L34.2 6 M40.6 14.6 L42 11.4 M46.6 23.4 L48.6 20.6" stroke={GOLD} strokeWidth="1" opacity="0.55" />
    <path d="M20 88 C13 76 6 62 7 46 C7.5 24 17 7 30 7" stroke={GOLD} strokeWidth="1.8" opacity="0.75" />
    <rect x="18.5" y="83.5" width="23" height="3.5" rx="1.5" fill={GOLD} />
    <path d="M19 87 L41 87 L38.2 117 L21.8 117 Z" fill={COPPER} />
    <path d="M34.5 87 L41 87 L38.2 117 L33.5 117 Z" fill={EMBER} />
    <path d="M22.5 87 L27 87 L26.4 117 L23.4 117 Z" fill={GOLD} />
    <path d="M24.6 89 L24.3 115" stroke={BONE} strokeWidth="1" opacity="0.85" />
    <path d="M19.6 92 L40.4 92 M21.2 111 L38.8 111" stroke={EMBER} strokeWidth="1.2" opacity="0.9" />
    <path d="M21.8 117 L38.2 117 L33.6 190 Q33.2 195 30 195 Q26.8 195 26.4 190 Z" fill={BODY} />
    <path d="M21.8 117 L27.5 117 L28.3 194.6 Q26.7 193.5 26.4 190 Z" fill={FACET} />
    <path d="M22.3 119 L26.7 189" stroke={GOLD} strokeWidth="1.2" opacity="0.6" />
    <path d="M23.9 150 L36.1 150 L35.9 154 L24.1 154 Z" fill={COPPER} opacity="0.75" />
    <circle cx="50" cy="13" r="1.4" fill={GOLD} opacity="0.7" />
    <circle cx="55" cy="24" r="1" fill={COPPER} opacity="0.6" />
    <circle cx="9" cy="15" r="1.1" fill={GOLD} opacity="0.5" />
    <circle cx="45" cy="4.5" r="0.8" fill={BONE} opacity="0.5" />
  </>
);

/** An editor's timeline: ruler, gold and copper video clips, teal audio with waveforms, the playhead. */
const TIMELINE = (
  <>
    <rect x="11" y="24" width="294" height="160" rx="16" fill={INK} />
    <rect x="8" y="18" width="294" height="160" rx="16" fill={BODY} />
    <rect x="16" y="26" width="278" height="144" rx="10" fill={INK} />
    <path d="M8 162 L8 34 Q8 18 24 18 L286 18" stroke={GOLD} strokeWidth="2.4" opacity="0.9" />
    <path d="M16 46 L16 36 Q16 26 26 26 L284 26 Q294 26 294 36 L294 46 Z" fill={FACET} opacity="0.55" />
    <path d="M24 34 L24 46 M32 41 L32 46 M40 41 L40 46 M48 41 L48 46 M56 34 L56 46 M64 41 L64 46 M72 41 L72 46 M80 41 L80 46 M88 34 L88 46 M96 41 L96 46 M104 41 L104 46 M112 41 L112 46 M120 34 L120 46 M128 41 L128 46 M136 41 L136 46 M144 41 L144 46 M152 34 L152 46 M160 41 L160 46 M168 41 L168 46 M176 41 L176 46 M184 34 L184 46 M192 41 L192 46 M200 41 L200 46 M208 41 L208 46 M216 34 L216 46 M224 41 L224 46 M232 41 L232 46 M240 41 L240 46 M248 34 L248 46 M256 41 L256 46 M264 41 L264 46 M272 41 L272 46 M280 34 L280 46 M288 41 L288 46" stroke={BONE} strokeWidth="1" opacity="0.28" />
    <path d="M16 77 L294 77 M16 104 L294 104 M16 133 L294 133 M16 161 L294 161 M36 46 L36 170" stroke={BODY} strokeWidth="1" />
    <path d="M22 60 h8 v8 h-8 Z M22 86 h8 v8 h-8 Z M22 115 h8 v8 h-8 Z M22 143 h8 v8 h-8 Z" fill={FACET} />
    <rect x="58" y="54" width="70" height="20" rx="3" fill={GOLD} opacity="0.9" />
    <rect x="196" y="54" width="64" height="20" rx="3" fill={COPPER} opacity="0.85" />
    <rect x="40" y="80" width="88" height="20" rx="3" fill={COPPER} />
    <rect x="131" y="80" width="76" height="20" rx="3" fill={GOLD} />
    <rect x="210" y="80" width="76" height="20" rx="3" fill={EMBER} />
    <rect x="40" y="108" width="120" height="22" rx="3" fill={TEAL} opacity="0.7" />
    <rect x="164" y="108" width="122" height="22" rx="3" fill={TEAL_DEEP} opacity="0.95" />
    <rect x="84" y="136" width="150" height="22" rx="3" fill={TEAL_DEEP} opacity="0.75" />
    <path d="M76 58 L76 73 M94 58 L94 73 M112 58 L112 73 M214 58 L214 73 M232 58 L232 73 M250 58 L250 73 M58 84 L58 99 M76 84 L76 99 M94 84 L94 99 M112 84 L112 99 M149 84 L149 99 M167 84 L167 99 M185 84 L185 99 M228 84 L228 99 M246 84 L246 99 M264 84 L264 99" stroke={INK} strokeWidth="1.2" opacity="0.22" />
    <path d="M63 61 L87 61 M201 61 L223.4 61 M45 87 L69 87 M136 87 L160 87 M215 87 L239 87" stroke={INK} strokeWidth="2.2" opacity="0.45" />
    <path d="M61 55 L125 55 M199 55 L257 55 M43 81 L125 81 M134 81 L204 81 M213 81 L283 81 M43 109 L157 109 M167 109 L283 109 M87 137 L231 137" stroke={BONE} strokeWidth="1" opacity="0.35" />
    <path d="M45 114.1 L45 123.9 M49 115.1 L49 122.9 M53 116.4 L53 121.6 M57 117.2 L57 120.8 M61 116.9 L61 121.1 M65 115.7 L65 122.3 M69 114.4 L69 123.6 M73 113.8 L73 124.2 M77 114.7 L77 123.3 M81 117.1 L81 120.9 M85 114.4 L85 123.6 M89 111.9 L89 126.1 M93 111 L93 127 M97 112.1 L97 125.9 M101 114.8 L101 123.2 M105 116.5 L105 121.5 M109 114 L109 124 M113 113.1 L113 124.9 M117 113.7 L117 124.3 M121 115.2 L121 122.8 M125 116.8 L125 121.2 M129 117 L129 121 M133 117 L133 121 M137 115.9 L137 122.1 M141 115 L141 123 M145 115.2 L145 122.8 M149 116.8 L149 121.2 M153 115.1 L153 122.9 M169 112.5 L169 125.5 M173 114.5 L173 123.5 M177 116.9 L177 121.1 M181 113.7 L181 124.3 M185 111.6 L185 126.4 M189 111.4 L189 126.6 M193 113 L193 125 M197 115.7 L197 122.3 M201 116.4 L201 121.6 M205 115 L205 123 M209 115 L209 123 M213 116 L213 122 M217 117.1 L217 120.9 M221 117.1 L221 120.9 M225 116.6 L225 121.4 M229 115 L229 123 M233 113.5 L233 124.5 M237 113.2 L237 124.8 M241 114.5 L241 123.5 M245 117.1 L245 120.9 M249 114.2 L249 123.8 M253 111.7 L253 126.3 M257 111 L257 127 M261 112.3 L261 125.7 M265 115 L265 123 M269 116.5 L269 121.5 M273 114.4 L273 123.6 M277 113.7 L277 124.3 M281 114.5 L281 123.5 M89 143.5 L89 150.5 M93 141.1 L93 152.9 M97 139.6 L97 154.4 M101 139.9 L101 154.1 M105 142 L105 152 M109 145.2 L109 148.8 M113 142 L113 152 M117 140.1 L117 153.9 M121 140.1 L121 153.9 M125 141.6 L125 152.4 M129 143.8 L129 150.2 M133 144.8 L133 149.2 M137 144 L137 150 M141 144.5 L141 149.5 M145 145 L145 149 M149 144.3 L149 149.7 M153 144.7 L153 149.3 M157 144.2 L157 149.8 M161 142.1 L161 151.9 M165 140.4 L165 153.6 M169 140.2 L169 153.8 M173 141.8 L173 152.2 M177 144.8 L177 149.2 M181 142.3 L181 151.7 M185 140 L185 154 M189 139.4 L189 154.6 M193 140.6 L193 153.4 M197 143.1 L197 150.9 M201 144.9 L201 149.1 M205 143.3 L205 150.7 M209 143.1 L209 150.9 M213 143.9 L213 150.1 M217 145 L217 149 M221 145 L221 149 M225 144.8 L225 149.2 M229 143.2 L229 150.8" stroke={BONE} strokeWidth="1.3" opacity="0.45" />
    <rect x="44" y="163" width="110" height="4" rx="2" fill={FACET} />
    <rect x="165" y="30" width="6" height="136" rx="3" fill={GOLD} opacity="0.14" />
    <path d="M168 40 L168 166" stroke={GOLD} strokeWidth="2" />
    <path d="M161.5 28 L174.5 28 Q176 28 176 29.5 L176 35 L168 42 L160 35 L160 29.5 Q160 28 161.5 28 Z" fill={GOLD} />
    <path d="M163 31 L170 31" stroke={BONE} strokeWidth="1.2" opacity="0.7" />
  </>
);

const ART: Record<GearKind, ReactElement> = {
  camera: CAMERA,
  lens: LENS,
  cinema: CINEMA,
  gimbal: GIMBAL,
  light: LIGHT,
  mic: MIC,
  brush: BRUSH,
  timeline: TIMELINE,
};

export function GearArt({ kind, className = '' }: { kind: GearKind; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox={VIEW[kind]}
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      {ART[kind]}
    </svg>
  );
}
