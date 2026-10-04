# Virgo story site — Phase 4 build plan

Date: 2026-10-04. It implements [02-storyboard.md](02-storyboard.md) with the assets in [03-assets.md](03-assets.md).

Decisions in force (owner, 2026-10-02/04):
- Story defaults: keep "and get paid", first names only, dimmed "Soon" prices, support@ as the one contact address, Kalayaan cropped.
- iOS is "public soon": it stays in the JSON-LD; no store link until the listing is live.
- **The whole page is 3D** (§1.13), with "lots of animation, beautiful and smooth".
- **Marketing gets its own root layout.** Done on `redesign/prereqs`.
- Remotion's free licence applies (three people or fewer).

## 0. Branches
- `redesign/prereqs` (three commits on origin/main):
  - the public site's own root layout (landing modern JS ~247 → ~169 KB gz, with the *old* page);
  - landing on ISR (static, `s-maxage=3600`, launch catalogue at build, throw at runtime);
  - immutable caching for `/redesign/*`, and the desktop staging skipping `public/redesign`.
- `redesign/story-site` merges `redesign/prereqs` once Phase 3 is committed, then builds the page.
- Nothing is pushed, merged to main or deployed without the owner.

## 1. Architecture
```
(marketing)/layout.tsx            root: html.dark, fonts, VisitBeacon, metadata
(marketing)/landing/page.web.tsx  server: <StoryPage plans={await fetchPlans()} />
components/story/page/
  story-page.tsx         server — the whole page, static and complete (the reduced/no-JS page)
  pre-paint.ts           inline script string: sets <html data-motion="on|off" data-paused data-lite>
  motion-root.tsx        'use client' — LazyMotion(domMin, async) + prefs context; mounts nothing else
  chapter.tsx            server — <section id data-tone data-chapter> + static figure + copy slots
  stage-island.tsx       'use client' — attaches to a chapter's figure (enhance in place), owns useScroll
  offsets.ts             the per-pattern scroll offsets (§1.2) + dev range assertion
  sky-stage.tsx          server wrapper: map levels (server-only data) → <SkyCanvas> client
  nav/                   StoryHeader, ChaptersMenu, PauseToggle, MiniProgress, MobileProgress
  chapters/              prologue.tsx, ch1.tsx … finale.tsx, faq.tsx, footer.tsx (server)
  islands/               prologue-stage.tsx, ch1-stage.tsx … (client, one per animated chapter)
data/strings/page.ts     every page-authored line (H1/H2/H3, bodies, captions, footnotes, FAQ)
```

**The rules** (from storyboard §1, made concrete):
1. **The server render is the base.**
   - Each chapter renders its final, static state: mocks in their resting state, the reduced-motion figures, real text.
   - Copy never sits in an opacity-0 reveal. The H1 is visible at first paint (LCP).
2. **The motion gate.** `pre-paint.ts` runs before first paint and writes `data-motion`. It is `on` only when all of these hold:
   - `(prefers-reduced-motion: no-preference) and (min-height: 520px)`;
   - no Save-Data;
   - JS is running.

   `data-paused` comes from storage, which is wrapped in try/catch. `data-lite` comes from Save-Data, 2g/3g or deviceMemory ≤ 2. CSS shows the static or live figure variants off these attributes.
3. **Stages enhance in place.**
   - An island receives its chapter's DOM (by ref or `data-chapter` id) and drives existing `data-part` elements: transform/opacity through `useTransform` transform strings, and `data-beat`/`data-on`/`data-state` flips via `useMotionValueEvent`.
   - Counters are written through refs. Mock markup is never re-rendered on the client.
   - If the chapter is in view when its island attaches, the island seeds progress from `getBoundingClientRect`, dips the figure to opacity 0 over 120 ms, applies the state, and fades back over 200 ms.
4. **Lifecycle.**
   - One page observer tracks the current chapter. Islands mount when they come within 150% of the viewport.
   - `useScroll` lives in the current chapter ± 1 only (≤ 3 subscriptions).
   - Stages more than 3 viewports away unmount.
   - Runtime flips (OS setting, rotation across 520 px) re-anchor on the topmost shared copy block.
5. **Sky.**
   - One `SkyStage`, fixed, a sibling of the chapters. Islands of sky chapters publish `SkyFrame`s into one MotionValue (scenes and rigs from `sky/scenes.ts` and `camera.ts`; timings as in `story-lab/sky/choreography.ts`).
   - Map levels come from the server (`ph-map.generated.ts` never reaches the client). URLs come from `media.generated.ts`.
6. **Pause** freezes self-running motion only: twinkle, the role tour, the hero video, the Ch4 rings, Ch9 tile plays and the Finale pulse. Layout and scroll-linked motion are unchanged.
7. **Copy.** Every page-authored string lives in `strings/page.ts`, so `check-story` lints it (banned words) and the FAQ array feeds the FAQ and the JSON-LD.
8. **3D (§1.13).** Every phone and card sits in a frames `Slab`, with one `Perspective` per stage. Rest poses render on the server; scroll drives rotate/translateZ within the limits (18° desktop, 10° mobile). Copy faces the reader before it's read.

