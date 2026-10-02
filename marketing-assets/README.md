# marketing-assets

The asset pipeline for the virgo.ph story site. Nothing here is deployed: it
produces files that `scripts/publish.mjs` copies into `web/public/redesign/`
with content-hashed names, plus the generated data modules under
`web/src/components/story/data/`.

It is its own package (own `package.json` and lockfile) because the web app
should not carry Remotion, mapshaper or sharp. Everything shares the story's
data by relative import from `../web/src/components/story/data/`, so the
videos, the stills and the page tell the same numbers.

| What | Command |
| --- | --- |
| Install | `npm i --loglevel=error` |
| The 71 Nearby cities, projected | `node scripts/build-cities.mjs` (`--check` to verify) |
| Philippines map levels (geoBoundaries, CC BY 3.0 IGO) | `node scripts/build-ph-map.mjs` (`--check`) |
| Grain tile | `node scripts/build-grain.mjs` |
| Virgo constellation data | `node scripts/build-constellation.mjs` |
| Remotion Studio | `npm run dev` |

Remotion is free for individuals and companies of up to three people; larger
companies need a Remotion Company Licence before rendering commercial assets.

Every asset, its source, licence and size is documented in
[`docs/redesign/03-assets.md`](../docs/redesign/03-assets.md).
