# Virgo story site — Phase 3 assets

Every asset was made from code, data or Remotion: no screenshots, no stock imagery, no people, no client work. The honesty rules are in [02-storyboard.md §1.10](02-storyboard.md).

## Where things live

| Path | What |
|---|---|
| `web/src/components/story/data/` | Zero-import data shared by the page, the scripts and Remotion |
| `web/src/components/story/sky/`, `svg/` | The 3D sky engine and the static SVG pieces |
| `web/src/components/story/frames/`, `mocks/` | Device frames and 3D slabs; the app-UI mocks |
| `web/public/redesign/` | Published media, content-hashed, cached for a year (`/redesign/*`) |
| `web/src/components/story/media.generated.ts` | The manifest of published URLs; nothing types a path |
| `marketing-assets/` | Scripts and Remotion (not deployed); `out/` is gitignored |
| `web/src/app/(marketing)/story-lab/` | Dev-only lab for every asset (production 404s) |

## A — Data
| ID | File | Made by | Source and licence |
|---|---|---|---|
| A1 | `data/story.ts` | Hand-written | The story: cast (invented, first names), calendar, `NOW` per chapter, the Nearby roster (counts derived), album and storage arithmetic |
| A2 | `data/constellation.ts` | `scripts/build-constellation.mjs` | Virgo's 14 stars, with J2000 positions, V magnitudes and Hipparcos (van Leeuwen 2007) distances via SIMBAD; IAU / Sky & Telescope figure |
| A3 | `data/ph-map.generated.ts` + `assets/map/*.svg` | `scripts/build-ph-map.mjs` (mapshaper) | geoBoundaries gbOpen PHL ADM0 (NAMRIA/PSA via OCHA HDX), **CC BY 3.0 IGO**, simplified, Kalayaan cropped. Credit line in the footer. |
| A4 | `sky/sky-seed.ts`, `sky/clusters.generated.ts` | Code; `sky/check-seed.mjs --write` | Seeded (mulberry32 `0x56495247`); clusters land-tested |
| A5 | `data/projection.ts`, `data/cities.generated.ts` | `scripts/build-cities.mjs` | Transverse Mercator (checked against proj4 to < 1 cm); the app's 71 Nearby cities |
| — | `data/strings/*.ts` | Per chapter | Every UI string copied from the app, each with the source file it proves against |

## B — Code-drawn
- **B1** — the sky engine (`sky/`): a perspective star cloud with a 3D camera on one canvas, the map plane via `matrix3d`, pause and auto-degrade.
- **B5–B6** — map layers and the static SVGs: StarStop, MiniFigure, ConstellationChart, RadarStatic, LinkStreak.
- **B7–B9** — Plates (abstract photo tiles), initials avatars, device frames and Slabs.
- **B10** — about 40 app-UI mocks across Ch1–Ch8, each with every state and `data-part` hooks for Phase 4.
- **B11–B13** — the star full stop and progress figure; lucide icons; the existing logo.

## C — Published media (`web/public/redesign/`)
| Asset | Size | Budget |
|---|---|---|
| Sky poster, mobile 720×1560 (AVIF / WebP) | 13.4 / 14.2 KB | ≤ 25 KB |
| Sky poster, desktop 1920×1080 (AVIF / WebP) | 15.7 / 17.8 KB | ≤ 45 KB |
| Ch8 clusters, mobile / desktop (AVIF) | 14.9 / 26.2 KB | — |
| Cebu lens 960×960 (AVIF) | 33.8 KB | — |
| Hero loop 1280×720, 12 s seamless (WebM VP9 / MP4 H.264) | 344 / 656 KB | ≤ 450 / 750 KB |
| Hero poster (AVIF / WebP / JPG) | 12 / 11 / 28 KB | — |
| OG video 1200×630, 10 s (MP4 / WebM) | 374 / 152 KB | ≤ 1 MB |
| Map levels: archipelago, Visayas, Cebu, radar (SVG) | 25 / 31 / 23 / 13 KB raw | — |
| Grain tile 160×160 | 5.0 KB | ≤ 6 KB |

**Not published:**
- the OG card JPEG (`marketing-assets/out/og/opengraph-image.jpg`, 34 KB, wired in Phase 4);
- the reel master (`marketing-assets/out/reel/virgo-reel-master.mp4`, 28 s, 1080×1920, 14.5 MB). The reel is for uploading to social platforms and is kept out of git.

## Regenerate
```
cd marketing-assets
npm i --loglevel=error
node scripts/build-cities.mjs && node scripts/build-ph-map.mjs && node scripts/build-grain.mjs
node scripts/build-constellation.mjs
node scripts/render-all.mjs        # Remotion stills, hero loop, OG, reel masters
node scripts/encode.mjs            # web encodes and posters
node scripts/publish.mjs           # hashed files + media.generated.ts
```

## Checks (run from the repo root)
```
node --experimental-strip-types scripts/check-story.mjs
node --experimental-strip-types web/src/components/story/sky/check-seed.mjs
node --experimental-strip-types web/src/components/story/sky/check-engine.mjs
```