## 2. Chapter → assets map

Every chapter's spec is in the storyboard (beats, copy, mobile, reduced motion, assets).

| Chapter | Pattern | Island drives | Mocks / pieces |
|---|---|---|---|
| Prologue | sky-is-the-pin (mobile), short pin (desktop) | camera descent (choreography `prologue`), H1 star detaches (desktop), role tour (time-based, once) | SkyStage, StarStop, poster, C1 loop (desktop) |
| Ch1 | sticky figure | card fan depth, unread counter, freeze overlay, form fill states, Post it press, star rise | ChatCardStack, JobPostForm, PhoneFrame, LockScreen |
| Ch2 | sky-is-the-pin (mobile), sticky panel (desktop) | rings 5→25 km (engine), panel `data-on` NEAR flip, counts, erase in one frame, LocationCard 2 frames; demo radios | NearbyPhone/Panel, LocationCard, RadarStatic (reduced/demo) |
| Ch3 | sky + sheet (mobile), sticky panel (desktop) | threads arrive (engine `threads`), Accept presses, HiredTermsCard states, booking badge flip, thread bubbles, deep-sky morph to Virgo (choreography `ch3`), star labels | ApplicantRow, HiredTermsCard, BookingBadge, GroupThread, ConstellationChart (reduced) |
| Ch4 | sticky figure | stars → grid, Who's coming slot reorder (`data-slot`), 6:30→6:00 roll, notification fan, ReminderSheet, lock screen ring, copper horizon | MonthGrid, EventDetail, NotificationRow, ReminderSheet, EmailSubjectChip, LockScreen |
| Ch5 | full-stage pin | time-of-day layers, chip steps, bloom, "Saturday.", sun sinks, crest, gold threads + tile flights (engine), album resolve, activity rows, meter `scaleX` | DeviceChip, Album*, FilmTile, ActivityFeed, StorageMeter, Viewfinder |
| Ch6 | sticky figure on paper | link fold → streak, dialog/sheet ticks, client page open, tile sharpen, hearts → picks bar → Send again, rescope, kind tabs, film poster, Recordings dock; hearts demo | ShareDialog, ShareSheet/LinkReadyAlert, ClientGalleryPage, LinkStreak |
| Ch7 | sticky figure | day counter, ruler marks fade, tile → particles (engine), notices, meter drain, empty album | RetentionField, DayRuler, NotificationRow, StorageMeter, AlbumCard |
| The work | entry-triggered | card rise, note mask, tags | ShowcaseCard |
| Ch8 | sky-is-the-pin (mobile), short pin (desktop) | crane up (choreography `ch8`), cluster wave, marquee (scroll), profile tag | ProfileTag, RoleMarquee, clusters still (reduced) |
| Ch9 | entry-triggered | tile micro-animations once at 60% visibility; replay on hover/focus (desktop) | mini mocks |
| Ch10 | entry once | Free star ignites | pricing from `/plans` |
| Finale | entry once | pan to Syrma, ignition, ζ–ι/ι–μ edges, role picker rays | MiniFigure, ConstellationChart |

## 3. Work split (Phase 4)

| Step | Who | What |
|---|---|---|
| 1 | orchestrator | Merge prereqs; scaffold `page/` (pre-paint, motion-root, chapter, stage-island, offsets, sky-stage, nav, `strings/page.ts` skeleton, story-page with every chapter as a static stub). Commit. |
| 2 | 6 builders in parallel, each owning its chapters' `chapters/`, `islands/` and `strings/page.ts` *section file* | B1 Prologue+Ch1 · B2 Ch2+Ch3 · B3 Ch4+Ch5 · B4 Ch6+Ch7 · B5 The work+Ch8+Ch9 · B6 Ch10+Finale+FAQ+footer+SEO (JSON-LD, sitemap, OG wiring) |
| 3 | integrator | Wire the nav, progress, Pause, anchors and the hand-offs between chapters; tune the sky frames across seams; budgets. |
| 4 | Phase 5 | Design QA at 375 / 768 / 1440, two passes, Lighthouse, the reduced-motion pass. |

To avoid edit collisions, `strings/page.ts` is split into `strings/page/<chapter>.ts` files that `page.ts` re-exports.

## 4. Measures of done
- **Copy:** every storyboard line is real DOM text, with one H1 and no skipped levels; check-story passes, including the page strings.
- **Links:** all kept (sign-in, sign-up, app, terms, privacy, support@, download); metadata, canonical and OG intact or improved; JSON-LD is valid.
- **Performance** (§1.12):
  - LCP ≤ 2.0 s on mobile slow 4G; CLS ≤ 0.02; INP ≤ 150 ms.
  - Critical JS ≤ 165 KB gz, measured from `.next/server/app/landing.html` (modern scripts only).
  - No full-layer repaint per scroll frame.
- **Accessibility:**
  - Reduced motion is the static page and still beautiful.
  - Keyboard path and visible focus work; nothing is hidden under the header (scroll-padding).
  - Pause stops self-running motion; AA contrast throughout.
- **Mobile first:** 375 is the reference; there is no horizontal scroll; tap targets are ≥ 44 px.
