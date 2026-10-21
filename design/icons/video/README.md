# Virgo video icon

The Virgo mark with a play badge, for anywhere Virgo needs to say "video".

| File | Use |
| --- | --- |
| `virgo-video.svg` | The master. 48 px and up. |
| `virgo-video-small.svg` | 16–32 px: a bigger badge, and a ramp that stops at red. |
| `virgo-video-{1024,512,192,64}.png` | Exported from the master. |
| `virgo-video-small-{32,16}.png` | Exported from the small version. |
| `preview.png` | Both versions at 16–192 px on the light and dark backgrounds. |

## Where the apps use it

Films no longer get a poster frame when they are uploaded, so this icon is
what a film shows in an album. Each app has its own copy:

- `web/public/video-thumbnail.svg` — the master SVG as it is.
- `mobile/assets/video-thumbnail.png` — the master at 256 px.
- `api/src/albums/share/client-film-icon.ts` — the master SVG as a base64
  data URI, for the client delivery page.

After editing the master, update all three.

## Where it comes from

- **Geometry.** The repo has no vector logo, so the four blades are traced from
  `mobile/assets/splash-icon.png`. The traced shape covers the same pixels as
  the original to 98%.
- **Colour.** `design/tokens.json` doesn't hold the logo's colours, so the flame
  ramp is sampled from the same PNG. The play triangle is `primaryForeground`
  (#FFFFFF). It was checked on `light.background` (#FFF8F4) and `dark.background`
  (#161311).

## Notes

- The background is transparent. An App Store or Play Store icon needs an
  opaque tile, and none is included here.
- Every part of the master is within 482 units of the centre, so a circular
  avatar crop keeps all of it. The small version fills the square, so a
  circular crop will clip it.
- The small version stops the ramp at red (#B8171D). The master's crimson base
  (#5E0E19) has about 1.3:1 contrast on the dark background and disappears at
  small sizes.
- To edit the colours, change a hex value everywhere it appears. Each gradient
  repeats the same stops so the file works in tools that don't support gradient
  `href`. Re-export the PNGs after any edit.
