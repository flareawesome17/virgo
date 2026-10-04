import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MAP_LEVELS } from '@/components/story/data/ph-map.generated';
import type { MapLayerLevel } from '@/components/story/sky/map-layer';
import { MEDIA } from '@/components/story/media.generated';
import { LabBoundary } from './lab-boundary';
import { SkyLab } from './sky-lab';

/**
 * The 3D sky engine, scroll-driven: the descent, Virgo from Earth, the crane up.
 *
 * Three of the page's scenes on one camera (the Prologue descent onto Cebu
 * City, Ch3's "from where you stand", Ch8's crane up over the archipelago),
 * with the engine's frame cost on screen and a benchmark. Development only.
 */
export const metadata: Metadata = {
  title: 'Story lab · Sky',
  robots: { index: false, follow: false },
};

/**
 * CSS px per map unit each level's <img> is laid out at: about the middle of
 * its zoom range, capped so no layer passes about 2,100 px a side. The
 * browser rasterises each once at that size (will-change), so the top of a
 * range is a little soft, which a faint land fill hides, and no layer costs a
 * phone tens of megabytes.
 */
const LAYOUT_SCALE: Record<(typeof MAP_LEVELS)[number]['id'], number> = { archipelago: 1.6, visayas: 6, cebu: 16, radar: 48 };

/**
 * The level metadata is read here, on the server, and handed to the client
 * as plain props: ph-map.generated.ts also carries the land outline (about
 * 10 KB gzip), which the page must never ship. The SVG URLs are the hashed
 * files publish.mjs writes (media.generated.ts).
 */
const MAP_SRC: Record<(typeof MAP_LEVELS)[number]['id'], string> = {
  archipelago: MEDIA.mapArchipelago.url,
  visayas: MEDIA.mapVisayas.url,
  cebu: MEDIA.mapCebu.url,
  radar: MEDIA.mapRadar.url,
};

const LEVELS: MapLayerLevel[] = MAP_LEVELS.map((l) => ({
  id: l.id,
  src: MAP_SRC[l.id],
  box: l.bbox,
  toleranceKm: l.toleranceKm,
  scale: LAYOUT_SCALE[l.id],
}));

export default function SkyLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <LabBoundary>
      <SkyLab levels={LEVELS} />
    </LabBoundary>
  );
}
